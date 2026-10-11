/**
 * OTP Service for Institutional Identity Authentication
 *
 * Supports mock mode (`OTP_PROVIDER=mock`) for zero-dependency local development
 * and CI/CD pipelines, with fallback/master verification codes for automated testing.
 */

import { createServiceClient } from "../supabase/server";

export interface OtpChallenge {
  institutionalId: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

// In-memory challenge store for tests and offline mock mode. Hosted mock mode
// persists challenges in institutional_otp_sessions below.
const activeChallenges = new Map<string, OtpChallenge>();

const DEFAULT_EXPIRATION_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;

function shouldUsePersistentChallengeStore() {
  if (process.env.NODE_ENV === "test") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes("placeholder") &&
      !key.includes("placeholder"),
  );
}

async function getInstitutionalUserId(institutionalId: string) {
  const { data, error } = await createServiceClient()
    .from("institutional_users")
    .select("id")
    .eq("institutional_id", institutionalId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load OTP identity: ${error.message}`);
  return data?.id ?? null;
}

// Keep the hackathon login flow deterministic until an external OTP provider
// is intentionally wired in. Set OTP_PROVIDER=live only when that integration
// exists; the current live branch is only a replaceable placeholder.
export const OTP_PROVIDER = process.env.OTP_PROVIDER || "mock";

/**
 * Generate and dispatch an OTP challenge for an institutional user.
 */
export async function generateAndSendOtp(
  institutionalId: string,
  _rawPhone: string
): Promise<{ success: boolean; message: string; expiresInSeconds: number; mockOtp?: string }> {
  const normId = institutionalId.trim().toUpperCase();

  // Deterministic code in mock mode is "123456"
  const code = OTP_PROVIDER === "mock" ? "123456" : Math.floor(100000 + Math.random() * 900000).toString();

  const challenge: OtpChallenge = {
    institutionalId: normId,
    code,
    expiresAt: Date.now() + DEFAULT_EXPIRATION_SECONDS * 1000,
    attempts: 0,
  };

  if (shouldUsePersistentChallengeStore()) {
    const client = createServiceClient();
    const institutionalUserId = await getInstitutionalUserId(normId);
    if (!institutionalUserId) {
      throw new Error("Unable to create OTP challenge: institutional record not found.");
    }

    const { error } = await client
      .from("institutional_otp_sessions")
      .insert({
        institutional_user_id: institutionalUserId,
        otp_code: challenge.code,
        expires_at: new Date(challenge.expiresAt).toISOString(),
        attempts: 0,
      });
    if (error) throw new Error(`Unable to persist OTP challenge: ${error.message}`);
  } else {
    activeChallenges.set(normId, challenge);
  }

  if (OTP_PROVIDER === "mock") {
    return {
      success: true,
      message: "Simulated OTP sent successfully to registered phone number.",
      expiresInSeconds: DEFAULT_EXPIRATION_SECONDS,
      mockOtp: code,
    };
  }

  // Live provider integration placeholder (e.g. Twilio, MSG91, Fast2SMS)
  return {
    success: true,
    message: "OTP sent to your registered phone number.",
    expiresInSeconds: DEFAULT_EXPIRATION_SECONDS,
  };
}

/**
 * Verify an entered OTP challenge.
 */
export async function verifyOtpChallenge(
  institutionalId: string,
  enteredOtp: string
): Promise<{ valid: boolean; error?: string }> {
  const normId = institutionalId.trim().toUpperCase();
  const trimmedOtp = enteredOtp.trim();

  if (shouldUsePersistentChallengeStore()) {
    const client = createServiceClient();
    const institutionalUserId = await getInstitutionalUserId(normId);
    if (!institutionalUserId) {
      return { valid: false, error: "Institutional record not found." };
    }

    const { data: challenge, error } = await client
      .from("institutional_otp_sessions")
      .select("id, otp_code, expires_at, attempts")
      .eq("institutional_user_id", institutionalUserId)
      .is("verified_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Unable to load OTP challenge: ${error.message}`);
    if (!challenge) {
      return {
        valid: false,
        error: "No active OTP challenge found or challenge expired. Please request a new OTP.",
      };
    }

    if (Date.now() > Date.parse(challenge.expires_at)) {
      return { valid: false, error: "OTP has expired. Please request a new OTP." };
    }

    if (challenge.attempts >= MAX_ATTEMPTS) {
      return { valid: false, error: "Too many incorrect attempts. Please request a new OTP." };
    }

    if (challenge.otp_code !== trimmedOtp) {
      const attempts = challenge.attempts + 1;
      const { error: updateError } = await client
        .from("institutional_otp_sessions")
        .update({ attempts })
        .eq("id", challenge.id);
      if (updateError) throw new Error(`Unable to update OTP challenge: ${updateError.message}`);
      return {
        valid: false,
        error: `Invalid OTP. ${MAX_ATTEMPTS - attempts} attempt(s) remaining.`,
      };
    }

    const { error: verifyError } = await client
      .from("institutional_otp_sessions")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", challenge.id)
      .is("verified_at", null);
    if (verifyError) throw new Error(`Unable to finalize OTP challenge: ${verifyError.message}`);
    return { valid: true };
  }

  const challenge = activeChallenges.get(normId);
  if (!challenge) {
    if (
      OTP_PROVIDER === "mock" &&
      process.env.AUTH_MODE === "mock" &&
      trimmedOtp === "123456"
    ) {
      return { valid: true };
    }

    return {
      valid: false,
      error: "No active OTP challenge found or challenge expired. Please request a new OTP.",
    };
  }

  if (Date.now() > challenge.expiresAt) {
    activeChallenges.delete(normId);
    return {
      valid: false,
      error: "OTP has expired. Please request a new OTP.",
    };
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    activeChallenges.delete(normId);
    return {
      valid: false,
      error: "Too many incorrect attempts. Please request a new OTP.",
    };
  }

  if (challenge.code !== trimmedOtp) {
    challenge.attempts += 1;
    return {
      valid: false,
      error: `Invalid OTP. ${MAX_ATTEMPTS - challenge.attempts} attempt(s) remaining.`,
    };
  }

  // Challenge valid, clean up
  activeChallenges.delete(normId);
  return { valid: true };
}

/**
 * Helper to clear challenges (useful in testing)
 */
export function resetOtpChallenges(): void {
  activeChallenges.clear();
}
