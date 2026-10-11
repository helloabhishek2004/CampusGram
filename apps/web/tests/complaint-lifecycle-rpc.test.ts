import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ComplaintRecord } from "@smart-campus/contracts";
import { MOCK_INSTITUTIONAL_DIRECTORY } from "../lib/auth/mock-identities";
import {
  _getStatusHistoryForTesting,
  _resetStoreForTesting,
  getComplaints,
  updateComplaintLifecycle,
} from "../lib/complaints/complaint-repository";
import { PATCH } from "../app/api/complaints/[id]/route";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  rpc: vi.fn(),
  resolveIdentity: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../lib/supabase/server", () => ({
  createApplicationClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ order: mocks.read }) }),
  })),
  createServiceClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));
vi.mock("../lib/auth/server-identity", () => ({
  resolveServerIdentity: mocks.resolveIdentity,
}));

const staff = MOCK_INSTITUTIONAL_DIRECTORY.find((profile) => profile.tags.includes("HOD"))!;
const current: ComplaintRecord = {
  id: "cmp-rpc-test",
  text: "Broken water pump in hostel block",
  status: "under_review",
  attachments: [],
  cluster_id: "cluster-rpc-test",
  is_emergency: false,
  similar_count: 1,
  response_note: "Inspection completed.",
  created_at: "2026-10-11T00:00:00.000Z",
};
const update = { status: "in_progress" as const, response_note: "note-failure-sentinel" };

const failures = [
  {
    label: "history check constraint",
    message: 'new row for relation "complaint_status_history" violates check constraint "complaint_history_note_sentinel_check"',
    code: "PERSISTENCE_FAILED",
    safeMessage: "Unable to save the complaint update. Please try again.",
    status: 500,
  },
  {
    label: "schema and SQL details",
    message: 'permission denied for schema public; SQL statement "UPDATE public.complaints SET status = $1"',
    code: "PERSISTENCE_FAILED",
    safeMessage: "Unable to save the complaint update. Please try again.",
    status: 500,
  },
  {
    label: "key fragments",
    message: "Invalid API key: sb_secret_fake_backend_key_fragment",
    code: "PERSISTENCE_FAILED",
    safeMessage: "Unable to save the complaint update. Please try again.",
    status: 500,
  },
  {
    label: "database transition conflict",
    message: "Invalid complaint status transition: resolved -> in_progress; function public.update_complaint_lifecycle line 42",
    code: "INVALID_TRANSITION",
    safeMessage: "Cannot transition complaint to the requested status.",
    status: 409,
  },
];

describe("configured Supabase complaint lifecycle RPC errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Exercise the configured backend branch despite Vitest's default memory mode.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fake-test-anon-key");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockRejectedValue(new Error("Unexpected network request"));
    mocks.read.mockReset().mockResolvedValue({ data: [{ ...current }], error: null });
    mocks.rpc.mockReset();
    mocks.resolveIdentity.mockResolvedValue({ userId: staff.id, profile: staff });
    _resetStoreForTesting([{ ...current }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    _resetStoreForTesting([]);
  });

  function patch() {
    return PATCH(
      new NextRequest(`http://localhost/api/complaints/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      }),
      { params: Promise.resolve({ id: current.id }) },
    );
  }

  async function expectFailedWrite() {
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("update_complaint_lifecycle", {
      target_complaint_id: current.id,
      next_status: "in_progress",
      next_assigned_to: null,
      next_response_note: update.response_note,
      actor_id: staff.id,
    });
    // A rejected RPC must not proceed to successful readback or memory fallback.
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "test");
    expect((await getComplaints()).complaints).toEqual([current]);
    expect(_getStatusHistoryForTesting()).toEqual([]);
  }

  it.each(failures)("sanitizes repository errors for $label", async ({ message, code, safeMessage }) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message, details: "private backend details", hint: "private backend hint" } });

    await expect(updateComplaintLifecycle({
      complaintId: current.id,
      actorId: staff.id,
      canManage: true,
      update,
    })).rejects.toMatchObject({
      name: "ComplaintLifecycleError",
      code,
      message: safeMessage,
    });
    await expectFailedWrite();
  });

  it.each(failures)("returns a sanitized unsuccessful PATCH for $label", async ({ message, code, safeMessage, status }) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message, details: "private backend details", hint: "private backend hint" } });

    const response = await patch();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      success: false,
      error: { code, message: safeMessage },
    });
    await expectFailedWrite();
  });

  it("still returns the authoritative updated complaint after a successful RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.read
      .mockResolvedValueOnce({ data: [{ ...current }], error: null })
      .mockResolvedValueOnce({ data: [{ ...current, ...update, last_updated_by: staff.id }], error: null });

    const response = await patch();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      complaint: { id: current.id, ...update },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
