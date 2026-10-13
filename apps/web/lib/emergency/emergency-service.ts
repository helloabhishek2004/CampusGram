import type {
  CreateEmergencyAlertInput,
  CreateEmergencyReportInput,
  EmergencyAlert,
  EmergencyReport,
  EmergencyType,
  SafetyCheckIn,
} from "@smart-campus/contracts";
import {
  createSupabaseEmergencyRepository,
  EmergencyIdentity,
  EmergencyRepository,
} from "./emergency-repository";

export interface EmergencyContact {
  id: string;
  name: string;
  category: "Security" | "Medical" | "Fire" | "Helpline" | "Administration";
  phone: string;
  ext: string;
  location: string;
  availableHours: string;
  isPrimarySOS: boolean;
}

export const CAMPUS_EMERGENCY_CONTACTS: EmergencyContact[] = [
  { id: "ec-1", name: "Central Security Control Room", category: "Security", phone: "+91 98765 00112", ext: "112", location: "Main Gate, Control Building GF", availableHours: "24/7 / 365 Days", isPrimarySOS: true },
  { id: "ec-2", name: "Campus Health & Trauma Center", category: "Medical", phone: "+91 98765 00108", ext: "108", location: "Medical Center, Block C", availableHours: "24/7 Emergency Ambulance", isPrimarySOS: true },
  { id: "ec-3", name: "Campus Fire Safety & Hazmat", category: "Fire", phone: "+91 98765 00101", ext: "101", location: "Engineering Workshop Complex", availableHours: "24/7 Rapid Response", isPrimarySOS: true },
  { id: "ec-4", name: "Women's Safety & Internal Complaints Committee", category: "Helpline", phone: "+91 98765 00109", ext: "109", location: "Student Welfare Hall, 1st Floor", availableHours: "24/7 Confidential Helpline", isPrimarySOS: false },
  { id: "ec-5", name: "Student Psychological Support & Counseling", category: "Helpline", phone: "+91 98765 00115", ext: "115", location: "Counseling Wing, Library 3rd Floor", availableHours: "8:00 AM - 10:00 PM", isPrimarySOS: false },
  { id: "ec-6", name: "Chief Proctor & Campus Administration", category: "Administration", phone: "+91 98765 00120", ext: "120", location: "Administrative Block Room 102", availableHours: "9:00 AM - 6:00 PM", isPrimarySOS: false },
];

export function calculatePriority(type: EmergencyType, text: string): 1 | 2 | 3 | 4 {
  const p1Types: EmergencyType[] = ["fire", "security_threat", "natural_disaster", "hazmat"];
  const p1Keywords = ["fire", "smoke", "explosion", "gun", "knife", "collapse", "electrocution", "unconscious", "bleeding"];
  const p2Keywords = ["fracture", "stuck", "flood", "leak", "faint", "attack", "trapped"];
  const lower = text.toLowerCase();
  if (p1Types.includes(type) || p1Keywords.some((keyword) => lower.includes(keyword))) return 1;
  if (type === "medical" || type === "accident" || type === "missing_person" || p2Keywords.some((keyword) => lower.includes(keyword))) return 2;
  return 3;
}

export class EmergencyService {
  constructor(private readonly repository: EmergencyRepository = createSupabaseEmergencyRepository()) {}

  getHotlines(): EmergencyContact[] {
    return CAMPUS_EMERGENCY_CONTACTS;
  }

  async getActiveAlerts(): Promise<EmergencyAlert[]> {
    return (await this.repository.listAlerts()).active;
  }

  async getAllAlerts(): Promise<EmergencyAlert[]> {
    return (await this.repository.listAlerts()).alerts;
  }

  async getAlertData(): Promise<{ alerts: EmergencyAlert[]; active: EmergencyAlert[] }> {
    return this.repository.listAlerts();
  }

  async getReports(identity: EmergencyIdentity, canViewAll: boolean): Promise<EmergencyReport[]> {
    return this.repository.listReports(identity, canViewAll);
  }

  async createReport(input: CreateEmergencyReportInput, identity: EmergencyIdentity): Promise<EmergencyReport> {
    const priority = calculatePriority(input.type, `${input.description} ${input.location_name}`);
    return this.repository.createReport(input, identity, priority);
  }

  async broadcastAlert(input: CreateEmergencyAlertInput, identity: EmergencyIdentity): Promise<EmergencyAlert> {
    return this.repository.createAlert(input, identity);
  }

  async recordSafetyCheckIn(input: SafetyCheckIn, identity: EmergencyIdentity): Promise<{ success: boolean; totalSafe: number }> {
    return this.repository.recordCheckIn(input, identity);
  }

  /**
   * Allowed lifecycle transitions:
   * - submitted: can transition to 'acknowledged', 'verifying', or 'rejected'
   * - verifying: can transition to 'verified', 'acknowledged', or 'rejected'
   * - acknowledged: can transition to 'verifying', 'verified', or 'rejected'
   * - verified: can transition to 'resolved' or 'verifying'
   * - resolved / rejected: terminal states, no transitions permitted
   */
  static readonly ALLOWED_TRANSITIONS: Record<import("@smart-campus/contracts").EmergencyReportStatus, import("@smart-campus/contracts").EmergencyReportStatus[]> = {
    submitted: ["acknowledged", "verifying", "rejected"],
    verifying: ["verified", "acknowledged", "rejected"],
    acknowledged: ["verifying", "verified", "rejected"],
    verified: ["resolved", "verifying"],
    resolved: [],
    rejected: [],
  };

  isValidTransition(
    currentStatus: import("@smart-campus/contracts").EmergencyReportStatus,
    targetStatus: import("@smart-campus/contracts").EmergencyReportStatus
  ): boolean {
    const allowed = EmergencyService.ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  async updateReportStatus(
    reportId: string,
    targetStatus: import("@smart-campus/contracts").EmergencyReportStatus,
    expectedPreviousStatus?: import("@smart-campus/contracts").EmergencyReportStatus,
    actor?: { userId: string; fullName: string },
    note?: string
  ): Promise<EmergencyReport> {
    const current = await this.repository.getReport(reportId);
    if (!current) {
      throw new Error("Emergency report not found.");
    }

    if (expectedPreviousStatus && current.status !== expectedPreviousStatus) {
      throw new Error(
        `Conflict: Report is currently '${current.status}', but '${expectedPreviousStatus}' was expected.`
      );
    }

    if (!this.isValidTransition(current.status, targetStatus)) {
      throw new Error(
        `Invalid status transition from '${current.status}' to '${targetStatus}'.`
      );
    }

    const sanitizedNote = note ? note.trim().slice(0, 500) : undefined;
    return this.repository.updateReportStatus(
      reportId,
      targetStatus,
      current.status,
      actor,
      sanitizedNote
    );
  }

  async getReportHistory(reportId: string): Promise<import("@smart-campus/contracts").EmergencyReportHistoryView[]> {
    const report = await this.repository.getReport(reportId);
    if (!report) {
      throw new Error("Emergency report not found.");
    }
    return this.repository.getReportHistory(reportId);
  }
}

export const emergencyService = new EmergencyService();
