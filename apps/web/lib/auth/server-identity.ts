import type { InstitutionalLookupResponse } from "@smart-campus/contracts";
import { createClient } from "../supabase/server";
import {
  findCanonicalInstitutionalLink,
  findInstitutionalRecord,
  findInstitutionalRecordByLinkedProfile,
  isInstitutionalDirectoryAvailable,
  verifyMockSessionToken,
  MOCK_SESSION_COOKIE_NAME,
} from "./identity-service";
import { cookies } from "next/headers";

export interface ServerIdentity {
  userId: string;
  institutionalId?: string;
  profile?: InstitutionalLookupResponse;
  isDemo: boolean;
}

type RequestCookieSource = {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
};

/**
 * Resolve identity from the canonical Supabase session or the signed
 * application session issued by the dummy-OTP flow. Browser storage and
 * caller-supplied identity headers are deliberately not trusted here.
 *
 * The application-session path is an explicit route-level opt-in via
 * allowDemo. It remains a hackathon/mock mechanism, but is also required for
 * the configured Supabase deployment because dummy OTP does not create a
 * Supabase Auth JWT.
 */
export async function resolveServerIdentity(
  options: { allowDemo?: boolean; request?: RequestCookieSource } = {},
): Promise<ServerIdentity | null> {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") &&
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder"),
  );

  // Explicit mock/demo mode (or an unconfigured isolated test runner) is
  // application-session-only. In particular, a stale or conflicting
  // Supabase browser session must never win over the mock cookie.
  const mockMode =
    process.env.CAMPUSGRAM_DEMO_MODE === "true" ||
    process.env.AUTH_MODE === "mock" ||
    (process.env.NODE_ENV === "test" && !configured);
  if (mockMode) {
    if (!options.allowDemo) return null;
    return resolveMockCookieIdentity(options);
  }

  try {
    if (!configured) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    // The canonical directory link is the only authorization source in the
    // real Supabase branch. User metadata is informational and ignored.
    const linked = await findInstitutionalRecordByLinkedProfile(data.user.id);
    if (!linked) return null;

    return {
      userId: data.user.id,
      institutionalId: linked.profile.institutionalId,
      profile: linked.profile,
      isDemo: false,
    };
  } catch {
    // An unavailable auth or directory backend is unauthenticated.
    return null;
  }
}

async function resolveMockCookieIdentity(
  options: { request?: RequestCookieSource },
): Promise<ServerIdentity | null> {
  let token = options.request?.cookies.get(MOCK_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(MOCK_SESSION_COOKIE_NAME)?.value;
    } catch {
      // Unit tests can invoke route handlers without a Next request scope.
    }
  }

  const session = token ? verifyMockSessionToken(token) : null;
  if (!session) return null;

  const demoRecord = await findInstitutionalRecord(session.institutionalId);
  if (!demoRecord?.profile.isActive) return null;

  if (isInstitutionalDirectoryAvailable()) {
    const canonical = await findCanonicalInstitutionalLink(
      demoRecord.profile.institutionalId,
    );
    // Configured deployments require a linked canonical application profile;
    // an unlinked or stale signed token is not an authenticated identity.
    if (
      !canonical?.isActive ||
      !canonical.linkedProfileId ||
      !session.profileId ||
      session.profileId !== canonical.linkedProfileId
    ) {
      return null;
    }
  } else if (session.profileId && session.profileId !== demoRecord.profile.id) {
    return null;
  }

  return {
    userId: session.profileId || demoRecord.profile.id,
    institutionalId: demoRecord.profile.institutionalId,
    profile: demoRecord.profile,
    isDemo: true,
  };
}
