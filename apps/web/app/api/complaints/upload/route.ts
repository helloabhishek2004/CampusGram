import { NextRequest, NextResponse } from "next/server";
import { resolveServerIdentity } from "../../../../lib/auth/server-identity";
import {
  ComplaintAttachmentSecurityError,
  storeComplaintImage,
} from "../../../../lib/complaints/attachment-security";

export async function POST(req: NextRequest) {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true, request: req });
    if (!identity) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in with your institutional account to upload complaint evidence." } },
        { status: 401 },
      );
    }
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_FILE",
            message: "No file was uploaded. Please provide an image file.",
          },
        },
        { status: 400 },
      );
    }

    const blob = file as Blob & { name?: string };
    const attachment = await storeComplaintImage({
      buffer: Buffer.from(await blob.arrayBuffer()),
      declaredMimeType: blob.type,
      ownerId: identity.userId,
      originalFilename: blob.name,
    });

    return NextResponse.json({
      success: true,
      attachment,
    });
  } catch (error) {
    if (error instanceof ComplaintAttachmentSecurityError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 400 },
      );
    }
    console.error("Image upload failed.");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UPLOAD_FAILED",
          message: "Unable to store the complaint attachment right now.",
        },
      },
      { status: 500 },
    );
  }
}
