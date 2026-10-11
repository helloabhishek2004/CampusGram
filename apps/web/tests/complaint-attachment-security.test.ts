import { access, rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as createComplaintRoute } from "../app/api/complaints/route";
import { POST as uploadComplaintAttachment } from "../app/api/complaints/upload/route";
import { createMockSessionToken } from "../lib/auth/identity-service";
import { MOCK_INSTITUTIONAL_DIRECTORY } from "../lib/auth/mock-identities";
import {
  getComplaintAttachmentPathForTesting,
  parseComplaintAttachmentTokenForTesting,
  storeComplaintImage,
  validateImageBytes,
  validateComplaintAttachmentReference,
} from "../lib/complaints/attachment-security";

const owner = MOCK_INSTITUTIONAL_DIRECTORY[0];
const otherOwner = MOCK_INSTITUTIONAL_DIRECTORY[1];
const ownerCookie = `campusgram_mock_session=${createMockSessionToken(owner, owner.id)}`;

// A PNG signature is sufficient for the signature boundary under test; the
// image bytes are never passed to an image decoder in this local/demo path.
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);

describe("complaint attachment security", () => {
  it("validates actual image signatures instead of trusting declared MIME", () => {
    expect(validateImageBytes(pngBytes, "image/png")).toEqual({
      mimeType: "image/png",
      extension: "png",
    });

    expect(() => validateImageBytes(Buffer.from("not an image"), "image/png"))
      .toThrow("do not match a supported image type");
    expect(() => validateImageBytes(pngBytes, "image/jpeg"))
      .toThrow("do not match a supported image type");
  });

  it("uses a safe generated path and an opaque owner-bound token", async () => {
    const attachment = await storeComplaintImage({
      buffer: pngBytes,
      declaredMimeType: "image/png",
      ownerId: owner.id,
      originalFilename: "../../escape.html",
    });

    try {
      expect(attachment.url).toMatch(/^\/uploads\/complaints\/[A-Za-z0-9_-]+\.png$/);
      expect(attachment.url).not.toContain("escape");
      expect(attachment.url).not.toContain(owner.id);
      expect(parseComplaintAttachmentTokenForTesting(attachment.url.split("/").pop()!.slice(0, -4)))
        .toMatchObject({ ownerId: owner.id, mimeType: "image/png" });

      const safePath = getComplaintAttachmentPathForTesting(attachment.url);
      expect(path.dirname(safePath)).toBe(path.join(process.cwd(), ".data", "uploads", "complaints"));
      expect(safePath).not.toContain("escape");
      await expect(access(path.join(process.cwd(), "public", attachment.url.slice(1))))
        .rejects.toThrow();

      await expect(validateComplaintAttachmentReference(attachment, owner.id)).resolves.toMatchObject({
        id: attachment.id,
        url: attachment.url,
        mime_type: "image/png",
      });
      await expect(validateComplaintAttachmentReference(attachment, otherOwner.id))
        .rejects.toThrow("not issued for the authenticated complaint owner");
    } finally {
      await rm(getComplaintAttachmentPathForTesting(attachment.url), { force: true });
    }
  });

  it("rejects forged image bytes at the upload route", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["not an image"], { type: "image/png" }), "fake.png");

    const response = await uploadComplaintAttachment(new NextRequest(
      "http://localhost:3000/api/complaints/upload",
      { method: "POST", headers: { Cookie: ownerCookie }, body: formData },
    ));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_FILE_SIGNATURE");
  });

  it("accepts only an issued token when creating a complaint", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([pngBytes], { type: "image/png" }), "evidence.png");
    const uploadResponse = await uploadComplaintAttachment(new NextRequest(
      "http://localhost:3000/api/complaints/upload",
      { method: "POST", headers: { Cookie: ownerCookie }, body: formData },
    ));
    expect(uploadResponse.status).toBe(200);
    const uploaded = (await uploadResponse.json()).attachment;

    try {
      const createResponse = await createComplaintRoute(new NextRequest(
        "http://localhost:3000/api/complaints",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: ownerCookie },
          body: JSON.stringify({ text: "Leaking pipe needs repair", attachments: [uploaded] }),
        },
      ));
      expect(createResponse.status).toBe(201);

      const forgedResponse = await createComplaintRoute(new NextRequest(
        "http://localhost:3000/api/complaints",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: ownerCookie },
          body: JSON.stringify({
            text: "Another leaking pipe needs repair",
            attachments: [{ url: "/uploads/complaints/not-issued.png" }],
          }),
        },
      ));
      expect(forgedResponse.status).toBe(400);
      expect((await forgedResponse.json()).error.code).toBe("INVALID_ATTACHMENT_REFERENCE");
    } finally {
      await rm(getComplaintAttachmentPathForTesting(uploaded.url), { force: true });
    }
  });
});
