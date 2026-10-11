import crypto from "crypto";
import {
  ComplaintRecord,
  CreateComplaintRequest,
  COMPLAINT_EMERGENCY_THRESHOLD,
  ComplaintAttachment,
  ComplaintLifecycleUpdate,
  ComplaintRecordSchema,
  ComplaintStatusHistoryEntry as ComplaintStatusHistoryView,
} from "@smart-campus/contracts";
import { findMatchingCluster, ExistingComplaintCandidate } from "./similarity-service";
import { createApplicationClient, createServiceClient } from "../supabase/server";

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
 * Recomputes dynamic similar_count for all complaints in memory
 * based on the number of complaints sharing each cluster_id.
 */
function recalculateClusterCounts(records: ComplaintRecord[]): ComplaintRecord[] {
  const clusterCounts = new Map<string, number>();

  for (const r of records) {
    const count = (clusterCounts.get(r.cluster_id) || 0) + 1;
    clusterCounts.set(r.cluster_id, count);
  }

  return records.map((r) => {
    const count = clusterCounts.get(r.cluster_id) || 1;
    const isEmergency = count >= COMPLAINT_EMERGENCY_THRESHOLD;
    return {
      ...r,
      similar_count: count,
      is_emergency: isEmergency,
    };
  });
}

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
    similar_count: 1,
    assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : null,
    response_note: typeof row.response_note === "string" ? row.response_note : null,
    last_updated_by:
      typeof row.last_updated_by === "string" ? row.last_updated_by : null,
    created_at: String(row.created_at),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

/**
 * Fetches all complaints and recalculates real-time group counts & emergency status.
 */
export async function getComplaints(
  view: "all" | "normal" | "emergency" = "all",
  viewer?: { userId: string; canViewAll: boolean },
): Promise<{
  complaints: ComplaintRecord[];
  counts: { total: number; normal: number; emergency: number };
}> {
  let records: ComplaintRecord[] = [];

  if (isSupabaseConfigured()) {
    try {
       const supabase = await createApplicationClient();
      // Load the authoritative dataset before applying the application-level
      // owner projection. Cluster volume is a campus-wide property, so an
      // owner-scoped query here would under-count clusters for students.
      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Complaint read failed: ${error.message}`);
      }
      if (data) {
        records = data.map((d: Record<string, unknown>) =>
          ComplaintRecordSchema.parse(mapComplaintRow(d)),
        );
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Complaint read failed");
    }
  } else {
    records = [...inMemoryComplaints];
  }

  // Calculate aggregate metadata from every authoritative record first. The
  // viewer projection below must not change a cluster's count or emergency
  // state merely because the viewer is a student.
  const calculated = recalculateClusterCounts(records);

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

  // Sort newest first
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    complaints: filtered,
    counts: { total, normal, emergency },
  };
}

/**
 * Creates a complaint with automatic text-only clustering and 5-item emergency transition.
 */
export async function createComplaint(data: CreateComplaintRequest): Promise<{
  complaint: ComplaintRecord;
  cluster: {
    cluster_id: string;
    group_count: number;
    is_emergency: boolean;
  };
}> {
  // 1. Get all current complaints for candidate matching
  const { complaints: allComplaints } = await getComplaints("all");

  const candidates: ExistingComplaintCandidate[] = allComplaints.map((c) => ({
    id: c.id,
    text: c.text,
    cluster_id: c.cluster_id,
  }));

  // 2. Perform text-only similarity matching (NO image ML)
  const matchResult = findMatchingCluster(data.text, candidates);
  const targetClusterId = matchResult.cluster_id;

  // 3. Calculate cluster count after this new complaint is added
  const existingGroupMembers = allComplaints.filter(
    (c) => c.cluster_id === targetClusterId,
  );
  const newGroupCount = existingGroupMembers.length + 1;
  const isEmergency = newGroupCount >= COMPLAINT_EMERGENCY_THRESHOLD;

  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newRecord: ComplaintRecord = {
    id: newId,
    complainant_id: data.complainant_id || null,
    text: data.text,
    status: "submitted",
    category: data.category || "other",
    subcategory: null,
    location_building: data.location_building || null,
    location_room: data.location_room || null,
    attachments: data.attachments || [],
    cluster_id: targetClusterId,
    is_emergency: isEmergency,
    similar_count: newGroupCount,
    created_at: now,
    updated_at: now,
  };

  // 4. Persistence
  if (isSupabaseConfigured()) {
     try {
       const { error: persistError } = await createServiceClient().rpc(
         "persist_complaint_with_emergency",
         {
           p_id: newRecord.id,
           p_complainant_id: newRecord.complainant_id,
           p_text: newRecord.text,
           p_status: newRecord.status,
           p_category: newRecord.category,
           p_location_building: newRecord.location_building,
           p_location_room: newRecord.location_room,
           p_attachments: newRecord.attachments,
           p_cluster_id: newRecord.cluster_id,
           p_is_emergency: newRecord.is_emergency,
           p_created_at: newRecord.created_at,
           p_updated_at: newRecord.updated_at,
         },
       );
       if (persistError) {
         throw new Error(`Complaint persistence failed: ${persistError.message}`);
       }
    } catch (err) {
      // Do not report success or silently diverge from the database when a
      // configured backend rejects the write. Similarity was computed above,
      // but persistence must remain truthful.
      throw err instanceof Error ? err : new Error("Complaint persistence failed");
    }
  } else {
    persistToMemory(newRecord, targetClusterId, isEmergency);
  }

  return {
    complaint: newRecord,
    cluster: {
      cluster_id: targetClusterId,
      group_count: newGroupCount,
      is_emergency: isEmergency,
    },
  };
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
  return record;
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
    if (error) throw new Error(`Complaint history read failed: ${error.message}`);
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

function persistToMemory(
  newRecord: ComplaintRecord,
  targetClusterId: string,
  isEmergency: boolean,
) {
  // If emergency threshold is crossed, update existing cluster peers
  if (isEmergency) {
    for (const item of inMemoryComplaints) {
      if (item.cluster_id === targetClusterId) {
        item.is_emergency = true;
      }
    }
  }

  inMemoryComplaints.unshift(newRecord);
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
