import { createHash } from "node:crypto";
import type {
  CreateEmergencyAlertInput,
  CreateEmergencyReportInput,
  EmergencyAlert,
  EmergencyReport,
  SafetyCheckIn,
} from "@smart-campus/contracts";
import { createServiceClient } from "../supabase/server";

export interface EmergencyIdentity {
  userId: string;
  fullName: string;
  profileId?: string;
}

export interface EmergencyRepository {
  listReports(identity: EmergencyIdentity, canViewAll: boolean): Promise<EmergencyReport[]>;
  getReport(reportId: string): Promise<EmergencyReport | null>;
  listAlerts(): Promise<{ alerts: EmergencyAlert[]; active: EmergencyAlert[] }>;
  createReport(input: CreateEmergencyReportInput, identity: EmergencyIdentity, priority: 1 | 2 | 3 | 4): Promise<EmergencyReport>;
  updateReportStatus(
    reportId: string,
    targetStatus: import("@smart-campus/contracts").EmergencyReportStatus,
    expectedPreviousStatus?: import("@smart-campus/contracts").EmergencyReportStatus,
    actor?: { userId: string; fullName: string },
    note?: string
  ): Promise<EmergencyReport>;
  getReportHistory(reportId: string): Promise<import("@smart-campus/contracts").EmergencyReportHistoryView[]>;
  createAlert(input: CreateEmergencyAlertInput, identity: EmergencyIdentity): Promise<EmergencyAlert>;
  recordCheckIn(input: SafetyCheckIn, identity: EmergencyIdentity): Promise<{ success: boolean; totalSafe: number }>;
}

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex");
const timeBucket = () => Math.floor(Date.now() / 30_000);

function reportFromRow(row: any): EmergencyReport {
  return {
    id: row.id,
    public_ref: row.public_ref,
    type: row.type,
    location_name: row.location_name,
    location_note: row.location_note ?? undefined,
    geo_lat: row.geo_lat ?? undefined,
    geo_lng: row.geo_lng ?? undefined,
    description: row.description,
    priority: row.priority,
    status: row.status,
    reporter_name: row.reporter_name,
    reporter_id: row.reporter_id,
    is_drill: Boolean(row.is_drill),
    created_at: row.created_at,
    resolved_at: row.resolved_at ?? undefined,
  };
}

function alertFromRow(row: any): EmergencyAlert {
  return {
    id: row.id,
    incident_id: row.incident_id ?? undefined,
    kind: row.kind,
    severity: row.severity,
    scope: row.scope,
    title: row.title,
    body: row.body,
    channels: row.channels,
    is_drill: Boolean(row.is_drill),
    status: row.status,
    drafted_by_name: row.drafted_by_name,
    assembly_point: row.assembly_point ?? undefined,
    action_required: row.action_required ?? undefined,
    sent_at: row.sent_at ?? undefined,
    created_at: row.created_at,
  };
}

function throwDatabaseError(operation: string, error: any): never {
  throw new Error(`${operation} failed: ${error?.message || "database error"}`);
}

function isSupabaseConfigured(): boolean {
  if (process.env.CAMPUSGRAM_DEMO_MODE === "true") return false;
  if (process.env.NODE_ENV === "test") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
      key &&
      serviceKey &&
      !url.includes("placeholder") &&
      !key.includes("placeholder") &&
      !serviceKey.includes("placeholder") &&
      !serviceKey.includes("your-supabase-service-role-key") &&
      url.startsWith("http")
  );
}

// In-memory fallback stores for offline local mock development
const inMemoryReports: EmergencyReport[] = [];
const inMemoryAlerts: EmergencyAlert[] = [];
const inMemoryHistory: import("@smart-campus/contracts").EmergencyReportHistoryView[] = [];
const inMemoryCheckIns = new Map<string, "safe" | "need_help">();
let inMemorySequence = 1;

export function createSupabaseEmergencyRepository(): EmergencyRepository {
  if (!isSupabaseConfigured()) {
    return {
      async listReports(identity, canViewAll) {
        return canViewAll
          ? [...inMemoryReports]
          : inMemoryReports.filter((r) => r.reporter_id === identity.userId);
      },

      async getReport(reportId: string) {
        return inMemoryReports.find((r) => r.id === reportId) || null;
      },

      async listAlerts() {
        return {
          alerts: [...inMemoryAlerts],
          active: inMemoryAlerts.filter((a) => a.status === "sent"),
        };
      },

      async createReport(input, identity, priority) {
        const dedupeKey = hashKey([
          identity.userId,
          input.type,
          input.location_name.trim().toLowerCase(),
          input.description.trim().toLowerCase(),
          timeBucket(),
        ].join("|"));

        const existing = inMemoryReports.find((r) => (r as any).dedupe_key === dedupeKey);
        if (existing) return existing;

        const publicRef = `EMR-${new Date().getUTCFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
        const newReport: EmergencyReport = {
          id: `rep-${Date.now().toString(36)}-${inMemorySequence++}`,
          public_ref: publicRef,
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
        (newReport as any).dedupe_key = dedupeKey;
        inMemoryReports.unshift(newReport);
        return newReport;
      },

      async updateReportStatus(reportId, targetStatus, expectedPreviousStatus, actor, note) {
        const report = inMemoryReports.find((r) => r.id === reportId);
        if (!report) {
          throw new Error("Emergency report not found.");
        }

        if (expectedPreviousStatus && report.status !== expectedPreviousStatus) {
          throw new Error(
            `Conflict: Emergency report status changed from '${expectedPreviousStatus}' to '${report.status}'. Please refresh.`
          );
        }

        const fromStatus = report.status;
        report.status = targetStatus;
        const now = new Date().toISOString();
        if (targetStatus === "resolved") {
          report.resolved_at = now;
        }

        if (actor) {
          inMemoryHistory.push({
            id: `hist-${Date.now().toString(36)}-${inMemorySequence++}`,
            report_id: reportId,
            from_status: fromStatus,
            to_status: targetStatus,
            actor_id: actor.userId,
            actor_name: actor.fullName,
            note: note || undefined,
            created_at: now,
          });
        }

        return report;
      },

      async getReportHistory(reportId: string) {
        return inMemoryHistory.filter((h) => h.report_id === reportId);
      },

      async createAlert(input, identity) {
        const dedupeKey = hashKey([
          identity.userId,
          input.kind,
          input.title.trim().toLowerCase(),
          input.body.trim().toLowerCase(),
          timeBucket(),
        ].join("|"));

        const existing = inMemoryAlerts.find((a) => (a as any).dedupe_key === dedupeKey);
        if (existing) return existing;

        const now = new Date().toISOString();
        const newAlert: EmergencyAlert = {
          id: `alt-${Date.now().toString(36)}-${inMemorySequence++}`,
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
          sent_at: now,
          created_at: now,
        };
        (newAlert as any).dedupe_key = dedupeKey;
        inMemoryAlerts.unshift(newAlert);
        return newAlert;
      },

      async recordCheckIn(input, identity) {
        const alert = inMemoryAlerts.find((a) => a.id === input.alert_id && a.status === "sent");
        if (!alert) {
          throw new Error("Active emergency alert not found.");
        }

        checkInKey: `${input.alert_id}:${identity.userId}`;
        inMemoryCheckIns.set(`${input.alert_id}:${identity.userId}`, input.status);

        const totalSafe = [...inMemoryCheckIns.entries()].filter(
          ([key, status]) => key.startsWith(`${input.alert_id}:`) && status === "safe"
        ).length;

        return { success: true, totalSafe };
      },
    };
  }

  return {
    async listReports(identity, canViewAll) {
      const query = createServiceClient().from("emergency_reports").select("*").order("created_at", { ascending: false });
      const { data, error } = canViewAll ? await query : await query.eq("reporter_id", identity.userId);
      if (error) throwDatabaseError("Emergency report lookup", error);
      return (data || []).map(reportFromRow);
    },

    async getReport(reportId: string) {
      const { data, error } = await createServiceClient()
        .from("emergency_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (error) throwDatabaseError("Emergency report retrieval", error);
      return data ? reportFromRow(data) : null;
    },

    async updateReportStatus(reportId, targetStatus, expectedPreviousStatus, actor, note) {
      const client = createServiceClient();

      // Enforce atomic transition via RPC: updates report row and inserts audit history in a single transaction.
      // Non-atomic fallback is prohibited to prevent status updates without verified audit trail.
      const { data: rpcData, error: rpcError } = await client.rpc(
        "transition_emergency_report_status",
        {
          p_report_id: reportId,
          p_target_status: targetStatus,
          p_expected_status: expectedPreviousStatus ?? null,
          p_actor_id: actor?.userId || "system",
          p_actor_name: actor?.fullName || "Authorized Responder",
          p_note: note || null,
        }
      );

      if (rpcError) {
        // Known business logic / state exceptions raised by the RPC
        if (
          rpcError.message.includes("Conflict:") ||
          rpcError.message.includes("not found") ||
          rpcError.message.includes("Invalid status transition")
        ) {
          throw new Error(rpcError.message);
        }
        throwDatabaseError("Emergency report status transition", rpcError);
      }

      if (!rpcData) {
        throw new Error("Emergency report not found.");
      }

      return reportFromRow(rpcData);
    },

    async getReportHistory(reportId: string) {
      const { data, error } = await createServiceClient()
        .from("emergency_report_history")
        .select("id, report_id, from_status, to_status, actor_id, actor_name, note, created_at")
        .eq("report_id", reportId)
        .order("created_at", { ascending: true });

      if (error) {
        // Table might not exist yet if migration pending
        if (error.code === "42P01") return [];
        throwDatabaseError("Emergency report history lookup", error);
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        report_id: row.report_id,
        from_status: row.from_status,
        to_status: row.to_status,
        actor_id: row.actor_id,
        actor_name: row.actor_name ?? undefined,
        note: row.note ?? undefined,
        created_at: row.created_at,
      }));
    },

    async listAlerts() {
      const { data, error } = await createServiceClient()
        .from("emergency_alerts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throwDatabaseError("Emergency alert lookup", error);
      const alerts = (data || []).map(alertFromRow);
      return { alerts, active: alerts.filter((alert) => alert.status === "sent") };
    },

    async createReport(input, identity, priority) {
      const dedupeKey = hashKey([
        identity.userId,
        input.type,
        input.location_name.trim().toLowerCase(),
        input.description.trim().toLowerCase(),
        timeBucket(),
      ].join("|"));
      const client = createServiceClient();
      const { data: existing, error: existingError } = await client
        .from("emergency_reports")
        .select("*")
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();
      if (existingError) throwDatabaseError("Emergency duplicate check", existingError);
      if (existing) return reportFromRow(existing);

      const publicRef = `EMR-${new Date().getUTCFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const { data, error } = await client
        .from("emergency_reports")
        .insert({
          public_ref: publicRef,
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
          reporter_profile_id: identity.profileId,
          is_drill: Boolean(input.is_drill),
          dedupe_key: dedupeKey,
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          const { data: retry } = await client.from("emergency_reports").select("*").eq("dedupe_key", dedupeKey).maybeSingle();
          if (retry) return reportFromRow(retry);
        }
        throwDatabaseError("Emergency report persistence", error);
      }
      return reportFromRow(data);
    },

    async createAlert(input, identity) {
      const dedupeKey = hashKey([
        identity.userId,
        input.kind,
        input.title.trim().toLowerCase(),
        input.body.trim().toLowerCase(),
        timeBucket(),
      ].join("|"));
      const client = createServiceClient();
      const { data: existing, error: existingError } = await client
        .from("emergency_alerts")
        .select("*")
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();
      if (existingError) throwDatabaseError("Emergency broadcast duplicate check", existingError);
      if (existing) return alertFromRow(existing);

      const now = new Date().toISOString();
      const { data, error } = await client
        .from("emergency_alerts")
        .insert({
          kind: input.kind,
          severity: input.severity,
          scope: input.scope,
          title: input.title,
          body: input.body,
          channels: input.channels,
          is_drill: Boolean(input.is_drill),
          status: "sent",
          drafted_by_name: identity.fullName,
          drafted_by_id: identity.userId,
          drafted_by_profile_id: identity.profileId,
          assembly_point: input.assembly_point,
          action_required: input.action_required,
          dedupe_key: dedupeKey,
          sent_at: now,
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          const { data: retry } = await client.from("emergency_alerts").select("*").eq("dedupe_key", dedupeKey).maybeSingle();
          if (retry) return alertFromRow(retry);
        }
        throwDatabaseError("Emergency broadcast persistence", error);
      }
      return alertFromRow(data);
    },

    async recordCheckIn(input, identity) {
      const client = createServiceClient();
      const { data: alert, error: alertError } = await client
        .from("emergency_alerts")
        .select("id")
        .eq("id", input.alert_id)
        .eq("status", "sent")
        .maybeSingle();
      if (alertError) throwDatabaseError("Emergency alert validation", alertError);
      if (!alert) throw new Error("Active emergency alert not found.");

      const { error } = await client.from("emergency_check_ins").upsert({
        alert_id: input.alert_id,
        user_id: identity.userId,
        user_profile_id: identity.profileId,
        status: input.status,
        location_note: input.location_note,
      }, { onConflict: "alert_id,user_id" });
      if (error) throwDatabaseError("Emergency check-in persistence", error);

      const { count, error: countError } = await client
        .from("emergency_check_ins")
        .select("user_id", { count: "exact", head: true })
        .eq("alert_id", input.alert_id)
        .eq("status", "safe");
      if (countError) throwDatabaseError("Emergency check-in count", countError);
      return { success: true, totalSafe: count || 0 };
    },
  };
}
