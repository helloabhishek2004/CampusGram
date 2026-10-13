import { NextRequest, NextResponse } from "next/server";
import { analyzeComplaint } from "@smart-campus/complaint-intelligence";
import {
  ComplaintAnalysisRequestSchema,
  ComplaintAnalysisResponse,
} from "@smart-campus/contracts";
import { resolveServerIdentity } from "../../../../lib/auth/server-identity";

export async function POST(req: NextRequest) {
  try {
    if (!(await resolveServerIdentity({ allowDemo: true, request: req }))) {
      return NextResponse.json(
        {
          success: false,
          complaint_id: "unknown",
          processing: { status: "failed", processed_at: new Date().toISOString() },
          error: { code: "UNAUTHENTICATED", message: "Sign in with your institutional account to analyze a complaint." },
        } satisfies ComplaintAnalysisResponse,
        { status: 401 },
      );
    }
    const body = await req.json();

    // Validate payload against contract schema
    const parsed = ComplaintAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      const errorResponse: ComplaintAnalysisResponse = {
        success: false,
        complaint_id: body?.complaint_id || "unknown",
        processing: {
          status: "failed",
          processed_at: new Date().toISOString(),
        },
        error: {
          code: "VALIDATION_ERROR",
          message: "Request does not meet ComplaintAnalysisRequest schema",
          details: parsed.error.format(),
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Call Module 2 intelligence processor (force mock in demo mode)
    const forceMock = process.env.CAMPUSGRAM_DEMO_MODE === "true";
    const response: ComplaintAnalysisResponse = await analyzeComplaint(
      parsed.data,
      forceMock ? { provider: "mock" } : undefined,
    );

    return NextResponse.json(response, {
      status: response.success ? 200 : 500,
    });
  } catch (error) {
    const errorResponse: ComplaintAnalysisResponse = {
      success: false,
      complaint_id: "unknown",
      processing: {
        status: "failed",
        processed_at: new Date().toISOString(),
      },
      error: {
        code: "SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Internal server error occurred",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
