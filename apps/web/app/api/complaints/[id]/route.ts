import { NextRequest, NextResponse } from "next/server";
import {
  ComplaintLifecycleError,
  getComplaintStatusHistory,
  getComplaints,
  updateComplaintLifecycle,
} from "../../../../lib/complaints/complaint-repository";
import { resolveServerIdentity } from "../../../../lib/auth/server-identity";
import { canManageComplaints } from "../../../../lib/complaints/complaint-permissions";
import { projectComplaintForApi } from "../../../../lib/complaints/complaint-projection";
import {
  ComplaintLifecycleUpdateSchema,
  ComplaintDetailResponseSchema,
  ComplaintRecordSchema,
} from "@smart-campus/contracts";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true, request: req });
    if (!identity) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Sign in with your institutional account to view this complaint.",
          },
        },
        { status: 401 },
      );
    }

    const canViewAll = canManageComplaints(identity.profile);
    const { id } = await params;
    const { complaints } = await getComplaints("all", {
      userId: identity.userId,
      canViewAll,
    });

    // Keep ownership checks ahead of projection/history, even if a repository
    // snapshot accidentally includes rows outside the requested viewer scope.
    const visibleComplaints = complaints
      .filter((c) => canViewAll || c.complainant_id === identity.userId)
      .map(projectComplaintForApi);
    const complaint = visibleComplaints.find((c) => c.id === id);
    if (!complaint) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Complaint not found.",
          },
        },
        { status: 404 },
      );
    }

    // The public ID represents cluster + compatible incident scope, rather than
    // the raw legacy cluster which may combine unrelated locations or issues.
    const peerComplaints = visibleComplaints.filter(
      (c) => c.cluster_id === complaint.cluster_id && c.id !== complaint.id,
    );

    const response = {
      success: true,
      complaint,
      peer_complaints: peerComplaints,
      status_history: await getComplaintStatusHistory(complaint.id),
    };
    ComplaintRecordSchema.parse(response.complaint);
    response.peer_complaints.forEach((peer) => ComplaintRecordSchema.parse(peer));
    return NextResponse.json(ComplaintDetailResponseSchema.parse(response), { status: 200 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Unable to load this complaint right now.",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true, request: req });
    if (!identity) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in to manage complaints." } },
        { status: 401 },
      );
    }
    if (!canManageComplaints(identity.profile)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Only authorized complaint staff may manage complaints." } },
        { status: 403 },
      );
    }

    const parsed = ComplaintLifecycleUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_FAILED", message: "Invalid complaint lifecycle update.", details: parsed.error.format() } },
        { status: 400 },
      );
    }
    const { id } = await params;
    const updated = await updateComplaintLifecycle({
      complaintId: id,
      actorId: identity.userId,
      canManage: true,
      update: parsed.data,
    });
    const response = {
      success: true,
      complaint: ComplaintRecordSchema.parse(projectComplaintForApi(updated)),
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof ComplaintLifecycleError) {
      const status = error.code === "FORBIDDEN"
        ? 403
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "PERSISTENCE_FAILED"
            ? 500
            : 409;
      // Do not forward exception text: even typed errors may wrap SQL details
      // or private row contents. Keep known lifecycle failures actionable.
      const messages: Record<ComplaintLifecycleError["code"], string> = {
        FORBIDDEN: "Only authorized complaint staff may update a complaint.",
        NOT_FOUND: "Complaint not found.",
        INVALID_TRANSITION: "Cannot transition complaint to the requested status.",
        VALIDATION_FAILED: "A response note is required when a complaint is resolved or rejected.",
        PERSISTENCE_FAILED: "Unable to save the complaint update. Please try again.",
      };
      return NextResponse.json(
        { success: false, error: { code: error.code, message: messages[error.code] } },
        { status },
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Failed to update complaint." } },
      { status: 500 },
    );
  }
}
