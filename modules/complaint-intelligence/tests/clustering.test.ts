import { describe, it, expect } from "vitest";
import { computeJaccardSimilarity } from "../src/clustering/similarity";
import { findSimilarCandidates } from "../src/clustering/match";

describe("Module 2: Similarity and Clustering", () => {
  it("calculates positive similarity for overlapping vocabulary", () => {
    const textA = "projector not working in room 304";
    const textB = "projector is broken and not powering on in room 304";

    const sim = computeJaccardSimilarity(textA, textB);
    expect(sim).toBeGreaterThan(0.3);
  });

  it("identifies potential duplicates from candidate issues", () => {
    const text =
      "Wi-Fi is dropping continuously in Library reading hall 2nd floor";
    const candidates = [
      {
        complaint_id: "CMP-EXISTING-01",
        title: "Wi-Fi disconnecting continuously in Library 2nd Floor",
        text: "Wi-Fi keeps dropping in the central library reading hall 2nd floor",
        status: "in_progress" as const,
      },
      {
        complaint_id: "CMP-EXISTING-02",
        title: "Broken window in hostel B",
        text: "Glass window pane shattered in room 12",
        status: "submitted" as const,
      },
    ];

    const match = findSimilarCandidates(text, candidates);
    expect(match.similar_issues.length).toBeGreaterThanOrEqual(1);
    expect(match.similar_issues[0].complaint_id).toBe("CMP-EXISTING-01");
    expect(match.is_potential_duplicate).toBe(true);
  });

  describe("Phase 2 Deterministic Duplicate & Similarity Regressions", () => {
    it("preserves Malayalam characters and accurately computes similarity for Malayalam reports", () => {
      const textA = "ഹോസ്റ്റൽ എയിൽ വെള്ളം ഇല്ല";
      const textB = "ഹോസ്റ്റൽ എയിൽ വെള്ളം ലഭിക്കുന്നില്ല";
      const sim = computeJaccardSimilarity(textA, textB);
      // Both have 3 shared tokens: 'ഹോസ്റ്റൽ', 'എയിൽ', 'വെള്ളം'
      expect(sim).toBeGreaterThanOrEqual(0.5);
    });

    it("matches mixed Malayalam and English complaints without dropping Malayalam text", () => {
      const english = "No water in hostel A washroom";
      const mixedMalayalam = "Hostel A washroom ൽ വെള്ളം ഇല്ല";
      const romanizedMalayalam = "hostel A washroom vellam illa pls";

      const simMixed = computeJaccardSimilarity(english, mixedMalayalam);
      const simRoman = computeJaccardSimilarity(english, romanizedMalayalam);

      expect(simMixed).toBeGreaterThanOrEqual(0.35);
      expect(simRoman).toBeGreaterThanOrEqual(0.35);
    });

    it("rejects cross-location reports about distinct blocks or rooms even with identical wording", () => {
      // Different blocks
      const blockA = "Water leak in hostel Block A.";
      const blockB = "Water leak in hostel Block B.";
      expect(computeJaccardSimilarity(blockA, blockB)).toBe(0);

      // Different hostels
      const hostelA = "No water supply in hostel A";
      const hostelB = "No water supply in hostel B";
      expect(computeJaccardSimilarity(hostelA, hostelB)).toBe(0);

      // Different rooms
      const room204 = "Please fix broken projector in room 204";
      const room205 = "Please fix broken window in room 205";
      expect(computeJaccardSimilarity(room204, room205)).toBe(0);
    });

    it("rejects direct negation contradictions where an issue is negated vs affirmed", () => {
      const leak = "Water leak beside north library entrance";
      const noLeak =
        "No water leak beside north library entrance; only a broken sign";
      expect(computeJaccardSimilarity(leak, noLeak)).toBe(0);

      const working = "Library internet is working";
      const notWorking = "Library internet is not working";
      expect(computeJaccardSimilarity(working, notWorking)).toBe(0);
    });

    it("rejects distinct scheduled days or routine inspections vs active incidents", () => {
      const monday = "Library network outage on Monday";
      const friday = "Library network outage on Friday";
      expect(computeJaccardSimilarity(monday, friday)).toBe(0);

      const today = "There is a problem in the campus today";
      const tomorrow = "There is a problem in the campus tomorrow";
      expect(computeJaccardSimilarity(today, tomorrow)).toBe(0);

      const hazard = "Smoke from sparking switchboard in Lab 102 Block A";
      const routine = "Routine switchboard inspection in Lab 102 Block A";
      expect(computeJaccardSimilarity(hazard, routine)).toBe(0);
    });

    it("normalizes wi-fi variants and short acronyms like AC and identifiers", () => {
      const wifiHyphen = "Wi-Fi router unavailable in library";
      const wifiNoHyphen = "wifi router unavailable in library";
      expect(computeJaccardSimilarity(wifiHyphen, wifiNoHyphen)).toBe(1.0);

      const acLower = "ac is off";
      const acUpper = "AC is off";
      expect(computeJaccardSimilarity(acLower, acUpper)).toBe(1.0);
    });

    it("breaks ties deterministically by complaint_id on equal similarity scores", () => {
      const text = "Broken fan in room 102";
      const candidates = [
        {
          complaint_id: "CMP-02",
          title: "Broken fan in room 102",
          text: "Broken fan in room 102",
          status: "submitted" as const,
        },
        {
          complaint_id: "CMP-01",
          title: "Broken fan in room 102",
          text: "Broken fan in room 102",
          status: "submitted" as const,
        },
      ];

      const match = findSimilarCandidates(text, candidates);
      expect(match.similar_issues[0].complaint_id).toBe("CMP-01");
      expect(match.similar_issues[1].complaint_id).toBe("CMP-02");
    });
  });
});
