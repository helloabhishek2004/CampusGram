import {
  ComplaintAnalysisResponse,
  ComplaintAnalysisResponseSchema,
} from "@smart-campus/contracts";
import { validateComplaintInput } from "./validation/input";
import { generateMockAnalysis, runGeminiAnalysis } from "./ai/gemini";
import { IntelligenceOptions } from "./types/index";

export * from "./types/index";
export { findSimilarCandidates, type CandidateIssue } from "./clustering/match";
export {
  computeJaccardSimilarity,
  tokenize,
  normalizeComplaintText,
  extractIncidentLocations,
  hasDirectIncidentContradiction,
  COMPLAINT_STOP_WORDS,
  type ExtractedIncidentLocations,
} from "./clustering/similarity";
export { searchCandidates } from "./clustering/candidate-search";

/**
 * Public entry point for Module 2: Complaint Intelligence Processing.
 * Analyzes grievance text, extracts entities/location, calculates severity,
 * suggests responsible departments, and checks for potential duplicate issues.
 *
 * Supports deterministic mock mode by default. An explicitly selected Gemini
 * provider requires a configured API key and fails closed otherwise.
 */
export async function analyzeComplaint(
  request: unknown,
  options?: IntelligenceOptions,
): Promise<ComplaintAnalysisResponse> {
  const startTime = Date.now();

  // 1. Validate Input Contract
  const validation = validateComplaintInput(request);
  if (!validation.isValid) {
    const errorResponse: ComplaintAnalysisResponse = {
      success: false,
      complaint_id: getComplaintId(request),
      processing: {
        status: "failed",
        processed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      },
      error: {
        code: "INVALID_REQUEST_PAYLOAD",
        message:
          "Request validation failed against ComplaintAnalysisRequest schema",
        details: validation.errors,
      },
    };
    return ComplaintAnalysisResponseSchema.parse(errorResponse);
  }

  const validRequest = validation.data;

  // 2. Determine Provider
  const envProvider = process.env.AI_PROVIDER;
  const apiKey = options?.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  const provider =
    options?.provider ||
    (envProvider === "gemini" && apiKey ? "gemini" : "mock");

  if (provider === "gemini" && !apiKey) {
    return ComplaintAnalysisResponseSchema.parse({
      success: false,
      complaint_id: validRequest.complaint_id,
      processing: {
        status: "failed",
        provider: "gemini",
        processed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      },
      error: {
        code: "PROVIDER_CONFIGURATION_ERROR",
        message: "Gemini provider is unavailable because no API key is configured.",
      },
    });
  }

  try {
    let analysis;
    let modelUsed: string | undefined;

    if (provider === "gemini" && apiKey) {
      modelUsed = options?.modelName || "gemini-2.5-flash";
      analysis = await runGeminiAnalysis(
        validRequest,
        apiKey,
        modelUsed,
        options?.historicalCandidates,
      );
    } else {
      modelUsed = "mock-deterministic-v1";
      analysis = generateMockAnalysis(
        validRequest,
        options?.historicalCandidates,
      );
    }

    const response: ComplaintAnalysisResponse = {
      success: true,
      complaint_id: validRequest.complaint_id,
      processing: {
        status: "completed",
        provider,
        model: modelUsed,
        processed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      },
      analysis,
    };

    return ComplaintAnalysisResponseSchema.parse(response);
  } catch {
    const errorResponse: ComplaintAnalysisResponse = {
      success: false,
      complaint_id: validRequest.complaint_id,
      processing: {
        status: "failed",
        provider,
        processed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      },
      error: {
        code: "PROCESSING_FAILED",
        message: "Complaint analysis could not be completed.",
      },
    };

    return ComplaintAnalysisResponseSchema.parse(errorResponse);
  }
}

function getComplaintId(input: unknown): string {
  if (typeof input !== "object" || input === null) {
    return "unknown";
  }

  const complaintId = (input as Record<string, unknown>).complaint_id;
  return typeof complaintId === "string" && complaintId.trim().length > 0
    ? complaintId
    : "unknown";
}
