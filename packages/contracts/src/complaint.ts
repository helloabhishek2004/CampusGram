import { z } from "zod";

// ==============================================================================
// Enums and Primitives
// ==============================================================================

export const ComplaintCategorySchema = z.enum([
  "infrastructure",
  "academic",
  "hostel",
  "sanitation",
  "security",
  "administration",
  "it_services",
  "other",
]);
export type ComplaintCategory = z.infer<typeof ComplaintCategorySchema>;

export const ComplaintSeverityLevelSchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type ComplaintSeverityLevel = z.infer<
  typeof ComplaintSeverityLevelSchema
>;

export const ComplaintStatusSchema = z.enum([
  "submitted",
  "under_review",
  "in_progress",
  "resolved",
  "rejected",
]);
export type ComplaintStatus = z.infer<typeof ComplaintStatusSchema>;

// Unvalidated deterministic review signals, not a safety clearance or probability.
export const SafetyTriageSignalSchema = z.enum([
  "fire_or_smoke",
  "electrical_hazard",
  "gas_leak",
  "medical_distress",
  "violence_or_threat",
  "structural_collapse",
]);
export type SafetyTriageSignal = z.infer<typeof SafetyTriageSignalSchema>;

export const SafetyTriageSchema = z.object({
  review_required: z.boolean(),
  signals: z.array(SafetyTriageSignalSchema),
  basis: z.literal("deterministic_rules"),
  policy_version: z.literal("phase1-v1"),
});
export type SafetyTriage = z.infer<typeof SafetyTriageSchema>;

// ==============================================================================
// Attachments
// ==============================================================================

export const ComplaintAttachmentSchema = z.object({
  id: z.string().optional(),
  url: z.union([
    z.string().url(),
    z.string().regex(/^\/[^\s]+$/, "Must be a valid relative path starting with /"),
  ]),
  filename: z.string().optional(),
  mime_type: z.string().optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});
export type ComplaintAttachment = z.infer<typeof ComplaintAttachmentSchema>;

// ==============================================================================
// Intelligence Elements (Severity, Location, Entities, Matching)
// ==============================================================================

export const SeverityAnalysisSchema = z.object({
  level: ComplaintSeverityLevelSchema,
  score: z.number().min(0).max(10).describe("0-10 urgency and impact score"),
  urgency_reasoning: z
    .string()
    .describe("Explanation for assigned severity level"),
});
export type SeverityAnalysis = z.infer<typeof SeverityAnalysisSchema>;

export const LocationExtractionSchema = z.object({
  building: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  area: z
    .string()
    .nullable()
    .optional()
    .describe("e.g. Quadrangle, Library Hall, Cafeteria"),
  raw_mention: z
    .string()
    .nullable()
    .optional()
    .describe("Unparsed text snippet indicating location"),
});
export type LocationExtraction = z.infer<typeof LocationExtractionSchema>;

export const RecipientSuggestionSchema = z.object({
  department: z
    .string()
    .describe("e.g. Estate Office, IT Helpdesk, Hostel Warden"),
  role: z
    .string()
    .optional()
    .describe("e.g. Electrical Supervisor, Network Admin"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type RecipientSuggestion = z.infer<typeof RecipientSuggestionSchema>;

export const ExtractedEntitySchema = z.object({
  entity: z.string(),
  type: z.enum([
    "equipment",
    "facility",
    "person",
    "location",
    "datetime",
    "other",
  ]),
  description: z.string().optional(),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

export const SimilarIssueMatchSchema = z.object({
  complaint_id: z.string(),
  title: z.string(),
  similarity_score: z.number().min(0).max(1),
  status: ComplaintStatusSchema.optional(),
  summary: z.string().optional(),
});
export type SimilarIssueMatch = z.infer<typeof SimilarIssueMatchSchema>;

export const IssueClusterMatchSchema = z.object({
  is_potential_duplicate: z.boolean(),
  cluster_id: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  similar_issues: z.array(SimilarIssueMatchSchema).default([]),
});
export type IssueClusterMatch = z.infer<typeof IssueClusterMatchSchema>;

// ==============================================================================
// Full Complaint Analysis Result Schema
// ==============================================================================

export const ComplaintAnalysisSchema = z.object({
  category: ComplaintCategorySchema,
  subcategory: z.string(),
  title_summary: z
    .string()
    .describe("Concise 1-sentence headline of the problem"),
  summary: z.string().describe("Clear structured description of the issue"),
  severity: SeverityAnalysisSchema,
  location: LocationExtractionSchema,
  entities: z.array(ExtractedEntitySchema).default([]),
  suggested_recipient: RecipientSuggestionSchema,
  cluster_match: IssueClusterMatchSchema.optional(),
  overall_confidence: z.number().min(0).max(1),
  tags: z.array(z.string()).default([]),
});
export type ComplaintAnalysis = z.infer<typeof ComplaintAnalysisSchema>;

// ==============================================================================
// Module 1 <-> Module 2 Request Contract
// ==============================================================================

export const ComplaintAnalysisRequestSchema = z.object({
  complaint_id: z.string(),
  complainant: z
    .object({
      user_id: z.string().optional(),
      department: z.string().optional(),
      programme: z.string().optional(),
      semester: z.number().int().optional(),
      class: z.string().optional(),
    })
    .optional(),
  text: z.string().min(5, "Complaint text must be at least 5 characters long"),
  images: z.array(ComplaintAttachmentSchema).optional(),
  documents: z.array(ComplaintAttachmentSchema).optional(),
  requested_recipient: z
    .object({
      type: z.string().optional(),
      scope: z.string().optional(),
    })
    .optional(),
  metadata: z
    .object({
      source: z.string().optional(),
      created_at: z.string().optional(),
    })
    .optional(),
});
export type ComplaintAnalysisRequest = z.infer<
  typeof ComplaintAnalysisRequestSchema
>;

// ==============================================================================
// Module 2 <-> Module 1 Response Contract
// ==============================================================================

export const ComplaintAnalysisResponseSchema = z.object({
  success: z.boolean(),
  complaint_id: z.string(),
  processing: z.object({
    status: z.enum(["completed", "failed"]),
    provider: z.enum(["gemini", "mock"]).optional(),
    model: z.string().optional(),
    processed_at: z.string().optional(),
    duration_ms: z.number().nonnegative().optional(),
  }),
  analysis: ComplaintAnalysisSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    })
    .optional(),
});
export type ComplaintAnalysisResponse = z.infer<
  typeof ComplaintAnalysisResponseSchema
>;

// ==============================================================================
// Complaint Record & Grouping Constants
// ==============================================================================

export const COMPLAINT_EMERGENCY_THRESHOLD = 5;
export const DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD = 0.35;
export const COMPLAINT_INCIDENT_WINDOW_MS = 86_400_000;
export const COMPLAINT_ACTIVE_STATUSES = [
  "submitted",
  "under_review",
  "in_progress",
] as const satisfies readonly ComplaintStatus[];

export const ComplaintRecordSchema = z.object({
  id: z.string(),
  complainant_id: z.string().nullable().optional(),
  text: z.string(),
  status: ComplaintStatusSchema.default("submitted"),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  location_building: z.string().nullable().optional(),
  location_room: z.string().nullable().optional(),
  attachments: z.array(ComplaintAttachmentSchema).default([]),
  cluster_id: z.string(),
  // Internal incident/replay metadata; not intended as a public explanation.
  incident_scope: z.string().nullable().optional(),
  submission_id: z.string().uuid().nullable().optional(),
  submission_fingerprint: z.string().nullable().optional(),
  is_emergency: z.boolean().default(false),
  similar_count: z.number().int().nonnegative().default(1),
  safety_triage: SafetyTriageSchema.optional(),
  assigned_to: z.string().nullable().optional(),
  response_note: z.string().nullable().optional(),
  last_updated_by: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ComplaintRecord = z.infer<typeof ComplaintRecordSchema>;

export const CreateComplaintRequestSchema = z.object({
  text: z.string().min(5, "Complaint text must be at least 5 characters long"),
  submission_id: z.string().uuid().optional(),
  attachments: z.array(ComplaintAttachmentSchema).optional(),
  complainant_id: z.string().optional(),
  category: ComplaintCategorySchema.optional(),
  location_building: z.string().optional(),
  location_room: z.string().optional(),
});
export type CreateComplaintRequest = z.infer<
  typeof CreateComplaintRequestSchema
>;

export const CreateComplaintResponseSchema = z.object({
  success: z.boolean(),
  replayed: z.boolean().optional(),
  complaint: ComplaintRecordSchema.optional(),
  cluster: z
    .object({
      cluster_id: z.string(),
      group_count: z.number().int().nonnegative(),
      is_emergency: z.boolean(),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    })
    .optional(),
});
export type CreateComplaintResponse = z.infer<
  typeof CreateComplaintResponseSchema
>;

export const ComplaintListQuerySchema = z.object({
  view: z.enum(["all", "normal", "emergency"]).default("all"),
});
export type ComplaintListQuery = z.infer<typeof ComplaintListQuerySchema>;

export const ComplaintListResponseSchema = z.object({
  success: z.boolean(),
  complaints: z.array(ComplaintRecordSchema),
  counts: z.object({
    total: z.number().int().nonnegative(),
    normal: z.number().int().nonnegative(),
    emergency: z.number().int().nonnegative(),
  }),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    })
    .optional(),
});
export type ComplaintListResponse = z.infer<
  typeof ComplaintListResponseSchema
>;

export const ComplaintLifecycleUpdateSchema = z
  .object({
    status: ComplaintStatusSchema.optional(),
    response_note: z.string().trim().min(1).max(2000).optional(),
    take_ownership: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.response_note !== undefined ||
      value.take_ownership === true,
    {
      message: "Provide a status, response note, or take_ownership=true.",
    },
  );
export type ComplaintLifecycleUpdate = z.infer<
  typeof ComplaintLifecycleUpdateSchema
>;

export const ComplaintStatusHistoryEntrySchema = z.object({
  from_status: ComplaintStatusSchema,
  to_status: ComplaintStatusSchema,
  note: z.string().nullable().optional(),
  created_at: z.string(),
});
export type ComplaintStatusHistoryEntry = z.infer<
  typeof ComplaintStatusHistoryEntrySchema
>;

export const ComplaintDetailResponseSchema = z.object({
  success: z.boolean(),
  complaint: ComplaintRecordSchema.optional(),
  peer_complaints: z.array(ComplaintRecordSchema).optional(),
  status_history: z.array(ComplaintStatusHistoryEntrySchema).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    })
    .optional(),
});
export type ComplaintDetailResponse = z.infer<
  typeof ComplaintDetailResponseSchema
>;
