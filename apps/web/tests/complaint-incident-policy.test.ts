import { describe, expect, it, vi } from "vitest";
import {
  COMPLAINT_ACTIVE_STATUSES,
  COMPLAINT_INCIDENT_WINDOW_MS,
  ComplaintRecordSchema,
  CreateComplaintRequestSchema,
  CreateComplaintResponseSchema,
  SafetyTriageSchema,
  SafetyTriageSignalSchema,
  type ComplaintRecord,
  type ComplaintStatus,
  type SafetyTriageSignal,
} from "@smart-campus/contracts";
import { deriveSafetyTriage } from "../lib/complaints/safety-triage";
import {
  aggregateIncidents,
  deriveIncidentScope,
  isActiveIncidentReport,
} from "../lib/complaints/incident-policy";

const NOW = Date.parse("2026-10-11T12:00:00.000Z");
const CUTOFF = NOW - COMPLAINT_INCIDENT_WINDOW_MS;
const SUBMISSION_ID = "f1db8f06-3e38-4a83-93cc-1790b975f056";

function report(overrides: Partial<ComplaintRecord> = {}): ComplaintRecord {
  return {
    id: "report-1",
    complainant_id: "canonical-owner-1",
    text: "No water supply in hostel Block A",
    status: "submitted",
    attachments: [],
    cluster_id: "legacy-cluster",
    similar_count: 99,
    is_emergency: true,
    created_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

describe("Phase 1 additive complaint contracts", () => {
  it("preserves old payloads and record defaults without requiring Phase 1 fields", () => {
    const oldRecord = ComplaintRecordSchema.parse({
      id: "old-report",
      text: "Projector malfunction",
      cluster_id: "old-cluster",
      created_at: "legacy-timestamp",
    });
    expect(oldRecord).toEqual({
      id: "old-report",
      text: "Projector malfunction",
      cluster_id: "old-cluster",
      created_at: "legacy-timestamp",
      status: "submitted",
      attachments: [],
      is_emergency: false,
      similar_count: 1,
    });
    expect(
      CreateComplaintRequestSchema.parse({ text: "Projector malfunction" }),
    ).toEqual({ text: "Projector malfunction" });
    expect(
      CreateComplaintResponseSchema.parse({
        success: true,
        complaint: oldRecord,
      }),
    ).toEqual({ success: true, complaint: oldRecord });
    expect(COMPLAINT_INCIDENT_WINDOW_MS).toBe(86_400_000);
    expect(COMPLAINT_ACTIVE_STATUSES).toEqual([
      "submitted",
      "under_review",
      "in_progress",
    ]);
  });

  it("accepts nullable internal metadata and validates optional UUID/replay fields", () => {
    const withMetadata = report({
      incident_scope: "water|block a|",
      submission_id: SUBMISSION_ID,
      submission_fingerprint: "internal-fingerprint",
      safety_triage: deriveSafetyTriage("Electric shock from a switchboard"),
    });
    expect(ComplaintRecordSchema.parse(withMetadata)).toEqual(withMetadata);
    expect(
      ComplaintRecordSchema.safeParse(
        report({
          incident_scope: null,
          submission_id: null,
          submission_fingerprint: null,
        }),
      ).success,
    ).toBe(true);
    expect(
      ComplaintRecordSchema.safeParse(report({ submission_id: "not-a-uuid" }))
        .success,
    ).toBe(false);
    expect(
      CreateComplaintRequestSchema.parse({
        text: "Broken projector",
        submission_id: SUBMISSION_ID,
      }).submission_id,
    ).toBe(SUBMISSION_ID);
    for (const submission_id of [null, "not-a-uuid"]) {
      expect(
        CreateComplaintRequestSchema.safeParse({
          text: "Broken projector",
          submission_id,
        }).success,
      ).toBe(false);
    }
    expect(
      CreateComplaintResponseSchema.parse({ success: true, replayed: true })
        .replayed,
    ).toBe(true);
    expect(
      CreateComplaintResponseSchema.safeParse({
        success: true,
        replayed: "true",
      }).success,
    ).toBe(false);
  });

  it("permits only generic, versioned deterministic safety explanations", () => {
    const triage = deriveSafetyTriage(
      "Private fictional description: a student is unconscious.",
    );
    expect(SafetyTriageSchema.parse(triage)).toEqual(triage);
    expect(Object.keys(triage).sort()).toEqual([
      "basis",
      "policy_version",
      "review_required",
      "signals",
    ]);
    expect(
      SafetyTriageSignalSchema.safeParse("Private fictional description")
        .success,
    ).toBe(false);
    for (const invalid of [
      { ...triage, signals: ["Private fictional description"] },
      { ...triage, review_required: "true" },
      { ...triage, basis: "validated_model" },
      { ...triage, policy_version: "other-policy" },
    ]) {
      expect(SafetyTriageSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("independent deterministic safety triage", () => {
  it.each<[string, SafetyTriageSignal[]]>([
    [
      "Electric shock from switchboard in Lab 102 Block A.",
      ["electrical_hazard"],
    ],
    ["The switchboard is sparking in Lab 102.", ["electrical_hazard"]],
    ["Sparking equipment beside the library.", ["electrical_hazard"]],
    [
      "Smoke from a sparking switchboard.",
      ["fire_or_smoke", "electrical_hazard"],
    ],
    ["An active fire in the hostel.", ["fire_or_smoke"]],
    ["The hostel is on fire.", ["fire_or_smoke"]],
    ["Gas leak in the chemistry lab.", ["gas_leak"]],
    ["Gas is leaking in the lab.", ["gas_leak"]],
    ["A student is unconscious and cannot breathe.", ["medical_distress"]],
    ["A student can't breathe beside the library.", ["medical_distress"]],
    ["A student is bleeding beside the canteen.", ["medical_distress"]],
    [
      "Someone is threatening to kill me near the gate.",
      ["violence_or_threat"],
    ],
    ["A student is being attacked near the gate.", ["violence_or_threat"]],
    ["The roof is collapsing over the hall.", ["structural_collapse"]],
  ])("requests review for an affirmative report: %s", (text, signals) => {
    expect(deriveSafetyTriage(text)).toEqual({
      review_required: true,
      signals,
      basis: "deterministic_rules",
      policy_version: "phase1-v1",
    });
  });

  it.each([
    "Please replace the faded fire drill poster; there is no fire.",
    "There is no fire or smoke from the switchboard.",
    "The socket is not sparking.",
    "No electric shock from the switchboard.",
    "This is not a gas leak, just paint odour.",
    "The gas leak was ruled out.",
    "The student is not unconscious.",
    "No bleeding is present.",
    "There are no violent threats.",
    "The roof is not collapsing.",
    "Test the gas leak sensor as part of the routine drill.",
    "The poster explains electric shock procedures.",
    "Please replace the smoke detector battery.",
    "Fireworks and smokeless equipment for the event.",
    "Sparks of inspiration at the coding club.",
    "I faced harassment near the academic block.",
    "Projector not working in room 204.",
    "",
  ])("suppresses clear nonhazard/negated context: %s", (text) => {
    const result = deriveSafetyTriage(text);
    expect(result.review_required).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it.each<[string, SafetyTriageSignal[]]>([
    ["No fire here, but gas is leaking.", ["gas_leak"]],
    ["No smoke; the switchboard is sparking.", ["electrical_hazard"]],
    ["No gas leak. A student cannot breathe.", ["medical_distress"]],
    [
      "No smoke before, but smoke is coming from the socket now.",
      ["fire_or_smoke"],
    ],
    [
      "The student is not unconscious and cannot breathe.",
      ["medical_distress"],
    ],
    ["This is an actual fire during the drill.", ["fire_or_smoke"]],
    ["The fire is not a drill.", ["fire_or_smoke"]],
  ])(
    "keeps affirmative hazards independent of other clauses: %s",
    (text, signals) => {
      expect(deriveSafetyTriage(text).signals).toEqual(signals);
      expect(deriveSafetyTriage(text).review_required).toBe(true);
    },
  );

  it.each<ComplaintStatus>([
    "submitted",
    "under_review",
    "in_progress",
    "resolved",
    "rejected",
  ])(
    "retains signals while respecting the pending-review lifecycle: %s",
    (status) => {
      const result = deriveSafetyTriage(
        "Electric shock from the socket",
        status,
      );
      expect(result.signals).toEqual(["electrical_hazard"]);
      expect(result.review_required).toBe(status === "submitted");
    },
  );
});

describe("rolling 24-hour corroboration eligibility", () => {
  it.each<ComplaintStatus>([
    "submitted",
    "under_review",
    "in_progress",
    "resolved",
    "rejected",
  ])("counts only active lifecycle states: %s", (status) => {
    expect(isActiveIncidentReport(report({ status }), NOW)).toBe(
      status === "submitted" ||
        status === "under_review" ||
        status === "in_progress",
    );
  });

  it.each<[string, Partial<ComplaintRecord>, boolean]>([
    ["at now", { created_at: new Date(NOW).toISOString() }, true],
    [
      "just inside cutoff",
      { created_at: new Date(CUTOFF + 1).toISOString() },
      true,
    ],
    [
      "exactly at cutoff",
      { created_at: new Date(CUTOFF).toISOString() },
      false,
    ],
    [
      "before cutoff",
      { created_at: new Date(CUTOFF - 1).toISOString() },
      false,
    ],
    ["future", { created_at: new Date(NOW + 1).toISOString() }, false],
    ["null owner", { complainant_id: null }, false],
    ["missing owner", { complainant_id: undefined }, false],
    ["empty owner", { complainant_id: "  " }, false],
    ["invalid date", { created_at: "not-a-timestamp" }, false],
    ["empty date", { created_at: "" }, false],
    ["timezone missing", { created_at: "2026-10-11T11:00:00" }, false],
    ["invalid hour rollover", { created_at: "2026-10-10T24:00:00Z" }, false],
    [
      "recent edit of an old report",
      {
        created_at: new Date(CUTOFF).toISOString(),
        updated_at: new Date(NOW).toISOString(),
      },
      false,
    ],
  ])(
    "handles %s without counting an edit/replay as a new owner",
    (_label, overrides, expected) => {
      expect(isActiveIncidentReport(report(overrides), NOW)).toBe(expected);
    },
  );

  it("rejects impossible calendar dates instead of accepting Date.parse rollover", () => {
    const marchNow = Date.parse("2026-03-02T12:00:00Z");
    expect(
      isActiveIncidentReport(
        report({ created_at: "2026-02-30T11:00:00Z" }),
        marchNow,
      ),
    ).toBe(false);
    expect(
      isActiveIncidentReport(
        report({ created_at: "2026-03-02T11:00:00Z" }),
        marchNow,
      ),
    ).toBe(true);
  });

  it("compares timezone offsets and sub-millisecond boundaries consistently", () => {
    expect(
      isActiveIncidentReport(
        report({ created_at: "2026-10-11T17:30:00+05:30" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isActiveIncidentReport(
        report({ created_at: "2026-10-10T12:00:00.000000Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isActiveIncidentReport(
        report({ created_at: "2026-10-10T12:00:00.000001Z" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isActiveIncidentReport(
        report({ created_at: "2026-10-11T12:00:00.000001Z" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("uses the current clock by default and excludes invalid supplied clocks", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NOW);
      expect(isActiveIncidentReport(report())).toBe(true);
      expect(aggregateIncidents([report()])[0].similar_count).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    expect(isActiveIncidentReport(report(), NaN)).toBe(false);
    expect(isActiveIncidentReport(report(), Infinity)).toBe(false);
  });
});

describe("small deterministic incident compatibility scope", () => {
  it.each([
    ["Projector broken in Block A room 204", "projector|block a|204"],
    ["Window broken near building A1 hall C", "window|building a1|c"],
    ["Fan rattling in wing B-2 room A-101", "fan|wing b-2|a-101"],
    ["Projector broken in tower B Lab 102", "projector|tower b|102"],
    ["No water in hostel A", "water|hostel a|"],
    ["No water in dorm B", "water|hostel b|"],
    ["No water in dormitory A", "water|hostel a|"],
    ["Wi-Fi unavailable beside north library", "network|north library|"],
    ["Wireless unavailable beside south library", "network|south library|"],
    ["Internet unavailable in library", "network|library|"],
    ["Router unavailable in canteen", "network|canteen|"],
    ["Network issue near library Block A room 1", "network|block a|1"],
    ["Garbage in room 102", "sanitation||102"],
    ["Electric shock in Block B", "electrical|block b|"],
    ["Student unconscious in hall 3", "medical||3"],
    ["Violent threats in room A", "security||a"],
    ["Roof collapsing in Block A", "structural|block a|"],
    ["Broken window in room available", "window||"],
    ["Projector in lab Å", "projector||"],
    [" Help   please ", "unknown:help please||"],
    ["ഹോസ്റ്റലിൽ വെള്ളം ഇല്ല", "unknown:ഹോസ്റ്റലിൽ വെള്ളം ഇല്ല||"],
  ])("derives a conservative scope for %s", (text, expected) => {
    expect(deriveIncidentScope({ text })).toBe(expected);
  });

  it("uses authoritative explicit locations first and normalizes recognizable forms", () => {
    const explicit = deriveIncidentScope({
      text: "Broken projector in Block B room 205",
      location_building: "  BLOCK-A ",
      location_room: " ROOM:204 ",
    });
    expect(explicit).toBe("projector|block a|204");
    expect(explicit).toBe(
      deriveIncidentScope({ text: "Projector broken in block A lab 204" }),
    );
    expect(
      deriveIncidentScope({
        text: "No water in Block B",
        location_building: " DORM-A ",
      }),
    ).toBe("water|hostel a|");
    expect(
      deriveIncidentScope({
        text: "Fan in room 204",
        location_building: " Science   Annex ",
        location_room: "Seminar East",
      }),
    ).toBe("fan|science annex|seminar east");
    expect(
      deriveIncidentScope({
        text: "Window in block B room A",
        location_building: "  ",
        location_room: null,
      }),
    ).toBe("window|block b|a");
  });

  it("prioritizes known equipment/issues in order, with no category authority", () => {
    const first = report({
      text: "Projector and window beside a fan with network, water, electrical and roof issues",
      category: "security",
    });
    expect(deriveIncidentScope(first)).toBe("projector||");
    const otherCategory = { ...first, category: "academic" };
    expect(deriveIncidentScope(otherCategory)).toBe(deriveIncidentScope(first));
    expect(deriveIncidentScope({ text: "Windows and a fan broken" })).toBe(
      "window||",
    );
    expect(deriveIncidentScope({ text: "Fan and router broken" })).toBe(
      "fan||",
    );
    expect(deriveIncidentScope({ text: "Network and water unavailable" })).toBe(
      "network||",
    );
  });

  it("preserves block/room one-letter IDs, missing-vs-known and unknown full-text distinctions", () => {
    const scopes = [
      "Window issue in block A room A",
      "Window issue in block B room A",
      "Window issue in block A room B",
      "Window issue in block A",
      "Window issue",
    ].map((text) => deriveIncidentScope({ text }));
    expect(new Set(scopes).size).toBe(5);
    expect(deriveIncidentScope({ text: "Help please" })).not.toBe(
      deriveIncidentScope({ text: "Help tomorrow" }),
    );
  });
});

describe("global distinct-owner incident aggregation", () => {
  it("recomputes distinct global owners before row projection and crosses the five-owner threshold", () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      report({
        id: `report-${index + 1}`,
        complainant_id: `canonical-owner-${index + 1}`,
        status:
          COMPLAINT_ACTIVE_STATUSES[index % COMPLAINT_ACTIVE_STATUSES.length],
      }),
    );
    const four = aggregateIncidents(records.slice(0, 4), NOW);
    expect(
      four.every((row) => row.similar_count === 4 && !row.is_emergency),
    ).toBe(true);
    const five = aggregateIncidents(records, NOW);
    expect(
      five.every((row) => row.similar_count === 5 && row.is_emergency),
    ).toBe(true);
    const permitted = five.filter(
      (row) => row.complainant_id === "canonical-owner-1",
    );
    expect(permitted).toHaveLength(1);
    expect(permitted[0].similar_count).toBe(5);
    expect(permitted[0].safety_triage?.review_required).toBe(false);
  });

  it("counts five submissions by one canonical complainant as one contributor", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      report({ id: `repeated-${index}` }),
    );
    const result = aggregateIncidents(rows, NOW);
    expect(result).toHaveLength(5);
    expect(
      result.every((row) => row.similar_count === 1 && !row.is_emergency),
    ).toBe(true);
  });

  it("excludes closed, old, cutoff, invalid, future and ownerless records from corroboration", () => {
    const valid = report();
    const excluded = [
      report({
        id: "resolved",
        complainant_id: "resolved-owner",
        status: "resolved",
      }),
      report({
        id: "rejected",
        complainant_id: "rejected-owner",
        status: "rejected",
      }),
      report({
        id: "old",
        complainant_id: "old-owner",
        created_at: new Date(CUTOFF - 1).toISOString(),
      }),
      report({
        id: "cutoff",
        complainant_id: "cutoff-owner",
        created_at: new Date(CUTOFF).toISOString(),
      }),
      report({
        id: "invalid",
        complainant_id: "invalid-owner",
        created_at: "invalid",
      }),
      report({
        id: "future",
        complainant_id: "future-owner",
        created_at: new Date(NOW + 1).toISOString(),
      }),
      report({ id: "owner-null", complainant_id: null }),
    ];
    const result = aggregateIncidents([valid, ...excluded], NOW);
    expect(result[0].similar_count).toBe(1);
    expect(result[0].is_emergency).toBe(false);
    expect(
      result
        .slice(1)
        .every((row) => row.similar_count === 0 && !row.is_emergency),
    ).toBe(true);
    expect(result.map((row) => row.id)).toEqual(
      [valid, ...excluded].map((row) => row.id),
    );
  });

  it.each([
    [
      "rooms",
      "Projector broken in Block A room 204",
      "Projector broken in Block A room 205",
    ],
    [
      "equipment",
      "Projector broken in Block A room 204",
      "Window broken in Block A room 204",
    ],
    ["blocks", "No water in Block A room 204", "No water in Block B room 204"],
    ["missing location", "No water supply", "No water supply in Block A"],
  ])(
    "partitions a reused legacy cluster ID across incompatible %s",
    (_label, text, conflict) => {
      const same = Array.from({ length: 4 }, (_, index) =>
        report({
          id: `same-${index}`,
          complainant_id: `same-owner-${index}`,
          text,
        }),
      );
      const other = report({
        id: "other",
        complainant_id: "other-owner",
        text: conflict,
      });
      const result = aggregateIncidents([...same, other], NOW);
      expect(
        result
          .slice(0, 4)
          .every((row) => row.similar_count === 4 && !row.is_emergency),
      ).toBe(true);
      expect(result[4].similar_count).toBe(1);
      expect(result[4].is_emergency).toBe(false);
      expect(result.every((row) => row.cluster_id === "legacy-cluster")).toBe(
        true,
      );
    },
  );

  it("uses stored internal scope with a computed fallback for older records", () => {
    const scoped = Array.from({ length: 4 }, (_, index) =>
      report({
        id: `scoped-${index}`,
        complainant_id: `scoped-owner-${index}`,
        text: "Please check the service",
        incident_scope: "water|block a|",
      }),
    );
    const legacy = report({
      id: "legacy",
      complainant_id: "legacy-owner",
      incident_scope: null,
    });
    const result = aggregateIncidents([...scoped, legacy], NOW);
    expect(
      result.every((row) => row.similar_count === 5 && row.is_emergency),
    ).toBe(true);
    expect(result[4].incident_scope).toBeNull();
    expect(
      aggregateIncidents([report({ incident_scope: "  " })], NOW)[0]
        .similar_count,
    ).toBe(1);
  });

  it("keeps different legacy cluster IDs separate even with the same scope", () => {
    const result = aggregateIncidents(
      [
        report({ cluster_id: "cluster-one" }),
        report({
          id: "report-two",
          complainant_id: "owner-two",
          cluster_id: "cluster-two",
        }),
      ],
      NOW,
    );
    expect(result.map((row) => row.similar_count)).toEqual([1, 1]);
  });

  it("allows an owner at most one contribution per incident, independently across scope partitions", () => {
    const result = aggregateIncidents(
      [
        report({ id: "a-one", text: "No water in hostel A" }),
        report({ id: "a-repeat", text: "Water unavailable in hostel A" }),
        report({
          id: "a-other-owner",
          complainant_id: "owner-two",
          text: "Water outage in hostel A",
        }),
        report({ id: "b-same-owner", text: "No water in hostel B" }),
      ],
      NOW,
    );
    expect(result.map((row) => row.similar_count)).toEqual([2, 2, 2, 1]);
    expect(result.every((row) => !row.is_emergency)).toBe(true);
  });

  it("requests safety review for one hazard independently of volume", () => {
    const [hazard] = aggregateIncidents(
      [report({ text: "Electric shock from switchboard in Lab 102 Block A" })],
      NOW,
    );
    expect(hazard.similar_count).toBe(1);
    expect(hazard.is_emergency).toBe(false);
    expect(hazard.safety_triage?.review_required).toBe(true);
    expect(hazard.safety_triage?.signals).toEqual(["electrical_hazard"]);
  });

  it("derives submitted safety signals even for old, future, invalid or ownerless reports", () => {
    const result = aggregateIncidents(
      [
        report({ id: "old", created_at: new Date(CUTOFF - 1).toISOString() }),
        report({ id: "future", created_at: new Date(NOW + 1).toISOString() }),
        report({ id: "invalid", created_at: "invalid" }),
        report({ id: "owner-null", complainant_id: null }),
      ].map((row) => ({
        ...row,
        text: "A student is unconscious and cannot breathe",
      })),
      NOW,
    );
    expect(
      result.every((row) => row.similar_count === 0 && !row.is_emergency),
    ).toBe(true);
    expect(
      result.every(
        (row) =>
          row.safety_triage?.review_required &&
          row.safety_triage.signals.join() === "medical_distress",
      ),
    ).toBe(true);
  });

  it("does not mutate frozen input rows, existing triage or attachments", () => {
    const source = report({
      attachments: [{ url: "/fictional-image.png" }],
      safety_triage: deriveSafetyTriage("Electric shock from the socket"),
    });
    const snapshot = structuredClone(source);
    Object.freeze(source.attachments[0]);
    Object.freeze(source.attachments);
    Object.freeze(source.safety_triage!.signals);
    Object.freeze(source.safety_triage);
    Object.freeze(source);
    const records = Object.freeze([source]);
    const result = aggregateIncidents(records, NOW);
    expect(records).toEqual([snapshot]);
    expect(result).not.toBe(records);
    expect(result[0]).not.toBe(source);
    expect(result[0].similar_count).toBe(1);
    expect(result[0].is_emergency).toBe(false);
    expect(result[0].safety_triage?.signals).toEqual([]);
  });

  it("handles an empty global snapshot", () => {
    expect(aggregateIncidents([], NOW)).toEqual([]);
  });
});
