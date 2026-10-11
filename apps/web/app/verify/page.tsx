"use client";

import React, { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { InstitutionalLookupResponse } from "@smart-campus/contracts";
import { mockIdentityService } from "@/lib/services/identity-service";
import { IdentityCard } from "@/components/auth/identity-card";
import { useCampusAuth } from "@/components/auth/auth-guard";
import { ArrowRight, ArrowLeft, Loader2, AlertCircle, Check } from "lucide-react";
import Link from "next/link";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useCampusAuth();

  const idParam = searchParams.get("id") || "";
  const [profile, setProfile] = useState<InstitutionalLookupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecord() {
      if (!idParam) {
        setError("No Institutional ID specified. Please enter your College ID first.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const result = await mockIdentityService.lookupByInstitutionalId(idParam);
        if (!result) {
          setError(`Institutional ID '${idParam}' was not found in directory records.`);
        } else {
          setProfile(result);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to retrieve institutional record.");
      } finally {
        setLoading(false);
      }
    }

    fetchRecord();
  }, [idParam]);

  const handleVerify = async () => {
    if (!profile) return;
    setVerifying(true);
    setError(null);
    try {
      if (!otpSent) {
        const response = await fetch("/api/auth/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ institutionalId: profile.institutionalId }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Unable to send OTP");
        setOtpSent(true);
         setOtpMessage(data.mockOtp ? `Demo OTP: ${data.mockOtp}` : data.message);
        return;
      }

      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionalId: profile.institutionalId, otp }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || data.message || "Invalid OTP");
      login(data.profile || profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="m-auto w-full max-w-md space-y-6 py-8 animate-apple-in">
      <div className="flex flex-col items-center space-y-3 text-center">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-950 border border-border shadow-md">
          <Image
            src="/assets/campus_gram_icon.svg"
            alt="CampusGram"
            width={48}
            height={48}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Verify your identity
          </h1>
          <p className="text-sm text-muted-foreground">
            Please confirm the institutional record associated with your ID.
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="p-10 rounded-xl border border-border bg-card flex flex-col items-center justify-center space-y-2.5 text-card-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Retrieving institutional directory record...</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-6 rounded-xl border border-destructive/30 bg-destructive/10 text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-destructive mx-auto" />
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-destructive">Record Not Found</h3>
            <p className="text-xs text-destructive/80">{error}</p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground bg-secondary hover:bg-muted border border-border transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Login</span>
          </Link>
        </div>
      )}

      {/* Profile Card & Confirmation */}
      {profile && !loading && (
        <div className="space-y-4">
          <IdentityCard
            profile={profile}
            variant="verification"
            footerAction={
              <div className="space-y-3 pt-2">
                {otpSent && (
                  <input
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter 6-digit OTP"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center font-mono tracking-[0.35em] text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    aria-label="One-time password"
                  />
                )}
                {otpMessage && otpSent && (
                  <p className="text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">{otpMessage}</p>
                )}
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying || (otpSent && otp.length !== 6)}
                  className="w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-foreground" />
                      <span>Opening Session...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{otpSent ? "Verify OTP & Continue" : "Send OTP"}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <span>Not you?</span>
                    <span className="underline underline-offset-4 text-foreground">
                      Try another ID
                    </span>
                  </Link>
                </div>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="relative flex min-h-screen min-h-[100svh] overflow-hidden bg-zinc-50 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-10">

      <Suspense
        fallback={
          <div className="m-auto flex w-full max-w-md flex-col items-center justify-center space-y-2.5 py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            <p className="text-xs text-zinc-500">Loading record...</p>
          </div>
        }
      >
        <VerifyContent />
      </Suspense>

      <footer className="absolute bottom-5 left-0 right-0 px-5 text-center sm:bottom-8">
        <p className="text-xs text-slate-500 dark:text-zinc-500">
          Institutional records are protected. Phone numbers remain masked for privacy.
        </p>
      </footer>
    </div>
  );
}
