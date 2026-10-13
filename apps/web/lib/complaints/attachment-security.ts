import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ComplaintAttachment } from "@smart-campus/contracts";
import { isDemoMode } from "../demo/demo-mode";

const demoMemoryAttachments = new Map<string, { buffer: Buffer; mimeType: string; size: number }>();

export const COMPLAINT_ATTACHMENT_UPLOAD_DIR = path.join(
  process.cwd(),
  ".data",
  "uploads",
  "complaints",
);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const TOKEN_VERSION = 1;
const TOKEN_IV_BYTES = 12;
const TOKEN_TAG_BYTES = 16;

const MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

type SupportedMimeType = keyof typeof MIME_TO_EXTENSION;

type AttachmentTokenPayload = {
  version: number;
  attachmentId: string;
  ownerId: string;
  mimeType: SupportedMimeType;
  extension: (typeof MIME_TO_EXTENSION)[SupportedMimeType];
};

export class ComplaintAttachmentSecurityError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_FILE_TYPE"
      | "FILE_TOO_LARGE"
      | "INVALID_FILE_SIGNATURE"
      | "INVALID_ATTACHMENT_REFERENCE"
      | "ATTACHMENT_FORBIDDEN"
      | "ATTACHMENT_NOT_FOUND",
  ) {
    super(message);
    this.name = "ComplaintAttachmentSecurityError";
  }
}

// Share the offline fallback across Next route bundles and hot reloads in the
// same process. Stable configured secrets are required across processes/restarts.
const offlineSecretKey = Symbol.for("smart-campus.complaint-attachment.offline-secret.v1");
const offlineSecretStore = globalThis as typeof globalThis & {
  [offlineSecretKey]?: Buffer;
};

function tokenKey() {
  const dedicatedSecret = process.env.COMPLAINT_ATTACHMENT_TOKEN_SECRET;
  if (dedicatedSecret) {
    // Preserve the existing dedicated-secret key derivation and precedence.
    return createHash("sha256").update(dedicatedSecret).digest();
  }
  const authSecret = process.env.AUTH_SESSION_SECRET?.trim();
  if (authSecret) {
    // Derive an attachment-only key; never reuse the session-signing key itself.
    return createHmac("sha256", authSecret)
      .update("smart-campus:complaint-attachment-token:v1")
      .digest();
  }
  const offlineSecret = offlineSecretStore[offlineSecretKey] ??= randomBytes(32);
  return createHash("sha256")
    .update(offlineSecret)
    .digest();
}

function encodeTokenPart(value: Buffer) {
  return value.toString("base64url");
}

function decodeTokenPart(value: string) {
  return Buffer.from(value, "base64url");
}

function isSupportedMimeType(value: string): value is SupportedMimeType {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXTENSION, value);
}

/**
 * Detects the file type from its bytes, never from the browser-provided MIME.
 * The declared type is checked by the caller as an additional consistency
 * guard, so a mislabeled payload cannot be stored as an image.
 */
export function detectImageMimeType(buffer: Buffer): SupportedMimeType | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function validateImageBytes(buffer: Buffer, declaredMimeType: string) {
  if (!isSupportedMimeType(declaredMimeType)) {
    throw new ComplaintAttachmentSecurityError(
      "Only JPEG, PNG, WebP, and GIF images are allowed.",
      "INVALID_FILE_TYPE",
    );
  }
  if (buffer.length === 0) {
    throw new ComplaintAttachmentSecurityError(
      "The uploaded image is empty.",
      "INVALID_FILE_SIGNATURE",
    );
  }

  const detectedMimeType = detectImageMimeType(buffer);
  if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
    throw new ComplaintAttachmentSecurityError(
      "The uploaded bytes do not match a supported image type.",
      "INVALID_FILE_SIGNATURE",
    );
  }

  return {
    mimeType: detectedMimeType,
    extension: MIME_TO_EXTENSION[detectedMimeType],
  };
}

export function assertComplaintAttachmentSize(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_SIZE_BYTES) {
    throw new ComplaintAttachmentSecurityError(
      "The image must be between 1 byte and 5 MB.",
      size > MAX_FILE_SIZE_BYTES ? "FILE_TOO_LARGE" : "INVALID_FILE_SIGNATURE",
    );
  }
}

export function createComplaintAttachmentToken(input: {
  ownerId: string;
  attachmentId?: string;
  mimeType: SupportedMimeType;
}) {
  const extension = MIME_TO_EXTENSION[input.mimeType];
  const payload: AttachmentTokenPayload = {
    version: TOKEN_VERSION,
    attachmentId: input.attachmentId || randomUUID(),
    ownerId: input.ownerId,
    mimeType: input.mimeType,
    extension,
  };
  const iv = randomBytes(TOKEN_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    token: encodeTokenPart(Buffer.concat([iv, cipher.getAuthTag(), encrypted])),
    payload,
  };
}

function decodeComplaintAttachmentToken(token: string): AttachmentTokenPayload | null {
  try {
    const encoded = decodeTokenPart(token);
    if (encodeTokenPart(encoded) !== token) return null;
    if (encoded.length <= TOKEN_IV_BYTES + TOKEN_TAG_BYTES) return null;
    const iv = encoded.subarray(0, TOKEN_IV_BYTES);
    const tag = encoded.subarray(TOKEN_IV_BYTES, TOKEN_IV_BYTES + TOKEN_TAG_BYTES);
    const encrypted = encoded.subarray(TOKEN_IV_BYTES + TOKEN_TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv);
    decipher.setAuthTag(tag);
    const decoded = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<AttachmentTokenPayload>;
    if (
      parsed.version !== TOKEN_VERSION ||
      typeof parsed.attachmentId !== "string" ||
      typeof parsed.ownerId !== "string" ||
      !isSupportedMimeType(parsed.mimeType || "") ||
      parsed.extension !== MIME_TO_EXTENSION[parsed.mimeType as SupportedMimeType]
    ) {
      return null;
    }
    return parsed as AttachmentTokenPayload;
  } catch {
    return null;
  }
}

const ATTACHMENT_URL_PATTERN = /^\/uploads\/complaints\/([A-Za-z0-9_-]+)\.(jpg|png|webp|gif)$/;

function attachmentFilePath(token: string, extension: string) {
  const root = path.resolve(COMPLAINT_ATTACHMENT_UPLOAD_DIR);
  const candidate = path.resolve(root, `${token}.${extension}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new ComplaintAttachmentSecurityError(
      "Attachment path is outside the local complaint upload directory.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }
  return candidate;
}

function resolveComplaintAttachmentReference(url: string) {
  const match = ATTACHMENT_URL_PATTERN.exec(url);
  if (!match || match[0] !== url || path.basename(url).length > 255) {
    throw new ComplaintAttachmentSecurityError(
      "Attachments must reference an image issued by the complaint upload endpoint.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }
  const payload = decodeComplaintAttachmentToken(match[1]);
  if (!payload || payload.extension !== match[2]) {
    throw new ComplaintAttachmentSecurityError(
      "Attachment reference does not match an issued image.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }
  return { payload, filePath: attachmentFilePath(match[1], match[2]) };
}

/** Reads private bytes only after token verification and server-derived authorization. */
export async function readComplaintAttachment(
  filename: string,
  viewer: { userId: string; canViewAll: boolean },
) {
  const { payload, filePath } = resolveComplaintAttachmentReference(
    `/uploads/complaints/${filename}`,
  );
  if (payload.ownerId !== viewer.userId && !viewer.canViewAll) {
    throw new ComplaintAttachmentSecurityError(
      "You do not have permission to view this attachment.",
      "ATTACHMENT_FORBIDDEN",
    );
  }

  if (isDemoMode()) {
    const memoryRecord = demoMemoryAttachments.get(payload.attachmentId);
    if (!memoryRecord) {
      throw new ComplaintAttachmentSecurityError(
        "The referenced complaint attachment is unavailable.",
        "ATTACHMENT_NOT_FOUND",
      );
    }
    return { buffer: memoryRecord.buffer, mimeType: payload.mimeType };
  }

  try {
    // Never follow a file symlink outside the private upload directory.
    const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const fileStat = await file.stat();
      if (!fileStat.isFile()) {
        throw new ComplaintAttachmentSecurityError(
          "The referenced attachment is not an image file.",
          "INVALID_ATTACHMENT_REFERENCE",
        );
      }
      assertComplaintAttachmentSize(fileStat.size);
      const buffer = await file.readFile();
      assertComplaintAttachmentSize(buffer.length);
      if (buffer.length !== fileStat.size) {
        throw new ComplaintAttachmentSecurityError(
          "The stored attachment has changed.",
          "INVALID_ATTACHMENT_REFERENCE",
        );
      }
      validateImageBytes(buffer, payload.mimeType);
      return { buffer, mimeType: payload.mimeType };
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof ComplaintAttachmentSecurityError) throw error;
    throw new ComplaintAttachmentSecurityError(
      "The referenced complaint attachment is unavailable.",
      "ATTACHMENT_NOT_FOUND",
    );
  }
}

/**
 * Validates a generated local reference and binds it to the current owner.
 * External URLs and ordinary root-relative paths deliberately do not pass.
 */
export async function validateComplaintAttachmentReference(
  attachment: ComplaintAttachment,
  ownerId: string,
): Promise<ComplaintAttachment> {
  const { payload, filePath } = resolveComplaintAttachmentReference(attachment.url);
  if (payload.ownerId !== ownerId) {
    throw new ComplaintAttachmentSecurityError(
      "This attachment was not issued for the authenticated complaint owner.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }

  if (attachment.id && attachment.id !== payload.attachmentId) {
    throw new ComplaintAttachmentSecurityError(
      "Attachment metadata does not match its issued reference.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }
  if (attachment.mime_type && attachment.mime_type !== payload.mimeType) {
    throw new ComplaintAttachmentSecurityError(
      "Attachment MIME metadata does not match its issued reference.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }

  if (isDemoMode()) {
    const memoryRecord = demoMemoryAttachments.get(payload.attachmentId);
    if (!memoryRecord) {
      throw new ComplaintAttachmentSecurityError(
        "The referenced complaint attachment no longer exists.",
        "ATTACHMENT_NOT_FOUND",
      );
    }
    return {
      ...attachment,
      id: payload.attachmentId,
      url: attachment.url,
      mime_type: payload.mimeType,
    };
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    throw new ComplaintAttachmentSecurityError(
      "The referenced complaint attachment no longer exists.",
      "ATTACHMENT_NOT_FOUND",
    );
  }
  if (fileStat.size < 1 || fileStat.size > MAX_FILE_SIZE_BYTES) {
    throw new ComplaintAttachmentSecurityError(
      "The referenced complaint attachment has an invalid size.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }
  if (attachment.size_bytes !== undefined && attachment.size_bytes !== fileStat.size) {
    throw new ComplaintAttachmentSecurityError(
      "Attachment size metadata does not match the stored file.",
      "INVALID_ATTACHMENT_REFERENCE",
    );
  }

  return {
    ...attachment,
    id: payload.attachmentId,
    url: attachment.url,
    mime_type: payload.mimeType,
  };
}

export async function validateComplaintAttachments(
  attachments: ComplaintAttachment[] | undefined,
  ownerId: string,
) {
  if (!attachments?.length) return [];
  return Promise.all(
    attachments.map((attachment) =>
      validateComplaintAttachmentReference(attachment, ownerId),
    ),
  );
}

export async function storeComplaintImage(input: {
  buffer: Buffer;
  declaredMimeType: string;
  ownerId: string;
  originalFilename?: string;
}) {
  assertComplaintAttachmentSize(input.buffer.length);
  const detected = validateImageBytes(input.buffer, input.declaredMimeType);
  const issued = createComplaintAttachmentToken({
    ownerId: input.ownerId,
    mimeType: detected.mimeType,
  });

  if (isDemoMode()) {
    demoMemoryAttachments.set(issued.payload.attachmentId, {
      buffer: input.buffer,
      mimeType: detected.mimeType,
      size: input.buffer.length,
    });
    return {
      id: issued.payload.attachmentId,
      url: `/uploads/complaints/${issued.token}.${detected.extension}`,
      filename: input.originalFilename || `${issued.payload.attachmentId}.${detected.extension}`,
      mime_type: detected.mimeType,
      size_bytes: input.buffer.length,
    } satisfies ComplaintAttachment;
  }

  const filePath = attachmentFilePath(issued.token, detected.extension);
  await mkdir(COMPLAINT_ATTACHMENT_UPLOAD_DIR, { recursive: true });
  await writeFile(filePath, input.buffer, { flag: "wx" });

  const fileStat = await stat(filePath);
  return {
    id: issued.payload.attachmentId,
    url: `/uploads/complaints/${issued.token}.${detected.extension}`,
    filename: input.originalFilename || `${issued.payload.attachmentId}.${detected.extension}`,
    mime_type: detected.mimeType,
    size_bytes: fileStat.size,
  } satisfies ComplaintAttachment;
}

export function getComplaintAttachmentPathForTesting(url: string) {
  const match = ATTACHMENT_URL_PATTERN.exec(url);
  if (!match) throw new Error("Invalid complaint attachment URL");
  return attachmentFilePath(match[1], match[2]);
}

export function parseComplaintAttachmentTokenForTesting(token: string) {
  return decodeComplaintAttachmentToken(token);
}

export { MAX_FILE_SIZE_BYTES as COMPLAINT_ATTACHMENT_MAX_BYTES };
