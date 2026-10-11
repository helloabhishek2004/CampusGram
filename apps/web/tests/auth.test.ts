import { describe, it, expect, beforeEach, vi } from "vitest";
import { maskPhoneNumber } from "../lib/auth/masking";
import {
  generateAndSendOtp,
  verifyOtpChallenge,
  resetOtpChallenges,
} from "../lib/auth/otp";
import {
  MOCK_INSTITUTIONAL_DIRECTORY,
} from "../lib/auth/mock-identities";
import {
  findInstitutionalRecord,
  lookupInstitutionalIdentity,
  requestLoginOtp,
  verifyLoginOtp,
} from "../lib/auth/identity-service";

describe("Institutional Auth & Identity Foundation", () => {
  beforeEach(() => {
    resetOtpChallenges();
  });

  describe("Phone Number Masking (maskPhoneNumber)", () => {
    it("masks E.164 phone numbers preserving country code and last 4 digits", () => {
      const masked = maskPhoneNumber("+919876543210");
      expect(masked).toBe("+91 ******3210");
    });

    it("masks spaced phone numbers with country code", () => {
      const masked = maskPhoneNumber("+91 9876543210");
      expect(masked).toBe("+91 ******3210");
    });

    it("masks domestic 10-digit numbers keeping last 4 digits", () => {
      const masked = maskPhoneNumber("9876543210");
      expect(masked).toBe("******3210");
    });

    it("handles short or empty numbers gracefully without leaking raw numbers", () => {
      expect(maskPhoneNumber("")).toBe("******");
      expect(maskPhoneNumber(null)).toBe("******");
      expect(maskPhoneNumber(undefined)).toBe("******");
      expect(maskPhoneNumber("1234")).toBe("****");
    });
  });

  describe("Deterministic Mock Identities Catalog (50 Records)", () => {
    it("contains exactly 50 institutional records", () => {
      expect(MOCK_INSTITUTIONAL_DIRECTORY).toHaveLength(50);
    });

    it("has the required distribution across roles", () => {
      const students = MOCK_INSTITUTIONAL_DIRECTORY.filter((u) => u.role === "student");
      const faculty = MOCK_INSTITUTIONAL_DIRECTORY.filter(
        (u) => u.role === "faculty" && !u.tags.includes("HOD")
      );
      const hods = MOCK_INSTITUTIONAL_DIRECTORY.filter((u) => u.tags.includes("HOD"));
      const admins = MOCK_INSTITUTIONAL_DIRECTORY.filter((u) => u.role === "admin");

      expect(students).toHaveLength(35);
      expect(faculty).toHaveLength(10);
      expect(hods).toHaveLength(3);
      expect(admins).toHaveLength(2);
    });

    it("assigns responsibility tags properly", () => {
      const casCoordinators = MOCK_INSTITUTIONAL_DIRECTORY.filter((u) =>
        u.tags.includes("CAS_COORDINATOR")
      );
      expect(casCoordinators.length).toBeGreaterThanOrEqual(3);

      const hods = MOCK_INSTITUTIONAL_DIRECTORY.filter((u) => u.tags.includes("HOD"));
      expect(hods.map((h) => h.departmentCode)).toEqual(
        expect.arrayContaining(["CSE", "ECE", "MECH"])
      );
    });

    it("guarantees every record has a valid masked phone and is active", () => {
      for (const user of MOCK_INSTITUTIONAL_DIRECTORY) {
        expect(user.maskedPhone).toMatch(/\*{4,}\d{4}/);
        expect(user.isActive).toBe(true);
        expect(user.fullName).toBeTruthy();
        expect(user.institutionalId).toBeTruthy();
      }
    });
  });

  describe("OTP Generation & Verification (Mock Mode)", () => {
    it("generates simulated OTP challenge in mock mode", async () => {
      const res = await generateAndSendOtp("STU2026001", "+919876500001");
      expect(res.success).toBe(true);
      expect(res.mockOtp).toBe("123456");
      expect(res.expiresInSeconds).toBe(300);
    });

    it("verifies successfully with the mock test code '123456'", async () => {
      await generateAndSendOtp("STU2026001", "+919876500001");
      const result = await verifyOtpChallenge("STU2026001", "123456");
      expect(result.valid).toBe(true);
    });

    it("rejects invalid OTP and tracks attempts", async () => {
      await generateAndSendOtp("STU2026002", "+919876500002");
      const result = await verifyOtpChallenge("STU2026002", "999999");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid OTP");
    });
  });

  describe("Identity Service End-to-End Flow", () => {
    it("rejects verification without an active challenge", async () => {
      const result = await verifyOtpChallenge("STU2026003", "123456");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("No active OTP challenge");
    });

    it("accepts the deterministic code without shared challenge storage in explicit mock mode", async () => {
      const originalAuthMode = process.env.AUTH_MODE;
      process.env.AUTH_MODE = "mock";
      try {
        const result = await verifyOtpChallenge("STU2026003", "123456");
        expect(result.valid).toBe(true);
      } finally {
        if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
        else process.env.AUTH_MODE = originalAuthMode;
      }
    });

    it("rejects the dummy OTP after the challenge expires", async () => {
      vi.useFakeTimers();
      try {
        await generateAndSendOtp("STU2026004", "+919876500004");
        vi.advanceTimersByTime(300_001);
        const result = await verifyOtpChallenge("STU2026004", "123456");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("expired");
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects the challenge after too many incorrect attempts", async () => {
      await generateAndSendOtp("STU2026005", "+919876500005");
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await verifyOtpChallenge("STU2026005", "999999");
      }
      const result = await verifyOtpChallenge("STU2026005", "123456");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Too many incorrect attempts");
    });
  });

  describe("Identity Service End-to-End Flow", () => {
    it("looks up existing student by institutional ID safely", async () => {
      const profile = await lookupInstitutionalIdentity("STU2026001");
      expect(profile).not.toBeNull();
      expect(profile?.fullName).toBe("Aarav Sharma");
      expect(profile?.departmentCode).toBe("CSE");
      expect(profile?.tags).toContain("CAS_COORDINATOR");
      expect(profile?.maskedPhone).toBe("+91 ******0001");
      // Must NOT contain sensitive rawPhone
      expect((profile as any).rawPhone).toBeUndefined();
    });

    it("looks up faculty with HOD and department coordinator tags", async () => {
      const profile = await lookupInstitutionalIdentity("FAC1011");
      expect(profile).not.toBeNull();
      expect(profile?.fullName).toBe("Dr. Aris Thorne");
      expect(profile?.tags).toEqual(
        expect.arrayContaining(["HOD", "DEPARTMENT_COORDINATOR"])
      );
    });

    it("returns null for non-existent institutional ID", async () => {
      const profile = await lookupInstitutionalIdentity("NONEXISTENT999");
      expect(profile).toBeNull();
    });

    it("completes full OTP request and verification cycle", async () => {
      const otpReq = await requestLoginOtp("STU2026005");
      expect(otpReq.success).toBe(true);
      expect(otpReq.institutionalId).toBe("STU2026005");
      expect(otpReq.mockOtp).toBe("123456");

      const verifyRes = await verifyLoginOtp("STU2026005", "123456");
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.profile?.institutionalId).toBe("STU2026005");
      expect(verifyRes.profile?.fullName).toBe("Vikram Singh");
      expect(verifyRes.sessionToken).toBeDefined();
    });
  });
});
