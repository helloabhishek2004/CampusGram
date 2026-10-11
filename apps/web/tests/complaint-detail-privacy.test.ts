import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ComplaintRecord } from "@smart-campus/contracts";
import { MOCK_INSTITUTIONAL_DIRECTORY } from "../lib/auth/mock-identities";
import { projectComplaintForApi } from "../lib/complaints/complaint-projection";
import { ComplaintLifecycleError } from "../lib/complaints/complaint-repository";
import { GET, PATCH } from "../app/api/complaints/[id]/route";
import { GET as list, POST as create } from "../app/api/complaints/route";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  history: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../lib/auth/server-identity", () => ({ resolveServerIdentity: mocks.identity }));
vi.mock("../lib/complaints/complaint-repository", () => ({
  getComplaints: mocks.read,
  createComplaint: mocks.create,
  getComplaintStatusHistory: mocks.history,
  updateComplaintLifecycle: mocks.update,
  ComplaintLifecycleError: class extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
  ComplaintSubmissionError: class extends Error {},
}));
vi.mock("../lib/complaints/attachment-security", () => ({
  validateComplaintAttachments: vi.fn(async () => []),
  ComplaintAttachmentSecurityError: class extends Error {},
}));

const student = MOCK_INSTITUTIONAL_DIRECTORY[0];
const staff = MOCK_INSTITUTIONAL_DIRECTORY.find((profile) => profile.tags.includes("HOD"))!;
const otherId = "e5db8969-65d8-4709-b5bc-c04bda146dfb";
const complaint: ComplaintRecord = {
  id: "own-complaint",
  complainant_id: student.id,
  text: "Fan in block A room 204 is sparking near the wires.",
  status: "submitted",
  attachments: [],
  cluster_id: `cluster_${otherId}`,
  incident_scope: "fan|block a|204",
  submission_id: "c458cf4c-6280-4438-930a-ec1d2a28b2b3",
  submission_fingerprint: "private-submission-fingerprint",
  assigned_to: "private-assignee",
  last_updated_by: "private-actor",
  is_emergency: false,
  similar_count: 1,
  safety_triage: {
    review_required: true,
    signals: ["electrical_hazard"],
    basis: "deterministic_rules",
    policy_version: "phase1-v1",
  },
  created_at: "2026-10-11T00:00:00.000Z",
};
const peer: ComplaintRecord = {
  ...complaint,
  id: otherId,
  complainant_id: "private-other-owner",
  text: "Private peer report about the fan in block A room 204.",
};
const privateFields = [
  "complainant_id", "assigned_to", "last_updated_by", "actor_id", "incident_scope",
  "submission_id", "submission_fingerprint",
];
const params = (id = complaint.id) => ({ params: Promise.resolve({ id }) });
const request = (id = complaint.id) => new NextRequest(`http://localhost/api/complaints/${id}`);
const patchRequest = () => new NextRequest(`http://localhost/api/complaints/${complaint.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "under_review", take_ownership: true }),
});

function expectSafe(record: Record<string, unknown>) {
  for (const field of privateFields) expect(record).not.toHaveProperty(field);
  expect(record.cluster_id).toMatch(/^cluster_[a-f0-9]{64}$/);
  expect(record.cluster_id).not.toContain(otherId);
  expect(record.cluster_id).not.toContain(complaint.incident_scope);
}

describe("complaint incident projection and detail privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identity.mockResolvedValue({ userId: student.id, profile: student });
    mocks.read.mockResolvedValue({ complaints: [complaint], counts: { total: 1, normal: 1, emergency: 0 } });
    mocks.history.mockResolvedValue([]);
    mocks.update.mockResolvedValue({
      ...complaint, status: "under_review", response_note: "Inspection scheduled.",
      actor_id: "private-row-actor-id",
    });
    mocks.create.mockResolvedValue({
      complaint,
      cluster: { cluster_id: complaint.cluster_id, group_count: 1, is_emergency: false },
      replayed: false,
    });
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("uses an opaque stable cluster/scope ID without exposing internal identity or replay fields", () => {
    const projected = projectComplaintForApi(complaint);
    expectSafe(projected);
    expect(projected).toMatchObject({ id: complaint.id, text: complaint.text, safety_triage: complaint.safety_triage });
    expect(projectComplaintForApi({ ...peer, status: "resolved", similar_count: 0 }).cluster_id).toBe(projected.cluster_id);
    expect(complaint.cluster_id).toBe(`cluster_${otherId}`);
  });

  it("matches the incident policy's trimmed or derived scope and separates incompatible legacy partitions", () => {
    const projected = projectComplaintForApi(complaint);
    expect(projectComplaintForApi({ ...peer, incident_scope: "  fan|block a|204  " }).cluster_id).toBe(projected.cluster_id);
    expect(projectComplaintForApi({ ...complaint, incident_scope: " " }).cluster_id).toBe(projected.cluster_id);
    for (const incident_scope of ["fan|block a|205", "fan|block b|204", "projector|block a|204", "fan||"]) {
      expect(projectComplaintForApi({ ...complaint, incident_scope }).cluster_id).not.toBe(projected.cluster_id);
    }
    expect(projectComplaintForApi({ ...complaint, cluster_id: "different-internal-cluster" }).cluster_id).not.toBe(projected.cluster_id);
  });

  it("uses the same opaque ID in create, list, detail and staff PATCH responses", async () => {
    const created = await create(new NextRequest("http://localhost/api/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: complaint.text }),
    }));
    const listed = await list(new NextRequest("http://localhost/api/complaints"));
    const detail = await GET(request(), params());
    mocks.identity.mockResolvedValue({ userId: staff.id, profile: staff });
    const patched = await PATCH(patchRequest(), params());
    expect([created.status, listed.status, detail.status, patched.status]).toEqual([201, 200, 200, 200]);
    const bodies = await Promise.all([created.json(), listed.json(), detail.json(), patched.json()]);
    const records = [bodies[0].complaint, bodies[1].complaints[0], bodies[2].complaint, bodies[3].complaint];
    expect(new Set(records.map((record) => record.cluster_id)).size).toBe(1);
    expect(bodies[0].cluster.cluster_id).toBe(records[0].cluster_id);
    records.forEach(expectSafe);
    expect(records[0]).toMatchObject({ is_emergency: false, safety_triage: { review_required: true } });
    expect(records[3]).toMatchObject({ status: "under_review", response_note: "Inspection scheduled." });
    expect(mocks.update).toHaveBeenCalledWith({
      complaintId: complaint.id, actorId: staff.id, canManage: true,
      update: { status: "under_review", take_ownership: true },
    });
  });

  it("restricts student detail and peers to their own rows before loading history", async () => {
    const ownPeer = { ...peer, id: "another-own-report", complainant_id: student.id, text: "My second fan report." };
    mocks.read.mockResolvedValue({ complaints: [complaint, peer, ownPeer], counts: { total: 3, normal: 3, emergency: 0 } });
    const response = await GET(request(), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.peer_complaints.map((record: ComplaintRecord) => record.id)).toEqual([ownPeer.id]);
    expectSafe(body.complaint);
    expectSafe(body.peer_complaints[0]);
    expect(JSON.stringify(body)).not.toContain(peer.id);
    expect(JSON.stringify(body)).not.toContain(peer.text);
    expect(mocks.read).toHaveBeenCalledWith("all", { userId: student.id, canViewAll: false });

    mocks.history.mockClear();
    const denied = await GET(request(peer.id), params(peer.id));
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ success: false, error: { code: "NOT_FOUND", message: "Complaint not found." } });
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("keeps authorized staff peers in the same scope partition and preserves sanitized history", async () => {
    mocks.identity.mockResolvedValue({ userId: staff.id, profile: staff });
    const incompatible = [
      { ...peer, id: "other-room", incident_scope: null, text: "Fan in block A room 205 is broken." },
      { ...peer, id: "other-topic", incident_scope: "projector|block a|204" },
      { ...peer, id: "unknown-room", incident_scope: null, text: "Fan in block A is broken." },
      { ...peer, id: "other-cluster", cluster_id: "different-internal-cluster" },
    ];
    const compatible = { ...peer, incident_scope: "  fan|block a|204  " };
    mocks.read.mockResolvedValue({ complaints: [{ ...complaint, incident_scope: null }, compatible, ...incompatible] });
    const history = { from_status: "submitted", to_status: "under_review", note: "Inspection scheduled.", created_at: complaint.created_at };
    mocks.history.mockResolvedValue([{ ...history, actor_id: "private-history-actor", complaint_id: complaint.id }]);
    const response = await GET(request(), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.peer_complaints.map((record: ComplaintRecord) => record.id)).toEqual([peer.id]);
    expect(body.peer_complaints[0].cluster_id).toBe(body.complaint.cluster_id);
    expectSafe(body.complaint);
    body.peer_complaints.forEach(expectSafe);
    expect(body.status_history).toEqual([history]);
    expect(mocks.history).toHaveBeenCalledWith(complaint.id);
    expect(mocks.read).toHaveBeenCalledWith("all", { userId: staff.id, canViewAll: true });
  });

  it("requires authentication and keeps lifecycle writes restricted to staff", async () => {
    mocks.identity.mockResolvedValue(null);
    expect((await GET(request(), params())).status).toBe(401);
    expect((await PATCH(patchRequest(), params())).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.identity.mockResolvedValue({ userId: student.id, profile: student });
    expect((await PATCH(patchRequest(), params())).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("sanitizes read/history failures and typed or unexpected lifecycle failures without logging private data", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    const privateMessage = `SQL UPDATE public.complaints; private row ${peer.id}: ${peer.text}`;
    mocks.read.mockRejectedValueOnce(new Error(privateMessage));
    const readFailure = await GET(request(), params());
    mocks.history.mockRejectedValueOnce(new Error(privateMessage));
    const historyFailure = await GET(request(), params());
    mocks.identity.mockResolvedValue({ userId: staff.id, profile: staff });
    mocks.update.mockRejectedValueOnce(new ComplaintLifecycleError(privateMessage, "PERSISTENCE_FAILED"));
    const typedFailure = await PATCH(patchRequest(), params());
    mocks.update.mockRejectedValueOnce(new Error(privateMessage));
    const unexpectedFailure = await PATCH(patchRequest(), params());
    expect([readFailure.status, historyFailure.status, typedFailure.status, unexpectedFailure.status]).toEqual([500, 500, 500, 500]);
    for (const response of [readFailure, historyFailure, typedFailure, unexpectedFailure]) {
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(JSON.stringify(body)).not.toContain("SQL");
      expect(JSON.stringify(body)).not.toContain(peer.id);
      expect(JSON.stringify(body)).not.toContain(peer.text);
    }
    expect(errorLog).not.toHaveBeenCalled();
    expect(warningLog).not.toHaveBeenCalled();
  });
});
