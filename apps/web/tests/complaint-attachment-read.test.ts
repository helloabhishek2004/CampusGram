import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getAttachment } from "../app/api/complaints/attachments/[filename]/route";
import { createMockSessionToken } from "../lib/auth/identity-service";
import { MOCK_INSTITUTIONAL_DIRECTORY } from "../lib/auth/mock-identities";
import {
  createComplaintAttachmentToken,
  getComplaintAttachmentPathForTesting,
  storeComplaintImage,
} from "../lib/complaints/attachment-security";

const owner = MOCK_INSTITUTIONAL_DIRECTORY[0];
const nonowner = MOCK_INSTITUTIONAL_DIRECTORY[1];
const staff = MOCK_INSTITUTIONAL_DIRECTORY.find((profile) => profile.tags.includes("HOD"))!;
const cookieFor = (profile: typeof owner) =>
  `campusgram_mock_session=${createMockSessionToken(profile, profile.id)}`;
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("private complaint attachment GET", () => {
  let filename: string;
  let filePath: string;
  let cleanupPaths: string[];

  beforeEach(async () => {
    cleanupPaths = [];
    const attachment = await storeComplaintImage({
      buffer: pngBytes,
      declaredMimeType: "image/png",
      ownerId: owner.id,
    });
    filename = path.basename(attachment.url);
    filePath = getComplaintAttachmentPathForTesting(attachment.url);
    cleanupPaths.push(filePath);
  });

  afterEach(async () => {
    await Promise.all(cleanupPaths.map((target) => rm(target, { recursive: true, force: true })));
  });

  const request = (requestedFilename: string, headers: Record<string, string> = {}) =>
    getAttachment(
      new NextRequest(`http://localhost/uploads/complaints/${encodeURIComponent(requestedFilename)}`, { headers }),
      { params: Promise.resolve({ filename: requestedFilename }) },
    );

  async function expectDenied(response: Response, status: number) {
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = await response.text();
    expect(body.includes(owner.id)).toBe(false);
    expect(body.includes(filename)).toBe(false);
    expect(Buffer.from(body).equals(pngBytes)).toBe(false);
  }

  it("rejects unauthenticated access even with caller-supplied owner/staff headers", async () => {
    await expectDenied(await request(filename, {
      "x-user-id": owner.id,
      "x-user-role": "admin",
    }), 401);
  });

  it("rejects an invalid session cookie", async () => {
    await expectDenied(await request(filename, {
      Cookie: "campusgram_mock_session=not-a-signed-session",
    }), 401);
  });

  it("rejects Student B's GET of Student A's valid upload, including spoofed permission headers", async () => {
    await expectDenied(await request(filename, {
      Cookie: cookieFor(nonowner),
      "x-user-id": owner.id,
      "x-user-role": "admin",
    }), 403);
  });

  it("returns the exact image bytes to the authenticated owner without caching", async () => {
    const response = await request(filename, { Cookie: cookieFor(owner) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).equals(pngBytes)).toBe(true);
  });

  it("permits a different authenticated owner with the existing complaint staff capability", async () => {
    const response = await request(filename, { Cookie: cookieFor(staff) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer()).equals(pngBytes)).toBe(true);
  });

  it.each([
    ["traversal", "../../emergency.json"],
    ["encoded traversal", "%2e%2e%2femergency.json"],
    ["unknown token", "not-issued.png"],
    ["unsupported extension", "not-issued.svg"],
    ["extra suffix", "not-issued.png/extra"],
    ["oversized filename", `${"a".repeat(256)}.png`],
  ])("rejects a bad filename: %s, including for authorized staff", async (_label, badFilename) => {
    await expectDenied(await request(badFilename, { Cookie: cookieFor(staff) }), 404);
  });

  it("rejects a forged authenticated token", async () => {
    const forged = `${filename[0] === "A" ? "B" : "A"}${filename.slice(1)}`;
    await expectDenied(await request(forged, { Cookie: cookieFor(owner) }), 404);
  });

  it("rejects an extension that disagrees with the issued token", async () => {
    await expectDenied(await request(filename.replace(/\.png$/, ".jpg"), { Cookie: cookieFor(staff) }), 404);
  });

  it("rejects a valid filename with a trailing newline instead of accepting a partial match", async () => {
    await expectDenied(await request(`${filename}\n`, { Cookie: cookieFor(owner) }), 404);
  });

  it("rejects a valid token with no stored file", async () => {
    const { token } = createComplaintAttachmentToken({ ownerId: owner.id, mimeType: "image/png" });
    await expectDenied(await request(`${token}.png`, { Cookie: cookieFor(owner) }), 404);
  });

  it("fails closed when a previously stored file is missing", async () => {
    await rm(filePath);
    await expectDenied(await request(filename, { Cookie: cookieFor(owner) }), 404);
  });

  it("rejects bytes that disagree with the signed content type", async () => {
    await writeFile(filePath, Buffer.from("GIF89a"));
    await expectDenied(await request(filename, { Cookie: cookieFor(owner) }), 404);
  });

  it("does not follow a symlink outside the private upload directory", async () => {
    const temporaryDir = await mkdtemp(path.join(process.cwd(), ".data", "complaint-read-test-"));
    cleanupPaths.push(temporaryDir);
    const target = path.join(temporaryDir, "outside.png");
    await writeFile(target, pngBytes);
    await rm(filePath);
    await symlink(target, filePath);
    await expectDenied(await request(filename, { Cookie: cookieFor(owner) }), 404);
  });

  it.each([
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ["image/gif", Buffer.from("GIF89a")],
    ["image/webp", Buffer.from("RIFF0000WEBP")],
  ])("returns the verified content type for %s", async (mimeType, buffer) => {
    const attachment = await storeComplaintImage({ buffer, declaredMimeType: mimeType, ownerId: owner.id });
    cleanupPaths.push(getComplaintAttachmentPathForTesting(attachment.url));
    const response = await request(path.basename(attachment.url), { Cookie: cookieFor(owner) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(mimeType);
    expect(Buffer.from(await response.arrayBuffer()).equals(buffer)).toBe(true);
  });
});
