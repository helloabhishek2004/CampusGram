import { NextRequest, NextResponse } from "next/server";
import { resolveServerIdentity } from "../../../../../lib/auth/server-identity";
import { canManageComplaints } from "../../../../../lib/complaints/complaint-permissions";
import {
  ComplaintAttachmentSecurityError,
  readComplaintAttachment,
} from "../../../../../lib/complaints/attachment-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true, request: req });
    if (!identity) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in to view complaint evidence." } },
        { status: 401, headers: PRIVATE_HEADERS },
      );
    }
    const { filename } = await params;
    const { buffer, mimeType } = await readComplaintAttachment(filename, {
      userId: identity.userId,
      canViewAll: canManageComplaints(identity.profile),
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: { ...PRIVATE_HEADERS, "Content-Type": mimeType },
    });
  } catch (error) {
    const forbidden = error instanceof ComplaintAttachmentSecurityError &&
      error.code === "ATTACHMENT_FORBIDDEN";
    const status = forbidden ? 403 : error instanceof ComplaintAttachmentSecurityError ? 404 : 500;
    return NextResponse.json(
      { success: false, error: {
        code: forbidden ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "SERVER_ERROR",
        message: forbidden ? "You do not have permission to view this attachment." : "Complaint attachment unavailable.",
      } },
      { status, headers: PRIVATE_HEADERS },
    );
  }
}
