import {
  InstitutionalLookupResponse,
  InstitutionalLookupResponseSchema,
  RequestOtpResponse,
  VerifyOtpResponse,
} from "@smart-campus/contracts";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "../supabase/server";
import { MOCK_INSTITUTIONAL_DIRECTORY } from "./mock-identities";
import { generateAndSendOtp, verifyOtpChallenge } from "./otp";
import { maskPhoneNumber } from "./masking";

/**
 * Institutional Identity Service
 *
 * Provides safe lookups and deterministic OTP authentication challenges
 * without ever exposing raw phone numbers to unauthenticated clients.
 * Supabase remains the identity directory; the OTP implementation is still
 * the existing replaceable mock until an external provider is requested.
 */

export async function findInstitutionalRecord(
  institutionalId: string
): Promise<{ profile: InstitutionalLookupResponse; rawPhone?: string } | null> {
  const normId = institutionalId.trim().toUpperCase();
  const directoryConfigured = isInstitutionalDirectoryConfigured();

  // 1. Try Supabase lookup if configured
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("lookup_institutional_identity", {
      p_institutional_id: normId,
    });

    if (!error && data && data.length > 0) {
      const row = data[0];
      const parsed = InstitutionalLookupResponseSchema.safeParse({
        id: row.id,
        institutionalId: row.institutional_id,
        fullName: row.full_name,
        maskedPhone: row.masked_phone || maskPhoneNumber(row.phone),
        role: row.primary_role,
        departmentCode: row.department_code,
        departmentName: row.department_name,
        programCode: row.program_code,
        programName: row.program_name,
        academicYear: row.academic_year,
        semester: row.current_semester,
        section: row.section,
        designation: row.designation,
        tags: row.tags || [],
        isActive: row.is_active,
      });

      if (parsed.success) {
        return {
          profile: parsed.data,
        };
      }
    }
  } catch (_err) {
    // A configured directory outage is an authentication failure. Never turn it
    // into a successful lookup from the local demo catalog.
    if (directoryConfigured) return null;
  }

  // 2. Deterministic directory fallback is explicitly test/offline-only. A
  // configured database outage must not silently turn into a mock identity.
  const mockMode = process.env.AUTH_MODE === "mock" || process.env.NODE_ENV === "test";
  if (!mockMode || directoryConfigured) return null;

  const mockMatch = MOCK_INSTITUTIONAL_DIRECTORY.find(
    (u) => u.institutionalId.toUpperCase() === normId
  );

  if (mockMatch) {
    const { rawPhone, email: _email, ...profileOnly } = mockMatch;
    return {
      profile: profileOnly,
      rawPhone,
    };
  }

  return null;
}

function isInstitutionalDirectoryConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return Boolean(url && !url.includes("placeholder"));
}

export function isInstitutionalDirectoryAvailable(): boolean {
  return isInstitutionalDirectoryConfigured();
}

type CanonicalInstitutionalLink = {
  institutionalId: string;
  linkedProfileId: string | null;
  isActive: boolean;
};

/**
 * Read the canonical directory-to-application link with the server client.
 * The safe lookup RPC does not expose linked_profile_id, and an authenticated
 * session must not be selected from user metadata alone.
 */
export async function findCanonicalInstitutionalLink(
  institutionalId: string,
): Promise<CanonicalInstitutionalLink | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("institutional_users")
      .select("institutional_id,linked_profile_id,is_active")
      .eq("institutional_id", institutionalId.trim().toUpperCase())
      .maybeSingle();

    if (error || !data || typeof data.institutional_id !== "string") return null;
    return {
      institutionalId: data.institutional_id,
      linkedProfileId:
        typeof data.linked_profile_id === "string" ? data.linked_profile_id : null,
      isActive: data.is_active === true,
    };
  } catch {
    return null;
  }
}

/** Resolve a Supabase Auth user only through the canonical directory link. */
export async function findInstitutionalRecordByLinkedProfile(
  profileId: string,
): Promise<
  | { profile: InstitutionalLookupResponse; linkedProfileId: string }
  | null
> {
  try {
    const { data, error } = await createServiceClient()
      .from("institutional_users")
      .select("institutional_id,linked_profile_id,is_active")
      .eq("linked_profile_id", profileId)
      .maybeSingle();

    if (
      error ||
      !data ||
      data.linked_profile_id !== profileId ||
      data.is_active !== true ||
      typeof data.institutional_id !== "string"
    ) {
      return null;
    }

    const record = await findInstitutionalRecord(data.institutional_id);
    if (!record?.profile.isActive) return null;
    return { profile: record.profile, linkedProfileId: profileId };
  } catch {
    return null;
  }
}

/**
 * Look up institutional identity (safe for client consumption).
 */
export async function lookupInstitutionalIdentity(
  institutionalId: string
): Promise<InstitutionalLookupResponse | null> {
  const record = await findInstitutionalRecord(institutionalId);
  return record ? record.profile : null;
}

/**
 * Initiate OTP authentication for an institutional ID.
 */
export async function requestLoginOtp(
  institutionalId: string
): Promise<RequestOtpResponse> {
  const record = await findInstitutionalRecord(institutionalId);

  if (!record) {
    throw new Error(`Institutional ID '${institutionalId}' not found.`);
  }

  if (!record.profile.isActive) {
    throw new Error("This institutional account is inactive. Please contact administration.");
  }

  // OTP remains deterministic for the hackathon. Hosted deployments persist
  // the challenge in Supabase; tests/offline mode use the in-memory store.
  // No external SMS/Auth provider is contacted.
  const otpResult = await generateAndSendOtp(record.profile.institutionalId, "");

  return {
    success: true,
    message: otpResult.message,
    institutionalId: record.profile.institutionalId,
    maskedPhone: record.profile.maskedPhone,
    expiresInSeconds: otpResult.expiresInSeconds,
    mockOtp: otpResult.mockOtp,
  };
}

/**
 * Verify OTP and return profile.
 */
export async function verifyLoginOtp(
  institutionalId: string,
  otp: string
): Promise<VerifyOtpResponse> {
  const record = await findInstitutionalRecord(institutionalId);

  if (!record) {
    return {
      success: false,
      message: `Institutional record not found for '${institutionalId}'.`,
    };
  }

  if (!record.profile.isActive) {
    return {
      success: false,
      message: "Account is inactive. Please contact your department administration.",
    };
  }

  const verification = await verifyOtpChallenge(record.profile.institutionalId, otp);

  if (!verification.valid) {
    return {
      success: false,
      message: verification.error || "Invalid OTP entered.",
    };
  }

  const applicationProfileId = await ensureApplicationProfile(record.profile);

  return {
    success: true,
    message: "Identity verified successfully.",
    profile: record.profile,
    sessionToken: createMockSessionToken(record.profile, applicationProfileId),
  };
}

function applicationRole(role: InstitutionalLookupResponse["role"], tags: string[]) {
  if (role === "admin") return "admin" as const;
  if (tags.includes("HOD")) return "department_head" as const;
  if (role === "faculty") return "faculty" as const;
  if (role === "staff") return "maintenance_officer" as const;
  return "student" as const;
}

/**
 * Dummy OTP does not create a Supabase Auth session, but application tables
 * still reference public.profiles. Provision the matching service-side
 * profile once so the mock session can use the same canonical profile ID as
 * feed, complaints, Lost & Found, and Emergency persistence.
 */
async function ensureApplicationProfile(profile: InstitutionalLookupResponse): Promise<string> {
  if (process.env.NODE_ENV === "test") return profile.id;

  const hasServerDatabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("placeholder"),
  );
  if (process.env.AUTH_MODE === "mock" && !hasServerDatabase) return profile.id;

  const admin = createServiceClient();
  const { data: directory, error: directoryError } = await admin
    .from("institutional_users")
    .select("id,email,full_name,primary_role,linked_profile_id")
    .eq("institutional_id", profile.institutionalId)
    .maybeSingle();
  if (directoryError || !directory) {
    throw new Error(`Unable to provision the institutional application profile: ${directoryError?.message || "directory record not found"}`);
  }
  if (directory.linked_profile_id) return directory.linked_profile_id;

  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new Error(`Unable to inspect application auth users: ${usersError.message}`);
  let authUser = users.users.find((user) => user.email?.toLowerCase() === directory.email.toLowerCase());
  if (!authUser) {
    const created = await admin.auth.admin.createUser({
      email: directory.email,
      email_confirm: true,
      user_metadata: { institutional_id: profile.institutionalId },
    });
    if (created.error || !created.data.user) throw new Error(`Unable to provision application auth user: ${created.error?.message || "no user returned"}`);
    authUser = created.data.user;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: authUser.id,
    email: directory.email,
    full_name: directory.full_name,
    role: applicationRole(profile.role, profile.tags),
    department: profile.departmentCode || null,
    student_id: profile.institutionalId,
  });
  if (profileError) throw new Error(`Unable to persist application profile: ${profileError.message}`);

  const { error: linkError } = await admin
    .from("institutional_users")
    .update({ linked_profile_id: authUser.id })
    .eq("id", directory.id);
  if (linkError) throw new Error(`Unable to link institutional profile: ${linkError.message}`);
  return authUser.id;
}

export const MOCK_SESSION_COOKIE_NAME = "campusgram_mock_session";
export const MOCK_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const MOCK_SESSION_TTL_MS = MOCK_SESSION_MAX_AGE_SECONDS * 1000;
let offlineMockSessionSecret: string | undefined;

function mockSessionSecret(): string {
  const configuredSecret = process.env.AUTH_SESSION_SECRET?.trim();
  if (configuredSecret) return configuredSecret;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey && !serviceRoleKey.includes("placeholder")) {
    return serviceRoleKey;
  }

  // Offline demo/test processes may use an ephemeral secret. It is deliberately
  // process-local, so a restart invalidates every demo session.
  if (
    process.env.NODE_ENV === "test" ||
    (process.env.AUTH_MODE === "mock" && !isInstitutionalDirectoryConfigured())
  ) {
    offlineMockSessionSecret ??= randomBytes(32).toString("base64url");
    return offlineMockSessionSecret;
  }

  throw new Error(
    "AUTH_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY is required for mock session signing.",
  );
}

/**
 * Signs the intentionally mock application session. This is not a Supabase
 * Auth token; it only lets server routes resolve the identity selected by the
 * dummy OTP flow without trusting localStorage or request-body IDs.
 */
export function createMockSessionToken(profile: InstitutionalLookupResponse, profileId?: string): string {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({
    institutionalId: profile.institutionalId,
    profileId,
    issuedAt,
    expiresAt: issuedAt + MOCK_SESSION_TTL_MS,
  })).toString("base64url");
  const signature = createHmac("sha256", mockSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyMockSessionToken(token: string): { institutionalId: string; profileId?: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (
    !payload ||
    !signature ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  ) {
    return null;
  }

  try {
    const expected = createHmac("sha256", mockSessionSecret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      institutionalId?: unknown;
      profileId?: unknown;
      issuedAt?: unknown;
      expiresAt?: unknown;
    };
    const now = Date.now();
    const issuedAt = parsed.issuedAt;
    const expiresAt = parsed.expiresAt;
    if (
      !parsed ||
      typeof parsed.institutionalId !== "string" ||
      parsed.institutionalId.trim().length === 0 ||
      typeof issuedAt !== "number" ||
      !Number.isSafeInteger(issuedAt) ||
      issuedAt > now ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > MOCK_SESSION_TTL_MS ||
      expiresAt <= now
    ) {
      return null;
    }

    if (
      parsed.profileId !== undefined &&
      (typeof parsed.profileId !== "string" || parsed.profileId.trim().length === 0)
    ) {
      return null;
    }

    return {
      institutionalId: parsed.institutionalId,
      profileId: typeof parsed.profileId === "string" ? parsed.profileId : undefined,
    };
  } catch {
    return null;
  }
}
