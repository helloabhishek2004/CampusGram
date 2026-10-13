import { describe, it, expect } from "vitest";
import {
  EmergencyReportSchema,
  EmergencyAlertSchema,
  CreateEmergencyReportInputSchema,
  CreateEmergencyAlertInputSchema,
  SafetyCheckInSchema,
} from "../src/emergency";

describe("Module 4: Emergency Contracts", () => {
  it("validates a valid emergency report", () => {
    const report = {
      id: "er-1",
      public_ref: "ER-2026-001",
      type: "fire",
      location_name: "Library 2nd Floor",
      location_note: "Near west stairwell",
      description: "Smoke detected in server closet on floor 2",
      priority: 1,
      status: "verifying",
      reporter_name: "Abhishek S.",
      is_drill: false,
      created_at: new Date().toISOString(),
    };

    const parsed = EmergencyReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it("validates emergency broadcast alert schema", () => {
    const alert = {
      id: "al-101",
      kind: "alert",
      severity: "critical",
      scope: "campus_wide",
      title: "FIRE ALERT: Library Evacuation",
      body: "Evacuate immediately via nearest designated stairwell. Do not use lifts.",
      channels: ["sms", "push", "siren"],
      is_drill: false,
      status: "sent",
      drafted_by_name: "Chief Security Officer",
      assembly_point: "Main Ground Field A",
      action_required: "Evacuate and proceed to Assembly Point A",
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const parsed = EmergencyAlertSchema.safeParse(alert);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid input when location or body is missing", () => {
    const invalidReport = {
      type: "medical",
      location_name: "", // empty
      description: "Student injured",
    };

    const parsed = CreateEmergencyReportInputSchema.safeParse(invalidReport);
    expect(parsed.success).toBe(false);
  });

  it("validates safety check-in payload", () => {
    const checkin = {
      alert_id: "al-101",
      status: "safe",
      location_note: "Safe at Gate 2",
    };

    const parsed = SafetyCheckInSchema.safeParse(checkin);
    expect(parsed.success).toBe(true);
  });

  it("validates emergency report lifecycle update payload", () => {
    const validUpdate = {
      status: "acknowledged",
      expected_previous_status: "submitted",
      note: "Dispatched officer to investigate",
    };
    const parsed = import("../src/emergency").then((m) => {
      expect(m.UpdateEmergencyReportStatusInputSchema.safeParse(validUpdate).success).toBe(true);
    });

    const invalidUpdate = {
      status: "non_existent_status",
    };
    import("../src/emergency").then((m) => {
      expect(m.UpdateEmergencyReportStatusInputSchema.safeParse(invalidUpdate).success).toBe(false);
    });
  });

  it("validates emergency report history record schema", async () => {
    const { EmergencyReportHistoryViewSchema } = await import("../src/emergency");
    const record = {
      id: "hist-101",
      report_id: "rep-101",
      from_status: "submitted",
      to_status: "verifying",
      actor_id: "actor-1",
      actor_name: "Responder Patel",
      note: "Investigating alarm",
      created_at: new Date().toISOString(),
    };
    expect(EmergencyReportHistoryViewSchema.safeParse(record).success).toBe(true);

    const invalidRecord = {
      id: "hist-102",
      report_id: "rep-101",
      from_status: "invalid_status",
      to_status: "verifying",
      actor_id: "actor-1",
      created_at: new Date().toISOString(),
    };
    expect(EmergencyReportHistoryViewSchema.safeParse(invalidRecord).success).toBe(false);
  });
});
