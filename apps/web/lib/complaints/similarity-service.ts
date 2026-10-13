import { computeJaccardSimilarity } from "@smart-campus/complaint-intelligence";
import { DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD } from "@smart-campus/contracts";

export interface ExistingComplaintCandidate {
  id: string;
  text: string;
  cluster_id: string;
}

export interface ClusterMatchResult {
  matched: boolean;
  cluster_id: string;
  similarity_score: number;
  matched_complaint_id?: string;
}

/**
 * Gets the configured similarity threshold.
 * Uses COMPLAINT_SIMILARITY_THRESHOLD env variable if valid, otherwise DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD (0.35).
 */
export function getSimilarityThreshold(): number {
  const envVal = process.env.COMPLAINT_SIMILARITY_THRESHOLD;
  if (envVal) {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD;
}

/**
 * Finds the best matching cluster for a newly submitted complaint text.
 * NOTE: As per strict architectural rules, IMAGES ARE COMPLETELY EXCLUDED from similarity detection.
 * Similarity detection operates ONLY on text.
 */
export function findMatchingCluster(
  newText: string,
  existingComplaints: ExistingComplaintCandidate[],
  threshold: number = getSimilarityThreshold(),
): ClusterMatchResult {
  if (!newText || existingComplaints.length === 0) {
    const newClusterId = `cluster_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      matched: false,
      cluster_id: newClusterId,
      similarity_score: 0,
    };
  }

  let bestScore = 0;
  let bestCandidate: ExistingComplaintCandidate | null = null;

  for (const candidate of existingComplaints) {
    const score = computeJaccardSimilarity(newText, candidate.text);
    if (
      score > bestScore ||
      (score === bestScore &&
        bestCandidate !== null &&
        candidate.id.localeCompare(bestCandidate.id) < 0)
    ) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate && bestScore >= threshold) {
    return {
      matched: true,
      cluster_id: bestCandidate.cluster_id,
      similarity_score: bestScore,
      matched_complaint_id: bestCandidate.id,
    };
  }

  // No candidate reached threshold; generate a new cluster identifier
  const newClusterId = `cluster_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    matched: false,
    cluster_id: newClusterId,
    similarity_score: bestScore,
  };
}
