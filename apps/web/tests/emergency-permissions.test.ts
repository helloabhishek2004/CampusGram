import { describe, expect, it } from "vitest";
import type { InstitutionalLookupResponse } from "@smart-campus/contracts";
import { canCreateEmergencyBroadcast, canViewAllEmergencyReports, canViewEmergencyAlert } from "../lib/emergency/emergency-permissions";

const profile = (overrides: Partial<InstitutionalLookupResponse> = {}): InstitutionalLookupResponse => ({
  id: "profile-1",
  institutionalId: "STU2026002",
  fullName: "Test User",
  maskedPhone: "******0002",
  role: "student",
  tags: [],
  isActive: true,
  ...overrides,
});

describe("Emergency authorization", () => {
  it("allows students to view only their own records", () => {
    expect(canViewAllEmergencyReports(profile())).toBe(false);
  });

  it("allows responders to view all reports", () => {
    expect(canViewAllEmergencyReports(profile({ role: "staff" }))).toBe(true);
    expect(canViewAllEmergencyReports(profile({ role: "faculty" }))).toBe(true);
  });

  it("blocks ordinary students from privileged broadcasts", () => {
    expect(canCreateEmergencyBroadcast(profile())).toBe(false);
  });

  it("allows defined staff roles and responsibility tags to broadcast", () => {
    expect(canCreateEmergencyBroadcast(profile({ role: "faculty" }))).toBe(true);
    expect(canCreateEmergencyBroadcast(profile({ tags: ["DEPARTMENT_COORDINATOR"] }))).toBe(true);
  });

  it("filters alerts according to audience scope", () => {
    // 1. Campus-wide alerts are visible to everyone
    expect(canViewEmergencyAlert("campus_wide", profile({ role: "student" }))).toBe(true);
    expect(canViewEmergencyAlert("campus_wide", profile({ role: "faculty" }))).toBe(true);

    // 2. Responders-only alerts are hidden from ordinary students but visible to staff/coordinators
    expect(canViewEmergencyAlert("responders_only", profile({ role: "student" }))).toBe(false);
    expect(canViewEmergencyAlert("responders_only", profile({ role: "faculty" }))).toBe(true);
    expect(canViewEmergencyAlert("responders_only", profile({ role: "staff" }))).toBe(true);
    expect(canViewEmergencyAlert("responders_only", profile({ role: "student", tags: ["CAS_COORDINATOR"] }))).toBe(true);

    // 3. Target audience alerts are visible to designated campus members and responders
    expect(canViewEmergencyAlert("audience", profile({ role: "student" }))).toBe(true);
    expect(canViewEmergencyAlert("audience", profile({ role: "faculty" }))).toBe(true);
  });
});
