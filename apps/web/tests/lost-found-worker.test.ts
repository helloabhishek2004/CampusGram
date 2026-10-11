import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobWithMetadata, WorkWithMetadataHandler } from "pg-boss";
import type { ProcessItemPayload } from "../../../workers/lost-found-worker/src/jobs";

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  start: vi.fn(async () => {}),
  work: vi.fn(),
  processItem: vi.fn(async () => {}),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("pg-boss", () => ({
  PgBoss: vi.fn(function () {
    return { on: mocks.on, start: mocks.start, work: mocks.work };
  }),
}));
vi.mock("../../../workers/lost-found-worker/src/handlers", () => ({
  handleProcessItem: mocks.processItem,
}));
vi.mock("../../../workers/lost-found-worker/src/logger", () => ({
  logger: { info: mocks.info, error: mocks.error },
}));

let handler: WorkWithMetadataHandler<ProcessItemPayload, void>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  await import("../../../workers/lost-found-worker/src/index");
  await vi.waitFor(() => expect(mocks.work).toHaveBeenCalledOnce());
  expect(mocks.work.mock.calls[0].slice(0, 2)).toEqual([
    "process-item", { includeMetadata: true },
  ]);
  handler = mocks.work.mock.calls[0][2];
});

function job(id: string, retryCount = 0): JobWithMetadata<ProcessItemPayload> {
  return {
    id, name: "process-item",
    data: { itemId: id, type: "lost", title: "Lost keys", description: "Keys with a blue tag" },
    createdOn: new Date("2026-10-01T00:00:00.000Z"),
    retryCount, expireInSeconds: 900, heartbeatSeconds: null,
    signal: new AbortController().signal,
    priority: 0, state: "active", retryLimit: 2, retryDelay: 0, retryBackoff: false,
    startAfter: new Date(), startedOn: new Date(), singletonKey: null, singletonOn: null,
    deleteAfterSeconds: 604800, completedOn: null, keepUntil: new Date(), policy: "standard",
    heartbeatOn: null, blocked: false, blocking: false, pendingDependencies: 0,
    deadLetter: "", output: {}, sourceName: null, sourceId: null, sourceCreatedOn: null,
    sourceRetryCount: null, sourceOutput: null, sourceRootId: null,
  };
}

describe("Lost & Found pg-boss dispatch", () => {
  it("adapts every fetched job's data and metadata for the domain handler", async () => {
    const jobs = [job("first"), job("second", 1)];
    await handler(jobs);
    expect(mocks.processItem.mock.calls).toEqual(jobs.map((entry) => [{
      id: entry.id, type: "process-item", payload: entry.data,
      createdAt: entry.createdOn.toISOString(), attempts: entry.retryCount,
    }]));
  });

  it("propagates the original processing failure so pg-boss can retry", async () => {
    const failure = new Error("Processing failed");
    mocks.processItem.mockRejectedValueOnce(failure);
    await expect(handler([job("first"), job("second")])).rejects.toBe(failure);
    expect(mocks.processItem).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledWith("Error processing item:", failure);
  });
});
