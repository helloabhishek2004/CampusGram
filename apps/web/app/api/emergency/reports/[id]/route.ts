import { NextRequest, NextResponse } from "next/server";
import { emergencyService } from "../../../../../lib/emergency/emergency-service";
import { UpdateEmergencyReportStatusInputSchema } from "@smart-campus/contracts";
import { resolveServerIdentity } from "../../../../../lib/auth/server-identity";
import { canViewAllEmergencyReports } from "../../../../../lib/emergency/emergency-permissions";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reportId } = await context.params;
    if (!reportId || typeof reportId !== "string" || reportId.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing report ID" },
        { status: 400 }
      );
    }

    const identity = await resolveServerIdentity({ allowDemo: true });
    if (!identity) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only responders / staff can transition emergency report lifecycle statuses
    const isResponder = canViewAllEmergencyReports(identity.profile);
    if (!isResponder) {
      return NextResponse.json(
        { success: false, error: "Responder authorization required" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, error: "Request body is required" },
        { status: 400 }
      );
    }

    const parsed = UpdateEmergencyReportStatusInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parsed.error.format(),
        },
        { status: 400 }
      );
    }

    const updatedReport = await emergencyService.updateReportStatus(
      reportId,
      parsed.data.status,
      parsed.data.expected_previous_status,
      {
        userId: identity.userId,
        fullName: identity.profile?.fullName || "Authorized Responder",
      },
      parsed.data.note
    );

    return NextResponse.json({
      success: true,
      message: `Emergency report ${updatedReport.public_ref} transitioned to ${updatedReport.status.toUpperCase()}`,
      report: updatedReport,
    });
  } catch (error) {
    const message = (error as Error).message || "Internal server error";
    if (message.includes("not found")) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (message.includes("Invalid status transition") || message.includes("Conflict:")) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reportId } = await context.params;
    if (!reportId || typeof reportId !== "string" || reportId.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing report ID" },
        { status: 400 }
      );
    }

    const identity = await resolveServerIdentity({ allowDemo: true });
    if (!identity) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only responders / authorized staff can inspect lifecycle history
    const isResponder = canViewAllEmergencyReports(identity.profile);
    if (!isResponder) {
      return NextResponse.json(
        { success: false, error: "Responder authorization required" },
        { status: 403 }
      );
    }

    const history = await emergencyService.getReportHistory(reportId);
    return NextResponse.json({
      success: true,
      reportId,
      history,
    });
  } catch (error) {
    const message = (error as Error).message || "Internal server error";
    if (message.includes("not found")) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

