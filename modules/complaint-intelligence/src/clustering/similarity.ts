/**
 * Phase 2 Curated English stop words that NEVER include negation or equipment/identifiers.
 * 'a' is preserved so single-letter building/block names (e.g. 'Block A', 'Hostel A') are retained.
 * 'no', 'not', 'off' are preserved so operational/safety status is never erased.
 */
export const COMPLAINT_STOP_WORDS = new Set([
  "the",
  "is",
  "in",
  "at",
  "of",
  "on",
  "and",
  "an",
  "to",
  "for",
  "there",
  "from",
  "this",
  "that",
  "with",
]);

/**
 * Normalizes text conservatively:
 * 1. NFKC Unicode normalization to preserve Malayalam and accented characters
 * 2. Casing to lowercase
 * 3. Normalizes common campus equipment/networking variants (e.g. 'wi-fi', 'wi fi' -> 'wifi')
 * 4. Collapses excessive character repetitions (3+ identical characters collapsed to 1)
 */
export function normalizeComplaintText(text: string): string {
  let s = text.normalize("NFKC").toLowerCase();
  s = s.replace(/\bwi[\s-]+fi\b/g, "wifi");
  // Collapse 3+ repeated characters (e.g. 'brooooken' -> 'broken')
  s = s.replace(/(.)\1{2,}/gu, "$1");
  return s;
}

const IS_IDENTIFIER = /^(?:[a-z]|[a-z0-9-]*\d[a-z0-9-]*)$/i;

export interface ExtractedIncidentLocations {
  blocks: Set<string>;
  rooms: Set<string>;
}

/**
 * Extracts explicit building/block and room identifiers from complaint text.
 */
export function extractIncidentLocations(text: string): ExtractedIncidentLocations {
  const norm = normalizeComplaintText(text);
  const blocks = [
    ...norm.matchAll(
      /\b(?:hostel\s+)?(block|building|hostel|dorm|dormitory|wing|tower)[\s:#-]+([a-z0-9-]+)\b/gi,
    ),
  ]
    .map((m) => m[2].toLowerCase())
    .filter((id) => IS_IDENTIFIER.test(id));

  const rooms = [
    ...norm.matchAll(
      /\b(room|lab|classroom|hall)[\s:#-]+([a-z0-9-]+)\b/gi,
    ),
  ]
    .map((m) => m[2].toLowerCase())
    .filter((id) => IS_IDENTIFIER.test(id));

  return { blocks: new Set(blocks), rooms: new Set(rooms) };
}

/**
 * Checks for direct, irreconcilable operational contradictions between two texts:
 * 1. Location conflicts (e.g. Block A vs Block B, Room 204 vs Room 205)
 * 2. Direct negation contradictions (e.g. 'water leak' vs 'no water leak', 'working' vs 'not working')
 * 3. Temporal / inspection conflicts (e.g. distinct days of the week, routine inspection vs active hazard)
 */
export function hasDirectIncidentContradiction(textA: string, textB: string): {
  hasConflict: boolean;
  reason?: string;
} {
  const normA = normalizeComplaintText(textA);
  const normB = normalizeComplaintText(textB);

  // 1. Location conflicts
  const locA = extractIncidentLocations(textA);
  const locB = extractIncidentLocations(textB);
  if (locA.blocks.size > 0 && locB.blocks.size > 0) {
    const hasCommonBlock = [...locA.blocks].some((b) => locB.blocks.has(b));
    if (!hasCommonBlock) {
      return { hasConflict: true, reason: "location_conflict_block" };
    }
  }
  if (locA.rooms.size > 0 && locB.rooms.size > 0) {
    const hasCommonRoom = [...locA.rooms].some((r) => locB.rooms.has(r));
    if (!hasCommonRoom) {
      return { hasConflict: true, reason: "location_conflict_room" };
    }
  }

  // 2. Direct negation contradictions
  const isAffirmWorkingA =
    /\b(?:is|are)\s+working\b/.test(normA) && !/\bnot\s+working\b/.test(normA);
  const isAffirmWorkingB =
    /\b(?:is|are)\s+working\b/.test(normB) && !/\bnot\s+working\b/.test(normB);
  const isNegWorkingA = /\b(?:not|nt)\s+(?:working|wrking)\b/.test(normA);
  const isNegWorkingB = /\b(?:not|nt)\s+(?:working|wrking)\b/.test(normB);
  if (
    (isAffirmWorkingA && isNegWorkingB) ||
    (isAffirmWorkingB && isNegWorkingA)
  ) {
    return { hasConflict: true, reason: "negation_conflict_working" };
  }

  const isAffirmLeakA =
    /\bwater\s+leak\b/.test(normA) && !/\bno\s+water\s+leak\b/.test(normA);
  const isAffirmLeakB =
    /\bwater\s+leak\b/.test(normB) && !/\bno\s+water\s+leak\b/.test(normB);
  const isNegLeakA = /\bno\s+water\s+leak\b/.test(normA);
  const isNegLeakB = /\bno\s+water\s+leak\b/.test(normB);
  if ((isAffirmLeakA && isNegLeakB) || (isAffirmLeakB && isNegLeakA)) {
    return { hasConflict: true, reason: "negation_conflict_leak" };
  }

  // 3. Temporal / routine inspection conflicts
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "today",
    "tomorrow",
    "yesterday",
  ];
  const dayA = days.find((d) => new RegExp(`\\b${d}\\b`).test(normA));
  const dayB = days.find((d) => new RegExp(`\\b${d}\\b`).test(normB));
  if (dayA && dayB && dayA !== dayB) {
    return { hasConflict: true, reason: "temporal_day_conflict" };
  }

  const inspPattern =
    /(?:routine|scheduled|planned)\s+(?:[a-z0-9-]+\s+)?inspection/;
  if (inspPattern.test(normA) !== inspPattern.test(normB)) {
    return { hasConflict: true, reason: "routine_inspection_vs_incident" };
  }

  return { hasConflict: false };
}

/**
 * Tokenizes text preserving Unicode letters (such as Malayalam script),
 * digits, short identifiers ('a', 'b', 'no', 'not', 'ac'), and filtering only curated stop words.
 */
export function tokenize(text: string): Set<string> {
  const norm = normalizeComplaintText(text);
  const words = norm.match(/[^\s\p{P}\p{S}]+/gu) || [];
  const filtered = words.filter((w) => !COMPLAINT_STOP_WORDS.has(w));
  return new Set(filtered);
}

/**
 * Computes Jaccard similarity between two texts.
 * If a direct incident contradiction (e.g. cross-block location conflict,
 * opposite negation state, or temporal mismatch) is detected, returns 0.
 */
export function computeJaccardSimilarity(textA: string, textB: string): number {
  if (hasDirectIncidentContradiction(textA, textB).hasConflict) {
    return 0;
  }

  const setA = tokenize(textA);
  const setB = tokenize(textB);

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize > 0 ? Number((intersectionSize / unionSize).toFixed(3)) : 0;
}
