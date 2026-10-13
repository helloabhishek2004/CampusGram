import { computeJaccardSimilarity } from "./similarity";
import { SimilarIssueMatch, IssueClusterMatch } from "@smart-campus/contracts";

export interface CandidateIssue {
  complaint_id: string;
  title: string;
  text: string;
  status?:
    "submitted" | "under_review" | "in_progress" | "resolved" | "rejected";
}

export function findSimilarCandidates(
  text: string,
  candidates: CandidateIssue[] = [],
  threshold: number = 0.25,
): IssueClusterMatch {
  const matches: SimilarIssueMatch[] = [];

  for (const candidate of candidates) {
    const score = computeJaccardSimilarity(
      text,
      `${candidate.title} ${candidate.text}`,
    );
    if (score >= threshold) {
      matches.push({
        complaint_id: candidate.complaint_id,
        title: candidate.title,
        similarity_score: score,
        status: candidate.status,
        summary: candidate.text,
      });
    }
  }

  matches.sort(
    (a, b) =>
      b.similarity_score - a.similarity_score ||
      a.complaint_id.localeCompare(b.complaint_id),
  );

  const bestMatch = matches[0];
  const isDuplicate = Boolean(bestMatch && bestMatch.similarity_score >= 0.5);

  return {
    is_potential_duplicate: isDuplicate,
    cluster_id: isDuplicate ? `CLUSTER-${bestMatch.complaint_id}` : null,
    confidence: bestMatch ? bestMatch.similarity_score : 0,
    similar_issues: matches,
  };
}
