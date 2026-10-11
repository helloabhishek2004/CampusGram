import type {
  ComplaintStatus,
  SafetyTriage,
  SafetyTriageSignal,
} from "@smart-campus/contracts";

type HazardRule = {
  signal: SafetyTriageSignal;
  pattern: RegExp;
  context?: RegExp;
};

const HAZARD_RULES: readonly HazardRule[] = [
  {
    signal: "fire_or_smoke",
    pattern:
      /\b(?:fire(?![\s-]+(?:alarms?|extinguishers?|doors?|exits?|safety)\b)|smoke(?![\s-]+(?:detectors?|alarms?)\b)|flames?|ablaze)\b/g,
  },
  {
    signal: "electrical_hazard",
    pattern: /\b(?:electric(?:al)?\s+shocks?|electrocut(?:ed|ion|ing))\b/g,
  },
  {
    signal: "electrical_hazard",
    pattern: /\b(?:sparks?|sparking|arcing)\b/g,
    context:
      /\b(?:electric(?:al)?|switchboards?|sockets?|outlets?|wires?|wiring|cables?|plugs?|panels?|equipment|projectors?|fans?|chargers?|transformers?|appliances?)\b/,
  },
  {
    signal: "gas_leak",
    pattern:
      /\b(?:gas\s+(?:pipe\s+)?(?:is\s+)?(?:leaks?|leaking)|leaking\s+gas|(?:smell|odou?r)\s+of\s+gas)\b/g,
  },
  {
    signal: "medical_distress",
    pattern:
      /\b(?:unconscious|unresponsive|cannot\s+breathe|can't\s+breathe|unable\s+to\s+breathe|not\s+breathing|bleeding)\b/g,
  },
  {
    signal: "violence_or_threat",
    pattern:
      /\b(?:violent\s+threats?|(?:threaten(?:s|ed|ing)?|threats?)\s+(?:to\s+)?(?:kill|stab|shoot|attack)|(?:will|going\s+to)\s+(?:kill|stab|shoot|attack)|assault(?:ed|ing)?|attacked|attacking|shooting|stabbing)\b/g,
  },
  {
    signal: "structural_collapse",
    pattern: /\b(?:collaps(?:e|es|ed|ing)|caving\s+in|falling)\b/g,
    context:
      /\b(?:buildings?|ceilings?|roofs?|walls?|beams?|structures?|stairs?|bridges?|balcon(?:y|ies))\b/,
  },
];

// Negation is local to a clause, with a small word window around each match.
const CLAUSE_BOUNDARIES =
  /[.!?;,\n]+|\b(?:but|however|yet|although)\b|\band\b(?=\s+(?:a|an|the|there|someone|somebody|he|she|they|we|i|it|cannot|can't|unable|not\s+breathing)\b)/;
const NEGATION_BEFORE =
  /\b(?:no(?!\s+(?:doubt|question)\b)|not(?!\s+only\b)|never|without|neither|deny|denies|denied)\b/;
const NEGATION_AFTER =
  /^\s*(?:(?:is|are|was|were|has|have|had)\s+)?(?:been\s+)?(?:not(?!\s+(?:(?:a|an)\s+)?(?:drill|test|simulation|joke)\b)|no\s+longer|absent|ruled\s+out|false\s+alarm|extinguished|stopped|ended|fixed)\b/;
const NON_INCIDENT_CONTEXT =
  /\b(?:drills?|posters?|leaflets?|training|exercise|simulation|simulated|tests?|testing)\b/;
const ACTUAL_INCIDENT_CONTEXT =
  /\b(?:actual|real|active)\b|\bnot\s+(?:(?:a|an)\s+)?(?:drill|test|simulation)\b/;

function isAffirmativeMatch(clause: string, match: RegExpMatchArray): boolean {
  const index = match.index ?? 0;
  const before = clause.slice(0, index).trim().split(/\s+/).slice(-6).join(" ");
  const after = clause
    .slice(index + match[0].length)
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");

  if (NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after)) return false;

  const nearby = `${before} ${match[0]} ${after}`;
  return (
    !NON_INCIDENT_CONTEXT.test(nearby) || ACTUAL_INCIDENT_CONTEXT.test(nearby)
  );
}

/**
 * Unvalidated English deterministic triage, independent of counts and report age.
 * A missing signal is not safety clearance. Explanations contain generic codes only.
 */
export function deriveSafetyTriage(
  text: string,
  status: ComplaintStatus = "submitted",
): SafetyTriage {
  const clauses = text
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .split(CLAUSE_BOUNDARIES);
  const signals = new Set<SafetyTriageSignal>();

  for (const rule of HAZARD_RULES) {
    for (const clause of clauses) {
      if (rule.context && !rule.context.test(clause)) continue;
      if (
        [...clause.matchAll(rule.pattern)].some((match) =>
          isAffirmativeMatch(clause, match),
        )
      ) {
        signals.add(rule.signal);
        break;
      }
    }
  }

  return {
    review_required: status === "submitted" && signals.size > 0,
    signals: [...signals],
    basis: "deterministic_rules",
    policy_version: "phase1-v1",
  };
}
