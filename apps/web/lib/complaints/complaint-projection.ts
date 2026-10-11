import type { ComplaintRecord } from "@smart-campus/contracts";
import { createHash } from "node:crypto";
import { deriveIncidentScope } from "./incident-policy";

/**
 * Complaint responses do not need database identity columns. Keep status and
 * response notes visible to the owner/staff while removing raw actor IDs from
 * every browser-facing projection.
 */
export function projectComplaintForApi(
  complaint: ComplaintRecord,
): Omit<ComplaintRecord, "complainant_id" | "assigned_to" | "last_updated_by" | "incident_scope" | "submission_id" | "submission_fingerprint"> {
  const {
    complainant_id: _complainantId,
    assigned_to: _assignedTo,
    last_updated_by: _lastUpdatedBy,
    incident_scope: _incidentScope,
    submission_id: _submissionId,
    submission_fingerprint: _submissionFingerprint,
    ...safeComplaint
  } = complaint;
  // Match aggregateIncidents' partition policy. Hash the entire partition: a
  // legacy cluster ID can itself contain another student's complaint UUID.
  const partitionId = createHash("sha256")
    .update(JSON.stringify([
      complaint.cluster_id,
      _incidentScope?.trim() || deriveIncidentScope(complaint),
    ]))
    .digest("hex");
  return { ...safeComplaint, cluster_id: `cluster_${partitionId}` };
}
