import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { analyzeComplaint } from "../src/index";

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(),
}));

const mockedGoogleGenAI = vi.mocked(GoogleGenAI);

const modelAnalysis = {
  category: "infrastructure",
  subcategory: "electrical",
  title_summary: "Switchboard sparking in Lab 102",
  summary: "A switchboard is producing sparks in Lab 102.",
  severity: {
    level: "critical",
    score: 9.5,
    urgency_reasoning: "Sparking equipment presents a safety risk.",
  },
  location: {
    building: "Block A",
    floor: null,
    room: "102",
    area: null,
    raw_mention: "Lab 102 Block A",
  },
  entities: [],
  suggested_recipient: {
    department: "Campus Maintenance",
    role: "Electrical Engineer",
    confidence: 0.9,
    reasoning: "The issue concerns electrical infrastructure.",
  },
  overall_confidence: 0.9,
  tags: ["infrastructure", "electrical"],
};

describe("Module 2 provider and provenance regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env.GEMINI_API_KEY;
  });

  it("fails closed when Gemini is explicitly selected without an API key", async () => {
    const response = await analyzeComplaint(
      {
        complaint_id: "CMP-NO-KEY",
        text: "The switchboard is sparking in Lab 102.",
      },
      { provider: "gemini" },
    );

    expect(response).toMatchObject({
      success: false,
      processing: { status: "failed", provider: "gemini" },
      error: {
        code: "PROVIDER_CONFIGURATION_ERROR",
        message: "Gemini provider is unavailable because no API key is configured.",
      },
    });
    expect(response.processing.model).toBeUndefined();
    expect(mockedGoogleGenAI).not.toHaveBeenCalled();
  });

  it("uses the SDK without sending identifiers and recomputes cluster matches", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        ...modelAnalysis,
        cluster_match: {
          is_potential_duplicate: true,
          cluster_id: "CLUSTER-MODEL-FABRICATED",
          confidence: 1,
          similar_issues: [
            {
              complaint_id: "CMP-MODEL-FABRICATED",
              title: "Untrusted model match",
              similarity_score: 1,
            },
          ],
        },
      }),
    });

    mockedGoogleGenAI.mockImplementation(
      () => ({ models: { generateContent } }) as never,
    );

    const response = await analyzeComplaint(
      {
        complaint_id: "CMP-PRIVATE-ID",
        text: "The switchboard is sparking in Lab 102.",
        complainant: {
          user_id: "USER-PRIVATE-ID",
          department: "Private Department",
          programme: "Private Programme",
          semester: 7,
          class: "Private Class",
        },
        metadata: {
          source: "private-source",
          created_at: "private-timestamp",
        },
      },
      {
        provider: "gemini",
        apiKey: "test-sdk-key",
        modelName: "gemini-test-model",
        historicalCandidates: [
          {
            complaint_id: "CMP-AUTHORITATIVE",
            title: "Sparking switchboard in Lab 102",
            text: "The switchboard is sparking in Lab 102.",
            status: "submitted",
          },
        ],
      },
    );

    expect(response.success).toBe(true);
    expect(response.processing).toMatchObject({
      provider: "gemini",
      model: "gemini-test-model",
    });
    expect(response.analysis?.cluster_match?.similar_issues).toEqual([
      expect.objectContaining({ complaint_id: "CMP-AUTHORITATIVE" }),
    ]);
    expect(response.analysis?.cluster_match?.similar_issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ complaint_id: "CMP-MODEL-FABRICATED" }),
      ]),
    );

    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(prompt).not.toContain("CMP-PRIVATE-ID");
    expect(prompt).not.toContain("USER-PRIVATE-ID");
    expect(prompt).not.toContain("Private Department");
    expect(prompt).not.toContain("private-source");
    expect(prompt).not.toContain("private-timestamp");
  });

  it("returns a sanitized provider error when the SDK fails", async () => {
    const secretProviderError = new Error(
      "provider failed with raw model output: PRIVATE-MODEL-CONTENT",
    );
    const generateContent = vi.fn().mockRejectedValue(secretProviderError);
    mockedGoogleGenAI.mockImplementation(
      () => ({ models: { generateContent } }) as never,
    );

    const response = await analyzeComplaint(
      {
        complaint_id: "CMP-SDK-FAILURE",
        text: "The network is unavailable in the library.",
      },
      { provider: "gemini", apiKey: "test-sdk-key" },
    );

    expect(response.success).toBe(false);
    expect(response.error).toEqual({
      code: "PROCESSING_FAILED",
      message: "Complaint analysis could not be completed.",
    });
    expect(JSON.stringify(response)).not.toContain("PRIVATE-MODEL-CONTENT");
  });

  it("does not use a model cluster match when no candidates are supplied", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        ...modelAnalysis,
        cluster_match: {
          is_potential_duplicate: true,
          cluster_id: "CLUSTER-MODEL-FABRICATED",
          confidence: 1,
          similar_issues: [],
        },
      }),
    });
    mockedGoogleGenAI.mockImplementation(
      () => ({ models: { generateContent } }) as never,
    );

    const response = await analyzeComplaint(
      {
        complaint_id: "CMP-GEMINI-NO-CANDIDATES",
        text: "The switchboard is sparking in Lab 102.",
      },
      { provider: "gemini", apiKey: "test-sdk-key" },
    );

    expect(response.success).toBe(true);
    expect(response.analysis?.cluster_match).toEqual({
      is_potential_duplicate: false,
      cluster_id: null,
      confidence: 0,
      similar_issues: [],
    });
  });

  it("returns an empty cluster when no candidates are supplied", async () => {
    const response = await analyzeComplaint(
      {
        complaint_id: "CMP-NO-CANDIDATES",
        text: "The library network is unavailable.",
      },
      { provider: "mock" },
    );

    expect(response.success).toBe(true);
    expect(response.analysis?.cluster_match).toEqual({
      is_potential_duplicate: false,
      cluster_id: null,
      confidence: 0,
      similar_issues: [],
    });
  });
});
