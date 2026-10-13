import { describe, it, expect } from "vitest";
import { CreateEmergencyAlertInput, CreateEmergencyReportInput, EmergencyAlert, EmergencyReport } from "@smart-campus/contracts";
import { EmergencyService } from "../lib/emergency/emergency-service";
import type { EmergencyIdentity, EmergencyRepository } from "../lib/emergency/emergency-repository";

function testRepository(): EmergencyRepository {
  const alerts: EmergencyAlert[] = [{
    id: "test-alert-1",
    kind: "alert",
    severity: "warning",
    scope: "campus_wide",
    title: "Test alert",
    body: "Test emergency alert for check-in coverage.",
    channels: ["in_app"],
    is_drill: true,
    status: "sent",
    drafted_by_name: "Test Responder",
    created_at: new Date().toISOString(),
  }];
  const reports: EmergencyReport[] = [];
  const history: import("@smart-campus/contracts").EmergencyReportHistoryView[] = [];
  const checkIns = new Map<string, "safe" | "need_help">();
  let sequence = 1;

  return {
    async listReports(identity, canViewAll) {
      return canViewAll ? reports : reports.filter((report) => report.reporter_id === identity.userId);
    },
    async getReport(reportId) {
      return reports.find((report) => report.id === reportId) || null;
    },
    async updateReportStatus(reportId, targetStatus, expectedPreviousStatus, actor, note) {
      const report = reports.find((r) => r.id === reportId);
      if (!report) throw new Error("Emergency report not found.");
      if (expectedPreviousStatus && report.status !== expectedPreviousStatus) {
        throw new Error(`Conflict: Report status changed from '${expectedPreviousStatus}' to '${report.status}'.`);
      }
      const fromStatus = report.status;
      report.status = targetStatus;
      if (targetStatus === "resolved") {
        report.resolved_at = new Date().toISOString();
      }
      if (actor) {
        history.push({
          id: `hist-${sequence++}`,
          report_id: reportId,
          from_status: fromStatus,
          to_status: targetStatus,
          actor_id: actor.userId,
          actor_name: actor.fullName,
          note,
          created_at: new Date().toISOString(),
        });
      }
      return report;
    },
    async getReportHistory(reportId) {
      return history.filter((h) => h.report_id === reportId);
    },
    async listAlerts() {
      return { alerts, active: alerts.filter((alert) => alert.status === "sent") };
    },
    async createReport(input, identity, priority) {
      const duplicate = reports.find((report) => report.reporter_id === identity.userId && report.type === input.type && report.location_name === input.location_name && report.description === input.description);
      if (duplicate) return duplicate;
      const report: EmergencyReport = {
        id: `report-${sequence++}`,
        public_ref: `EMR-2026-${sequence}`,
        type: input.type,
        location_name: input.location_name,
        location_note: input.location_note,
        geo_lat: input.geo_lat,
        geo_lng: input.geo_lng,
        description: input.description,
        priority,
        status: priority === 1 ? "verifying" : "submitted",
        reporter_name: identity.fullName,
        reporter_id: identity.userId,
        is_drill: Boolean(input.is_drill),
        created_at: new Date().toISOString(),
      };
      reports.unshift(report);
      return report;
    },
    async createAlert(input, identity) {
      const duplicate = alerts.find((alert) => alert.drafted_by_name === identity.fullName && alert.title === input.title && alert.body === input.body);
      if (duplicate) return duplicate;
      const alert: EmergencyAlert = {
        id: `alert-${sequence++}`,
        kind: input.kind,
        severity: input.severity,
        scope: input.scope,
        title: input.title,
        body: input.body,
        channels: input.channels,
        is_drill: Boolean(input.is_drill),
        status: "sent",
        drafted_by_name: identity.fullName,
        assembly_point: input.assembly_point,
        action_required: input.action_required,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      alerts.unshift(alert);
      return alert;
    },
    async recordCheckIn(input, identity) {
      if (!alerts.some((alert) => alert.id === input.alert_id && alert.status === "sent")) throw new Error("Active emergency alert not found.");
      checkIns.set(`${input.alert_id}:${identity.userId}`, input.status);
      return {
        success: true,
        totalSafe: [...checkIns.entries()].filter(([key, status]) => key.startsWith(`${input.alert_id}:`) && status === "safe").length,
      };
    },
  };
}

const identity: EmergencyIdentity = { userId: "student-1", fullName: "Test Student" };
const emergencyService = new EmergencyService(testRepository());

describe("Module 4: Emergency Alert System Service", () => {
  it("provides active alerts and emergency hotlines", async () => {
    const active = await emergencyService.getActiveAlerts();
    expect(active).toHaveLength(1);
    expect(emergencyService.getHotlines().length).toBeGreaterThanOrEqual(5);
  });

  it("calculates priority 1 for active fire and smoke threats", async () => {
    const input: CreateEmergencyReportInput = {
      type: "fire", location_name: "Library 2nd Floor", description: "Thick smoke and fire visible near east stairwell", reporter_name: "Client-controlled name must be ignored",
    };
    const report = await emergencyService.createReport(input, identity);
    expect(report.priority).toBe(1);
    expect(report.status).toBe("verifying");
    expect(report.reporter_name).toBe("Test Student");
  });

  it("protects against repeated SOS submissions through the repository", async () => {
    const input: CreateEmergencyReportInput = { type: "medical", location_name: "Hostel Block C", description: "Student needs first aid" };
    const first = await emergencyService.createReport(input, identity);
    const second = await emergencyService.createReport(input, identity);
    expect(second.id).toBe(first.id);
  });

  it("persists an authorized broadcast and prevents duplicate broadcasts", async () => {
    const input: CreateEmergencyAlertInput = {
      title: "TEST DRILL: Evacuate Quadrangle", body: "This is a routine drill exercise. Proceed to Assembly Point A.", severity: "warning", scope: "campus_wide", kind: "alert", channels: ["in_app", "sms", "push"], is_drill: true, assembly_point: "Assembly Point A",
    };
    const first = await emergencyService.broadcastAlert(input, { userId: "staff-1", fullName: "Campus Security Head" });
    const second = await emergencyService.broadcastAlert(input, { userId: "staff-1", fullName: "Campus Security Head" });
    expect(first.status).toBe("sent");
    expect(first.channels).toContain("sms");
    expect(second.id).toBe(first.id);
  });

  it("upserts safety check-ins and counts safe users", async () => {
    const result = await emergencyService.recordSafetyCheckIn({ alert_id: "test-alert-1", status: "safe", user_id: "client-value" }, identity);
    expect(result.success).toBe(true);
    expect(result.totalSafe).toBe(1);
    const updated = await emergencyService.recordSafetyCheckIn({ alert_id: "test-alert-1", status: "need_help", user_id: "another-client-value" }, identity);
    expect(updated.totalSafe).toBe(0);
  });

  it("surfaces persistence failures instead of returning fake success", async () => {
    const failingService = new EmergencyService({
      ...testRepository(),
      createReport: async () => { throw new Error("Emergency report persistence failed: database unavailable"); },
    });
    await expect(failingService.createReport({
      type: "other", location_name: "Library", description: "Database failure test", is_drill: true,
    }, identity)).rejects.toThrow("database unavailable");
  });

  it("rejects check-ins for missing or inactive alerts", async () => {
    await expect(emergencyService.recordSafetyCheckIn({
      alert_id: "missing-alert", status: "safe",
    }, identity)).rejects.toThrow("Active emergency alert not found");
  });

  it("handles valid responder lifecycle transitions from submitted to resolved", async () => {
    const report = await emergencyService.createReport({
      type: "accident",
      location_name: "Workshop Gate",
      description: "Minor bike slip",
    }, identity);
    expect(report.status).toBe("submitted");

    // 1. submitted -> acknowledged
    const ack = await emergencyService.updateReportStatus(report.id, "acknowledged", "submitted");
    expect(ack.status).toBe("acknowledged");

    // 2. acknowledged -> verifying
    const verifying = await emergencyService.updateReportStatus(report.id, "verifying", "acknowledged");
    expect(verifying.status).toBe("verifying");

    // 3. verifying -> verified
    const verified = await emergencyService.updateReportStatus(report.id, "verified", "verifying");
    expect(verified.status).toBe("verified");

    // 4. verified -> resolved
    const resolved = await emergencyService.updateReportStatus(report.id, "resolved", "verified");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_at).toBeDefined();

    // 5. Attempting to transition from terminal 'resolved' should fail
    await expect(
      emergencyService.updateReportStatus(report.id, "verifying")
    ).rejects.toThrow("Invalid status transition from 'resolved' to 'verifying'");
  });

  it("rejects invalid lifecycle jumps (e.g. submitted directly to resolved)", async () => {
    const report = await emergencyService.createReport({
      type: "other",
      location_name: "Hostel B",
      description: "Power cut",
    }, identity);
    expect(report.status).toBe("submitted");

    await expect(
      emergencyService.updateReportStatus(report.id, "resolved")
    ).rejects.toThrow("Invalid status transition from 'submitted' to 'resolved'");
  });

  it("detects and rejects conflicting previous status expectations", async () => {
    const report = await emergencyService.createReport({
      type: "medical",
      location_name: "Gym",
      description: "Sprained ankle",
    }, identity);

    await expect(
      emergencyService.updateReportStatus(report.id, "acknowledged", "verified")
    ).rejects.toThrow("Conflict: Report is currently 'submitted', but 'verified' was expected");
  });

  it("records chronological audit history entries for each successful lifecycle transition", async () => {
    const report = await emergencyService.createReport({
      type: "accident",
      location_name: "Workshop Corridor",
      description: "Minor equipment slip",
    }, identity);
    expect(report.status).toBe("submitted");

    const actor = { userId: "responder-9", fullName: "Security Officer Patel" };

    // 1. First transition with note: submitted -> verifying
    await emergencyService.updateReportStatus(
      report.id,
      "verifying",
      "submitted",
      actor,
      "Evacuated students from corridor"
    );

    // 2. Second transition: verifying -> verified
    await emergencyService.updateReportStatus(
      report.id,
      "verified",
      "verifying",
      actor,
      "Hazmat team on site"
    );

    const history = await emergencyService.getReportHistory(report.id);
    expect(history).toHaveLength(2);
    expect(history[0].from_status).toBe("submitted");
    expect(history[0].to_status).toBe("verifying");
    expect(history[0].actor_id).toBe("responder-9");
    expect(history[0].actor_name).toBe("Security Officer Patel");
    expect(history[0].note).toBe("Evacuated students from corridor");

    expect(history[1].from_status).toBe("verifying");
    expect(history[1].to_status).toBe("verified");
    expect(history[1].note).toBe("Hazmat team on site");
  });
});
