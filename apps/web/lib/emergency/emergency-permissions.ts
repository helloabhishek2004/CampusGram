import type { InstitutionalLookupResponse } from "@smart-campus/contracts";

const responderRoles = ["admin", "faculty", "staff"];
const broadcastRoles = ["admin", "faculty", "staff"];
const coordinatorTags = ["HOD", "CAS_COORDINATOR", "DEPARTMENT_COORDINATOR"];

export function canViewAllEmergencyReports(profile?: InstitutionalLookupResponse | null): boolean {
  return Boolean(profile && (responderRoles.includes(profile.role) || profile.tags.some((tag) => ["HOD", "DEPARTMENT_COORDINATOR"].includes(tag))));
}

export function canCreateEmergencyBroadcast(profile?: InstitutionalLookupResponse | null): boolean {
  return Boolean(
    profile &&
      (broadcastRoles.includes(profile.role) || profile.tags.some((tag) => coordinatorTags.includes(tag))),
  );
}

/**
 * Filter alerts so they are visible only to their selected audience:
 * - 'campus_wide': visible to all authenticated campus members.
 * - 'responders_only': visible only to emergency responders and coordinators.
 * - 'audience': targeted department/building audience; emergency responders also have oversight.
 */
export function canViewEmergencyAlert(
  scope: import("@smart-campus/contracts").EmergencyScope,
  profile?: InstitutionalLookupResponse | null
): boolean {
  if (scope === "campus_wide") return true;
  if (!profile) return false;

  const isResponder =
    responderRoles.includes(profile.role) ||
    profile.tags.some((tag) => ["HOD", "DEPARTMENT_COORDINATOR", "CAS_COORDINATOR"].includes(tag));

  if (scope === "responders_only") {
    return isResponder;
  }

  if (scope === "audience") {
    // Responders and campus members within target audience can view
    return isResponder || profile.role === "student" || profile.role === "faculty";
  }

  return true;
}
