import { NextRequest, NextResponse } from "next/server";
import {
  CreateComplaintRequestSchema,
  ComplaintListQuerySchema,
  CreateComplaintResponse,
  ComplaintListResponse,
  CreateComplaintResponseSchema,
  ComplaintListResponseSchema,
} from "@smart-campus/contracts";
import {
  createComplaint,
  getComplaints,
  ComplaintSubmissionError,
} from "../../../lib/complaints/complaint-repository";
import { resolveServerIdentity } from "../../../lib/auth/server-identity";
import { canManageComplaints } from "../../../lib/complaints/complaint-permissions";
import { projectComplaintForApi } from "../../../lib/complaints/complaint-projection";
import {
  ComplaintAttachmentSecurityError,
  validateComplaintAttachments,
} from "../../../lib/complaints/attachment-security";

/**
 * GET /api/complaints
 * Returns list of complaints filtered by view (all | normal | emergency).
 * Each complaint reflects its group count and real-time emergency classification.
 */
export async function GET(req: NextRequest) {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true, request: req });
    if (!identity) {
      return NextResponse.json(
        { success: false, complaints: [], counts: { total: 0, normal: 0, emergency: 0 }, error: { code: "UNAUTHENTICATED", message: "Sign in with your institutional account to view complaints." } },
        { status: 401 },
      );
    }
    const { searchParams } = new URL(req.url);
    const viewParam = searchParams.get("view") || "all";

    const parsedQuery = ComplaintListQuerySchema.safeParse({ view: viewParam });
    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          success: false,
          complaints: [],
          counts: { total: 0, normal: 0, emergency: 0 },
          error: {
            code: "VALIDATION_FAILED",
            message: "view must be one of all, normal, or emergency.",
          },
        },
        { status: 400 },
      );
    }
    const view = parsedQuery.data.view;

    const canViewAll = canManageComplaints(identity.profile);
    const { complaints, counts } = await getComplaints(view, {
      userId: identity.userId,
      canViewAll,
    });

    const response: ComplaintListResponse = {
      success: true,
      complaints: complaints.map(projectComplaintForApi),
      counts,
    };

    return NextResponse.json(ComplaintListResponseSchema.parse(response), { status: 200 });
  } catch {
    console.error("GET /api/complaints: unable to read complaints.");
    const errorResponse: ComplaintListResponse = {
      success: false,
      complaints: [],
      counts: { total: 0, normal: 0, emergency: 0 },
      error: {
        code: "SERVER_ERROR",
        message: "Unable to load complaints right now.",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * POST /api/complaints
 * Submits a new complaint.
 * Automatically performs text-only similarity grouping.
 * Escalates eligible incident reports at five active distinct owners in 24h.
 * Potential-hazard review is independent; replay never adds corroboration.
 */
export async function POST(req: NextRequest) {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true, request: req });
    if (!identity) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in with your institutional account to submit a complaint." } },
        { status: 401 },
      );
    }
    const body = await req.json();

    const parsed = CreateComplaintRequestSchema.safeParse(body);
    if (!parsed.success) {
      const errorResponse: CreateComplaintResponse = {
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Request payload does not meet CreateComplaintRequest schema",
          details: parsed.error.format(),
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    let attachments;
    try {
      attachments = await validateComplaintAttachments(
        parsed.data.attachments,
        identity.userId,
      );
    } catch (error) {
      if (error instanceof ComplaintAttachmentSecurityError) {
        return NextResponse.json(
          { success: false, error: { code: error.code, message: error.message } },
          { status: 400 },
        );
      }
      throw error;
    }

    // Ownership always comes from the resolved server identity. Ignore any
    // complainant_id supplied by the browser.
    const result = await createComplaint({
      ...parsed.data,
      attachments,
      complainant_id: identity.userId,
    });

    const projected = projectComplaintForApi(result.complaint);
    const response: CreateComplaintResponse = {
      success: true,
      replayed: result.replayed,
      complaint: projected,
      cluster: { ...result.cluster, cluster_id: projected.cluster_id },
    };

    return NextResponse.json(CreateComplaintResponseSchema.parse(response), { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof ComplaintSubmissionError) {
      const status = error.code === "IDEMPOTENCY_CONFLICT" ? 409 : error.code === "INVALID_REQUEST" ? 400 : 500;
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status });
    }
    console.error("POST /api/complaints: unable to save complaint.");
    const errorResponse: CreateComplaintResponse = {
      success: false,
      error: {
        code: error instanceof Error && error.message.startsWith("Complaint persistence failed")
          ? "PERSISTENCE_FAILED"
          : "SERVER_ERROR",
        message: error instanceof Error && error.message.startsWith("Complaint persistence failed")
          ? "Complaint could not be saved. No success was recorded."
          : "Unable to create complaint right now.",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
