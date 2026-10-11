import {
  COMPLAINT_ACTIVE_STATUSES,
  COMPLAINT_EMERGENCY_THRESHOLD,
  COMPLAINT_INCIDENT_WINDOW_MS,
  type ComplaintRecord,
} from "@smart-campus/contracts";
import { deriveSafetyTriage } from "./safety-triage";

const TOPIC_RULES: readonly (readonly [string, RegExp])[] = [
  ["projector", /\bprojectors?\b/],
  ["window", /\bwindows?\b/],
  ["fan", /\bfans?\b/],
  ["network", /\b(?:wi[\s-]?fi|internet|networks?|routers?|wireless)\b/],
  ["water", /\b(?:water|taps?|pipes?|plumbing|flood(?:s|ing)?)\b/],
  [
    "sanitation",
    /\b(?:sanitation|garbage|waste|toilets?|washrooms?|bathrooms?|sewage|drainage)\b/,
  ],
  [
    "electrical",
    /\b(?:electric(?:al|ity)?|power|switchboards?|wires?|wiring|sockets?|outlets?|sparks?|sparking|ac)\b/,
  ],
  [
    "medical",
    /\b(?:medical|unconscious|unresponsive|breath(?:e|ing)?|bleeding|injur(?:y|ies|ed))\b/,
  ],
  [
    "security",
    /\b(?:security|harassment|assault(?:ed|ing)?|violen(?:ce|t)|threat(?:s|en(?:s|ed|ing)?)?|attack(?:s|ed|ing)?)\b/,
  ],
  [
    "structural",
    /\b(?:structural|collaps(?:e|es|ed|ing)|ceilings?|roofs?|walls?|beams?)\b/,
  ],
];

// Whole ASCII identifiers only: one letter, or an alphanumeric/hyphenated ID
// containing a digit. Ordinary words after "block"/"room" are not identifiers.
const IDENTIFIER = "[a-z0-9]+(?:-[a-z0-9]+)*";
const IS_IDENTIFIER = /^(?:[a-z]|[a-z0-9-]*\d[a-z0-9-]*)$/;
const BUILDING_PATTERN = new RegExp(
  `\\b(block|building|tower|wing)[\\s:#-]+(${IDENTIFIER})(?=$|[\\s,.;:!?()])`,
  "g",
);
const HOSTEL_PATTERN = new RegExp(
  `\\b(hostel|dorm|dormitory)[\\s:#-]+(${IDENTIFIER})(?=$|[\\s,.;:!?()])`,
  "g",
);
const ROOM_PATTERN = new RegExp(
  `\\b(room|lab|hall)[\\s:#-]+(${IDENTIFIER})(?=$|[\\s,.;:!?()])`,
  "g",
);
const CAMPUS_PLACE_PATTERN =
  /\b(?:north library|south library|library|canteen)\b/;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\|/g, " ").replace(/\s+/g, " ").trim();
}

function identifierMention(
  text: string,
  pattern: RegExp,
): RegExpMatchArray | undefined {
  return [...text.matchAll(pattern)].find((match) =>
    IS_IDENTIFIER.test(match[2]),
  );
}

function buildingFromText(text: string): string {
  const building = identifierMention(text, BUILDING_PATTERN);
  if (building) return `${building[1]} ${building[2]}`;

  const hostel = identifierMention(text, HOSTEL_PATTERN);
  if (hostel) return `hostel ${hostel[2]}`;

  return text.match(CAMPUS_PLACE_PATTERN)?.[0] ?? "";
}

function explicitLocation(
  value: string | null | undefined,
  pattern: RegExp,
  building: boolean,
): string {
  const normalized = normalize(value ?? "");
  const mention = identifierMention(normalized, pattern);
  // Preserve other explicit names rather than discarding unknown qualifiers.
  if (!mention || mention[0] !== normalized) return normalized;
  if (!building) return mention[2];
  const kind = /^(?:dorm|dormitory)$/.test(mention[1]) ? "hostel" : mention[1];
  return `${kind} ${mention[2]}`;
}

/** Small compatibility guard, not a classifier; student categories are ignored. */
export function deriveIncidentScope(
  input: Pick<ComplaintRecord, "text" | "location_building" | "location_room">,
): string {
  const text = normalize(input.text);
  const topic =
    TOPIC_RULES.find(([, pattern]) => pattern.test(text))?.[0] ??
    `unknown:${text}`;
  const explicitBuilding = explicitLocation(
    input.location_building,
    BUILDING_PATTERN,
    true,
  );
  const building = explicitBuilding
    ? explicitLocation(explicitBuilding, HOSTEL_PATTERN, true)
    : buildingFromText(text);
  const room =
    explicitLocation(input.location_room, ROOM_PATTERN, false) ||
    identifierMention(text, ROOM_PATTERN)?.[2] ||
    "";

  // Empty segments mean missing; they never wildcard-match a known location.
  return `${topic}|${building}|${room}`;
}

function createdAtMs(value: string): number {
  // Canonical timestamps must include a timezone. Reject calendar rollovers that
  // Date.parse would otherwise accept (for example February 30).
  const match =
    /^(\d{4})-(\d{2})-(\d{2})t(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.exec(
      value,
    );
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    day < 1 ||
    day > (days[month - 1] ?? 0) ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59
  ) {
    return NaN;
  }

  const parsed = Date.parse(value);
  const fractionalMs = Number(`0.${match[7] ?? "0"}`) * 1000;
  // Retain PostgreSQL microseconds at the cutoff/future boundary.
  return parsed + (fractionalMs - Math.floor(fractionalMs));
}

/** Eligible corroboration uses the canonical owner and original created_at only. */
export function isActiveIncidentReport(
  record: Pick<ComplaintRecord, "status" | "created_at" | "complainant_id">,
  nowMs: number = Date.now(),
): boolean {
  if (
    !Number.isFinite(nowMs) ||
    typeof record.complainant_id !== "string" ||
    record.complainant_id.trim().length === 0 ||
    !COMPLAINT_ACTIVE_STATUSES.some((status) => status === record.status)
  ) {
    return false;
  }
  const created = createdAtMs(record.created_at);
  return (
    Number.isFinite(created) &&
    created > nowMs - COMPLAINT_INCIDENT_WINDOW_MS &&
    created <= nowMs
  );
}

/**
 * Aggregate a complete internal snapshot BEFORE owner/API projection. A legacy
 * cluster ID is partitioned by compatible scope; one canonical owner contributes
 * once per partition. Ineligible rows have zero corroboration and no volume flag.
 * This pure helper does not provide retrieval, authorization or replay persistence.
 */
export function aggregateIncidents(
  records: readonly ComplaintRecord[],
  nowMs: number = Date.now(),
): ComplaintRecord[] {
  const eligible = records.map((record) =>
    isActiveIncidentReport(record, nowMs),
  );
  const keys = records.map((record) =>
    JSON.stringify([
      record.cluster_id,
      record.incident_scope?.trim() || deriveIncidentScope(record),
    ]),
  );
  const ownersByIncident = new Map<string, Set<string>>();

  records.forEach((record, index) => {
    if (!eligible[index]) return;
    const owners = ownersByIncident.get(keys[index]) ?? new Set<string>();
    owners.add(record.complainant_id!);
    ownersByIncident.set(keys[index], owners);
  });

  return records.map((record, index) => {
    const count = eligible[index]
      ? (ownersByIncident.get(keys[index])?.size ?? 0)
      : 0;
    return {
      ...record,
      similar_count: count,
      is_emergency: eligible[index] && count >= COMPLAINT_EMERGENCY_THRESHOLD,
      safety_triage: deriveSafetyTriage(record.text, record.status),
    };
  });
}
