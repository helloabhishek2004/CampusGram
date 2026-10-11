import crypto from "crypto";
import {
  ComplaintRecord,
  CreateComplaintRequest,
  ComplaintAttachment,
  ComplaintLifecycleUpdate,
  ComplaintRecordSchema,
  ComplaintListResponseSchema,
  CreateComplaintResponseSchema,
  SafetyTriageSignalSchema,
  ComplaintStatusHistoryEntry as ComplaintStatusHistoryView,
} from "@smart-campus/contracts";
import { findMatchingCluster, getSimilarityThreshold } from "./similarity-service";
import { createServiceClient } from "../supabase/server";
import { aggregateIncidents, deriveIncidentScope, isActiveIncidentReport } from "./incident-policy";
import { deriveSafetyTriage } from "./safety-triage";

// Fallback in-memory store for offline/local hackathon mock mode
const inMemoryComplaints: ComplaintRecord[] = [
  {
    id: "cmp-seed-001",
    text: "Ceiling fan making strange squeaking noise and wobbling in Room 102.",
    status: "submitted",
    category: "infrastructure",
    subcategory: "electrical",
    location_building: "Block A",
    location_room: "102",
    attachments: [],
    cluster_id: "cluster_fan_102",
    is_emergency: false,
    similar_count: 1,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: "cmp-seed-002",
    text: "Wi-Fi not accessible in Central Library 2nd floor reading hall.",
    status: "in_progress",
    category: "it_services",
    subcategory: "network",
    location_building: "Library",
    location_room: "Reading Hall 2",
    attachments: [],
    cluster_id: "cluster_wifi_lib",
    is_emergency: false,
    similar_count: 2,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: "cmp-seed-003",
    text: "Cannot connect to campus wifi in library second floor.",
    status: "submitted",
    category: "it_services",
    subcategory: "network",
    location_building: "Library",
    location_room: "Reading Hall 2",
    attachments: [],
    cluster_id: "cluster_wifi_lib",
    is_emergency: false,
    similar_count: 2,
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
];

type StoredComplaintStatusHistoryEntry = {
  complaint_id: string;
  from_status: ComplaintRecord["status"];
  to_status: ComplaintRecord["status"];
  actor_id: string;
  note: string | null;
  created_at: string;
};

const inMemoryComplaintStatusHistory: StoredComplaintStatusHistoryEntry[] = [];

// Offline parity only. Configured writes use the DB transaction/advisory lock.
let memoryWriteQueue: Promise<void> = Promise.resolve();
async function serializeMemoryWrite<T>(work: () => Promise<T>): Promise<T> {
  const preceding = memoryWriteQueue;
  let release!: () => void;
  memoryWriteQueue = new Promise<void>((resolve) => { release = resolve; });
  await preceding;
  try { return await work(); } finally { release(); }
}

export class ComplaintSubmissionError extends Error {
  constructor(readonly code: "IDEMPOTENCY_CONFLICT" | "INVALID_REQUEST" | "PERSISTENCE_FAILED") {
    super(code === "IDEMPOTENCY_CONFLICT"
      ? "This submission key was already used for a different complaint."
      : code === "INVALID_REQUEST"
        ? "A valid complaint and authenticated owner are required."
        : "Complaint persistence failed. No success was recorded.");
    this.name = "ComplaintSubmissionError";
  }
}

export class ComplaintLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID_TRANSITION" | "VALIDATION_FAILED" | "PERSISTENCE_FAILED",
  ) {
    super(message);
    this.name = "ComplaintLifecycleError";
  }
}

function isSupabaseConfigured(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes("placeholder") &&
      !key.includes("placeholder") &&
      url.startsWith("http"),
  );
}

/**
 * Maps internal database rows; API projection removes identity/replay metadata.
 */
function mapComplaintRow(row: Record<string, unknown>): ComplaintRecord {
  return {
    id: String(row.id),
    complainant_id: typeof row.complainant_id === "string" ? row.complainant_id : null,
    text: String(row.text || ""),
    status: (row.status || "submitted") as ComplaintRecord["status"],
    category: typeof row.category === "string" ? row.category : null,
    subcategory: typeof row.subcategory === "string" ? row.subcategory : null,
    location_building:
      typeof row.location_building === "string" ? row.location_building : null,
    location_room: typeof row.location_room === "string" ? row.location_room : null,
    attachments: Array.isArray(row.attachments)
      ? (row.attachments as ComplaintAttachment[])
      : [],
    cluster_id: typeof row.cluster_id === "string" && row.cluster_id
      ? row.cluster_id
      : `cluster_${String(row.id)}`,
    is_emergency: Boolean(row.is_emergency),
    similar_count: row.similar_count === undefined ? 0 : Number(row.similar_count),
    incident_scope: typeof row.incident_scope === "string" ? row.incident_scope : null,
    submission_id: typeof row.submission_id === "string" ? row.submission_id : null,
    submission_fingerprint: typeof row.submission_fingerprint === "string" ? row.submission_fingerprint : null,
    safety_triage: row.incident_scope
      ? {
          review_required: row.status === "submitted" && Array.isArray(row.safety_signals) && row.safety_signals.length > 0,
          signals: SafetyTriageSignalSchema.array().parse(row.safety_signals ?? []),
          basis: "deterministic_rules",
          policy_version: "phase1-v1",
        }
      : deriveSafetyTriage(String(row.text || ""), (row.status || "submitted") as ComplaintRecord["status"]),
    assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : null,
    response_note: typeof row.response_note === "string" ? row.response_note : null,
    last_updated_by:
      typeof row.last_updated_by === "string" ? row.last_updated_by : null,
    created_at: String(row.created_at),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

function sortForReview(records: ComplaintRecord[]): ComplaintRecord[] {
  return [...records].sort((a, b) =>
    Number(Boolean(b.safety_triage?.review_required)) - Number(Boolean(a.safety_triage?.review_required)) ||
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || a.id.localeCompare(b.id));
}

/** Fetch global incident metadata before restricting the viewer's rows. */
export async function getComplaints(
  view: "all" | "normal" | "emergency" = "all",
  viewer?: { userId: string; canViewAll: boolean },
): Promise<{
  complaints: ComplaintRecord[];
  counts: { total: number; normal: number; emergency: number };
}> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createServiceClient().rpc("read_complaints_phase1", {
      p_view: view,
      p_viewer: viewer?.userId ?? null,
      p_can_view_all: viewer?.canViewAll ?? true,
    });
    if (error || !data || !Array.isArray(data.complaints)) {
      throw new Error("Unable to read complaints.");
    }
    // RPC aggregates ALL rows first, then projects authorized rows. A scalar
    // response avoids the API max_rows cap and never transfers students' peers.
    const result = ComplaintListResponseSchema.parse({
      success: true,
      complaints: data.complaints.map((row: Record<string, unknown>) =>
        ComplaintRecordSchema.parse(mapComplaintRow(row))),
      counts: data.counts,
    });
    return { complaints: sortForReview(result.complaints), counts: result.counts };
  }

  // Calculate aggregate metadata from every authoritative record first. The
  // viewer projection below must not change a cluster's count or emergency
  // state merely because the viewer is a student.
  const calculated = aggregateIncidents(inMemoryComplaints);

  // Summary stats intentionally describe the global dataset, while complaint
  // rows remain subject to the viewer's ownership projection.
  const total = calculated.length;
  const emergency = calculated.filter((c) => c.is_emergency).length;
  const normal = total - emergency;

  const visibleRecords = viewer && !viewer.canViewAll
    ? calculated.filter((record) => record.complainant_id === viewer.userId)
    : calculated;

  // Filter based on requested view
  let filtered = visibleRecords;
  if (view === "normal") {
    filtered = visibleRecords.filter((c) => !c.is_emergency);
  } else if (view === "emergency") {
    filtered = visibleRecords.filter((c) => c.is_emergency);
  }

  return {
    complaints: sortForReview(filtered),
    counts: { total, normal, emergency },
  };
}

/**
 * Creates or replays a report; safety review and active-owner volume are separate.
 */
export async function createComplaint(data: CreateComplaintRequest): Promise<{
  complaint: ComplaintRecord;
  cluster: {
    cluster_id: string;
    group_count: number;
    is_emergency: boolean;
  };
  replayed: boolean;
}> {
  if (!data.complainant_id?.trim() || data.text.trim().length < 5 || !/[\p{L}\p{N}]/u.test(data.text)) {
    throw new ComplaintSubmissionError("INVALID_REQUEST");
  }
  const text = data.text.trim();
  const scope = deriveIncidentScope({ ...data, text });
  const triage = deriveSafetyTriage(text);
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
    text: text.toLowerCase().replace(/\s+/g, " "),
    scope,
    category: data.category ?? "other",
    attachments: data.attachments ?? [],
  })).digest("hex");

  if (isSupabaseConfigured()) {
    const { data: saved, error } = await createServiceClient().rpc("create_complaint_phase1", {
      p_id: crypto.randomUUID(),
      p_owner: data.complainant_id,
      p_text: text,
      p_category: data.category ?? "other",
      p_location_building: data.location_building ?? null,
      p_location_room: data.location_room ?? null,
      p_attachments: data.attachments ?? [],
      p_submission_id: data.submission_id ?? null,
      p_fingerprint: fingerprint,
      p_scope: scope,
      p_safety_signals: triage.signals,
      p_similarity_threshold: getSimilarityThreshold(),
    });
    if (error) {
      throw new ComplaintSubmissionError(error.code === "PT409" ? "IDEMPOTENCY_CONFLICT" : "PERSISTENCE_FAILED");
    }
    if (!saved?.complaint || !saved.cluster || typeof saved.replayed !== "boolean") {
      throw new ComplaintSubmissionError("PERSISTENCE_FAILED");
    }
    const response = CreateComplaintResponseSchema.parse({
      success: true,
      complaint: mapComplaintRow(saved.complaint),
      cluster: saved.cluster,
      replayed: saved.replayed,
    });
    return { complaint: response.complaint!, cluster: response.cluster!, replayed: response.replayed! };
  }

  return serializeMemoryWrite(async () => {
    const now = Date.now();
    const prior = inMemoryComplaints.find((row) => row.complainant_id === data.complainant_id &&
      (data.submission_id ? row.submission_id === data.submission_id :
        row.submission_fingerprint === fingerprint && isActiveIncidentReport(row, now)));
    if (prior && prior.submission_fingerprint !== fingerprint) {
      throw new ComplaintSubmissionError("IDEMPOTENCY_CONFLICT");
    }
    let row = prior;
    if (!row) {
      const candidates = inMemoryComplaints.filter((candidate) =>
        isActiveIncidentReport(candidate, now) &&
        (candidate.incident_scope || deriveIncidentScope(candidate)) === scope)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id));
      const match = findMatchingCluster(text, candidates);
      row = {
        id: crypto.randomUUID(), complainant_id: data.complainant_id,
        text, status: "submitted", category: data.category ?? "other", subcategory: null,
        location_building: data.location_building ?? null, location_room: data.location_room ?? null,
        attachments: data.attachments ?? [], cluster_id: match.cluster_id, incident_scope: scope,
        submission_id: data.submission_id ?? null, submission_fingerprint: fingerprint,
        safety_triage: triage, is_emergency: false, similar_count: 0,
        created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
      };
      // Assignment and insertion occur in one serialized process-local write.
      inMemoryComplaints.unshift(row);
    }
    const complaint = aggregateIncidents(inMemoryComplaints, now).find((item) => item.id === row!.id)!;
    return { complaint, cluster: { cluster_id: complaint.cluster_id,
      group_count: complaint.similar_count, is_emergency: complaint.is_emergency }, replayed: Boolean(prior) };
  });
}

const VALID_STATUS_TRANSITIONS: Record<
  NonNullable<ComplaintRecord["status"]>,
  readonly NonNullable<ComplaintRecord["status"]>[]
> = {
  submitted: ["under_review", "rejected"],
  under_review: ["in_progress", "rejected"],
  in_progress: ["under_review", "resolved", "rejected"],
  resolved: ["under_review"],
  rejected: ["under_review"],
};

function assertValidStatusTransition(
  current: ComplaintRecord["status"],
  next: ComplaintRecord["status"],
) {
  if (current === next) return;
  if (!VALID_STATUS_TRANSITIONS[current]?.includes(next)) {
    throw new ComplaintLifecycleError(
      `Cannot transition complaint from ${current} to ${next}.`,
      "INVALID_TRANSITION",
    );
  }
}

export async function updateComplaintLifecycle(input: {
  complaintId: string;
  actorId: string;
  canManage: boolean;
  update: ComplaintLifecycleUpdate;
}): Promise<ComplaintRecord> {
  if (!isSupabaseConfigured()) return serializeMemoryWrite(() => updateComplaintLifecycleUnlocked(input));
  return updateComplaintLifecycleUnlocked(input);
}

async function updateComplaintLifecycleUnlocked(input: {
  complaintId: string;
  actorId: string;
  canManage: boolean;
  update: ComplaintLifecycleUpdate;
}): Promise<ComplaintRecord> {
  if (!input.canManage) {
    throw new ComplaintLifecycleError(
      "Only authorized complaint staff may update a complaint.",
      "FORBIDDEN",
    );
  }

  const { complaints } = await getComplaints("all", {
    userId: input.actorId,
    canViewAll: true,
  });
  const current = complaints.find((complaint) => complaint.id === input.complaintId);
  if (!current) {
    throw new ComplaintLifecycleError("Complaint not found.", "NOT_FOUND");
  }

  const nextStatus = input.update.status || current.status;
  assertValidStatusTransition(current.status, nextStatus);
  const responseNote = input.update.response_note || current.response_note || null;
  if (
    (nextStatus === "resolved" || nextStatus === "rejected") &&
    !responseNote
  ) {
    throw new ComplaintLifecycleError(
      `A response note is required when a complaint is ${nextStatus}.`,
      "VALIDATION_FAILED",
    );
  }
  const assignedTo = input.update.take_ownership
    ? input.actorId
    : current.assigned_to || null;
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const { error } = await createServiceClient().rpc(
      "update_complaint_lifecycle",
      {
        target_complaint_id: input.complaintId,
        next_status: nextStatus,
        next_assigned_to: assignedTo,
        next_response_note: responseNote,
        actor_id: input.actorId,
      },
    );
    if (error) {
      const invalidTransition = error.message.includes("Invalid complaint status transition");
      // Lifecycle errors are returned by PATCH; never include backend details.
      throw new ComplaintLifecycleError(
        invalidTransition
          ? "Cannot transition complaint to the requested status."
          : "Unable to save the complaint update. Please try again.",
        invalidTransition ? "INVALID_TRANSITION" : "PERSISTENCE_FAILED",
      );
    }

    const refreshed = await getComplaints("all", {
      userId: input.actorId,
      canViewAll: true,
    });
    const updated = refreshed.complaints.find((complaint) => complaint.id === input.complaintId);
    if (!updated) {
      throw new ComplaintLifecycleError(
        "Complaint was updated but could not be read back.",
        "PERSISTENCE_FAILED",
      );
    }
    return updated;
  }

  const record = inMemoryComplaints.find((complaint) => complaint.id === input.complaintId);
  if (!record) {
    throw new ComplaintLifecycleError("Complaint not found.", "NOT_FOUND");
  }
  const fromStatus = record.status;
  record.status = nextStatus;
  record.response_note = responseNote;
  record.assigned_to = assignedTo;
  record.last_updated_by = input.actorId;
  record.updated_at = now;
  if (fromStatus !== nextStatus) {
    inMemoryComplaintStatusHistory.push({
      complaint_id: record.id,
      from_status: fromStatus,
      to_status: nextStatus,
      actor_id: input.actorId,
      note: responseNote,
      created_at: now,
    });
  }
  return aggregateIncidents(inMemoryComplaints).find((row) => row.id === record.id)!;
}

export async function getComplaintStatusHistory(
  complaintId: string,
): Promise<ComplaintStatusHistoryView[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createServiceClient()
      .from("complaint_status_history")
      .select("from_status,to_status,note,created_at")
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Unable to read complaint history.");
    return (data || []).map((row: Record<string, unknown>) => ({
      from_status: row.from_status as ComplaintStatusHistoryView["from_status"],
      to_status: row.to_status as ComplaintStatusHistoryView["to_status"],
      note: typeof row.note === "string" ? row.note : null,
      created_at: String(row.created_at),
    }));
  }

  return inMemoryComplaintStatusHistory
    .filter((entry) => entry.complaint_id === complaintId)
    .map(({ from_status, to_status, note, created_at }) => ({
      from_status,
      to_status,
      note,
      created_at,
    }));
}

/**
 * Helper to reset in-memory store for tests
 */
export function _resetStoreForTesting(initialRecords: ComplaintRecord[] = []) {
  inMemoryComplaints.length = 0;
  inMemoryComplaints.push(...initialRecords);
  inMemoryComplaintStatusHistory.length = 0;
}

export function _getStatusHistoryForTesting() {
  return [...inMemoryComplaintStatusHistory];
}
