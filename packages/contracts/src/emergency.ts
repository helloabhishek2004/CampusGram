import { z } from "zod";

/**
 * Emergency types recognized across campus facilities
 */
export const EmergencyTypeSchema = z.enum([
  "fire",
  "medical",
  "accident",
  "security_threat",
  "natural_disaster",
  "hazmat",
  "building_problem",
  "missing_person",
  "other",
]);

export type EmergencyType = z.infer<typeof EmergencyTypeSchema>;

/**
 * Emergency severity grades
 */
export const EmergencySeveritySchema = z.enum(["advisory", "warning", "critical"]);
export type EmergencySeverity = z.infer<typeof EmergencySeveritySchema>;

/**
 * Emergency notification broadcasting scope
 */
export const EmergencyScopeSchema = z.enum(["responders_only", "audience", "campus_wide"]);
export type EmergencyScope = z.infer<typeof EmergencyScopeSchema>;

/**
 * Alert lifecycle status
 */
export const AlertStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "sending",
  "sent",
  "cancelled",
]);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

/**
 * Incident lifecycle status
 */
export const IncidentStatusSchema = z.enum([
  "open",
  "confirmed",
  "responding",
  "contained",
  "resolved",
  "closed",
  "dismissed",
]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

/**
 * Notification delivery channels
 */
export const AlertChannelSchema = z.enum(["sms", "push", "email", "siren", "in_app"]);
export type AlertChannel = z.infer<typeof AlertChannelSchema>;

/**
 * Emergency Report Record
 */
export const EmergencyReportSchema = z.object({
  id: z.string(),
  public_ref: z.string(),
  type: EmergencyTypeSchema,
  location_name: z.string(),
  location_note: z.string().optional(),
  geo_lat: z.number().optional(),
  geo_lng: z.number().optional(),
  description: z.string(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  status: z.enum(["submitted", "acknowledged", "verifying", "verified", "resolved", "rejected"]),
  reporter_name: z.string(),
  reporter_id: z.string().optional(),
  is_drill: z.boolean().default(false),
  created_at: z.string(),
  resolved_at: z.string().optional(),
});
export type EmergencyReport = z.infer<typeof EmergencyReportSchema>;

/**
 * Emergency Broadcast Alert Record
 */
export const EmergencyAlertSchema = z.object({
  id: z.string(),
  incident_id: z.string().optional(),
  kind: z.enum(["alert", "update", "all_clear"]),
  severity: EmergencySeveritySchema,
  scope: EmergencyScopeSchema,
  title: z.string(),
  body: z.string(),
  channels: z.array(AlertChannelSchema),
  is_drill: z.boolean().default(false),
  status: AlertStatusSchema,
  drafted_by_name: z.string(),
  assembly_point: z.string().optional(),
  action_required: z.string().optional(),
  sent_at: z.string().optional(),
  created_at: z.string(),
});
export type EmergencyAlert = z.infer<typeof EmergencyAlertSchema>;

/**
 * Incident Aggregation
 */
export const EmergencyIncidentSchema = z.object({
  id: z.string(),
  public_ref: z.string(),
  type: EmergencyTypeSchema,
  location_name: z.string(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  status: IncidentStatusSchema,
  summary: z.string(),
  report_count: z.number().default(1),
  distinct_reporters: z.number().default(1),
  first_report_at: z.string(),
  last_report_at: z.string(),
  is_drill: z.boolean().default(false),
  active_alert_id: z.string().optional(),
});
export type EmergencyIncident = z.infer<typeof EmergencyIncidentSchema>;

/**
 * Client submission payload for SOS/Emergency Report
 */
export const CreateEmergencyReportInputSchema = z.object({
  type: EmergencyTypeSchema,
  location_name: z.string().min(2, "Location is required"),
  location_note: z.string().optional(),
  description: z.string().min(5, "Please provide description of the situation"),
  geo_lat: z.number().optional(),
  geo_lng: z.number().optional(),
  is_drill: z.boolean().optional(),
  reporter_name: z.string().optional(),
  contact_phone: z.string().optional(),
});
export type CreateEmergencyReportInput = z.infer<typeof CreateEmergencyReportInputSchema>;

/**
 * Client submission payload for Dispatching an Alert
 */
export const CreateEmergencyAlertInputSchema = z.object({
  title: z.string().min(3, "Alert title is required"),
  body: z.string().min(10, "Alert body must be descriptive"),
  severity: EmergencySeveritySchema,
  scope: EmergencyScopeSchema,
  kind: z.enum(["alert", "update", "all_clear"]).default("alert"),
  channels: z.array(AlertChannelSchema).min(1, "Select at least one channel"),
  assembly_point: z.string().optional(),
  action_required: z.string().optional(),
  is_drill: z.boolean().optional(),
});

export type CreateEmergencyAlertInput = z.infer<typeof CreateEmergencyAlertInputSchema>;

/**
 * Safety Check-In response payload
 */
export const SafetyCheckInSchema = z.object({
  alert_id: z.string(),
  status: z.enum(["safe", "need_help"]),
  location_note: z.string().optional(),
  user_id: z.string().optional(),
});
export type SafetyCheckIn = z.infer<typeof SafetyCheckInSchema>;

/**
 * Emergency Report Lifecycle Status
 */
export const EmergencyReportStatusSchema = z.enum([
  "submitted",
  "acknowledged",
  "verifying",
  "verified",
  "resolved",
  "rejected",
]);
export type EmergencyReportStatus = z.infer<typeof EmergencyReportStatusSchema>;

/**
 * Payload for updating an emergency report lifecycle status
 */
export const UpdateEmergencyReportStatusInputSchema = z.object({
  status: EmergencyReportStatusSchema,
  expected_previous_status: EmergencyReportStatusSchema.optional(),
  note: z.string().max(500).optional(),
});
export type UpdateEmergencyReportStatusInput = z.infer<typeof UpdateEmergencyReportStatusInputSchema>;

/**
 * Emergency Report Lifecycle History Record
 */
export const EmergencyReportHistorySchema = z.object({
  id: z.string(),
  report_id: z.string(),
  from_status: EmergencyReportStatusSchema,
  to_status: EmergencyReportStatusSchema,
  actor_id: z.string(),
  actor_name: z.string().optional(),
  note: z.string().optional(),
  created_at: z.string(),
});
export type EmergencyReportHistory = z.infer<typeof EmergencyReportHistorySchema>;

/**
 * Sanitized Audit History View returned to authorized clients
 */
export const EmergencyReportHistoryViewSchema = z.object({
  id: z.string(),
  report_id: z.string(),
  from_status: EmergencyReportStatusSchema,
  to_status: EmergencyReportStatusSchema,
  actor_id: z.string(),
  actor_name: z.string().optional(),
  note: z.string().optional(),
  created_at: z.string(),
});
export type EmergencyReportHistoryView = z.infer<typeof EmergencyReportHistoryViewSchema>;
