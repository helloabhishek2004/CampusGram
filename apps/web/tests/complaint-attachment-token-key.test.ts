import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "attachment-key-test-owner";
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

async function loadIndependentInstance() {
  vi.resetModules();
  return import("../lib/complaints/attachment-security");
}

describe("complaint attachment keys across independently loaded modules", () => {
  let cleanupPaths: string[];

  beforeEach(() => {
    cleanupPaths = [];
    vi.stubEnv("COMPLAINT_ATTACHMENT_TOKEN_SECRET", "");
    vi.stubEnv("AUTH_SESSION_SECRET", "");
  });

  afterEach(async () => {
    await Promise.all(cleanupPaths.map((filePath) => rm(filePath, { force: true })));
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function expectCrossInstanceAccess() {
    const uploadInstance = await loadIndependentInstance();
    const attachment = await uploadInstance.storeComplaintImage({
      buffer: pngBytes,
      declaredMimeType: "image/png",
      ownerId,
    });
    cleanupPaths.push(uploadInstance.getComplaintAttachmentPathForTesting(attachment.url));
    const readerInstance = await loadIndependentInstance();
    expect(uploadInstance.storeComplaintImage === readerInstance.storeComplaintImage).toBe(false);

    const filename = path.basename(attachment.url);
    const decoded = readerInstance.parseComplaintAttachmentTokenForTesting(filename.slice(0, -4));
    // Boolean assertions keep the token, decoded actor and secrets out of failure output.
    expect(decoded !== null).toBe(true);
    expect(decoded?.ownerId === ownerId).toBe(true);
    const validated = await readerInstance.validateComplaintAttachmentReference(attachment, ownerId);
    expect(validated.id === attachment.id).toBe(true);
    const ownerRead = await readerInstance.readComplaintAttachment(filename, { userId: ownerId, canViewAll: false });
    expect(ownerRead.buffer.equals(pngBytes)).toBe(true);
    const staffRead = await readerInstance.readComplaintAttachment(filename, { userId: "staff-test-viewer", canViewAll: true });
    expect(staffRead.buffer.equals(pngBytes)).toBe(true);
  }

  it("validates issued references and reads bytes across reloads using the configured auth-secret fallback", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-only-configured-auth-secret");
    await expectCrossInstanceAccess();
  });

  it("shares the ephemeral offline key across route module reloads", async () => {
    await expectCrossInstanceAccess();
  });

  it("keeps the dedicated secret authoritative even when the auth secret changes between module instances", async () => {
    vi.stubEnv("COMPLAINT_ATTACHMENT_TOKEN_SECRET", "test-only-dedicated-attachment-secret");
    vi.stubEnv("AUTH_SESSION_SECRET", "test-only-auth-secret-before-rotation");
    const issuer = await loadIndependentInstance();
    const { token } = issuer.createComplaintAttachmentToken({ ownerId, mimeType: "image/png" });
    vi.stubEnv("AUTH_SESSION_SECRET", "test-only-auth-secret-after-rotation");
    const validator = await loadIndependentInstance();
    expect(validator.parseComplaintAttachmentTokenForTesting(token) !== null).toBe(true);
  });

  it("rejects auth-fallback tokens after the configured auth secret changes", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-only-auth-secret-before-rotation");
    const issuer = await loadIndependentInstance();
    const { token } = issuer.createComplaintAttachmentToken({ ownerId, mimeType: "image/png" });
    vi.stubEnv("AUTH_SESSION_SECRET", "test-only-auth-secret-after-rotation");
    const validator = await loadIndependentInstance();
    expect(validator.parseComplaintAttachmentTokenForTesting(token) === null).toBe(true);
  });

  it("domain-separates the auth-secret fallback from the legacy dedicated-secret derivation", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-only-shared-raw-secret");
    const issuer = await loadIndependentInstance();
    const { token } = issuer.createComplaintAttachmentToken({ ownerId, mimeType: "image/png" });
    vi.stubEnv("COMPLAINT_ATTACHMENT_TOKEN_SECRET", "test-only-shared-raw-secret");
    const validator = await loadIndependentInstance();
    expect(validator.parseComplaintAttachmentTokenForTesting(token) === null).toBe(true);
  });
});
