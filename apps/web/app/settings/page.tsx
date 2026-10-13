"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { useCampusAuth } from "@/components/auth/auth-guard";
import { useTheme } from "@/components/theme/theme-context";
import { resetOnboarding } from "@/lib/auth/client-session";
import { useRouter } from "next/navigation";
import {
  Moon,
  Sun,
  Bell,
  ShieldCheck,
  RotateCcw,
  Check,
  LogOut,
  Sliders,
  FileCheck,
} from "lucide-react";
import { cn } from "@smart-campus/utils";

export default function SettingsPage() {
  const { user, logout, switchDemoUser } = useCampusAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [announcements, setAnnouncements] = useState(true);
  const [complaintAlerts, setComplaintAlerts] = useState(true);
  const [lostFoundAlerts, setLostFoundAlerts] = useState(true);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleResetOnboarding = () => {
    resetOnboarding();
    setResetSuccess(true);
    setTimeout(() => {
      router.push("/onboarding");
    }, 700);
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="border-b border-border pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-950 border border-border shadow-sm shrink-0">
              <Image
                src="/assets/campus_gram_icon.svg"
                alt="CampusGram"
                width={44}
                height={44}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Settings & Preferences
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage application appearance, alerts, and institutional data preferences.
              </p>
            </div>
          </div>
        </header>

        {/* Section 1: Appearance */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4 text-card-foreground">
          <div className="flex items-center gap-2 pb-3 border-b border-border/80">
            {theme === "dark" ? (
              <Moon className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Sun className="w-4 h-4 text-muted-foreground" />
            )}
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-medium">
              Appearance & Theme
            </h2>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-medium text-foreground">Interface Appearance</p>
                <p className="text-muted-foreground">
                  Switch between Apple-inspired Dark and Light monochrome modes.
                </p>
              </div>
            </div>

            {/* Segmented Theme Cards */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Dark Option */}
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn(
                  "apple-press flex items-center justify-between p-3.5 rounded-xl border text-left transition-all",
                  theme === "dark"
                    ? "bg-secondary text-foreground border-foreground/40 shadow-sm ring-1 ring-foreground/20 font-semibold"
                    : "bg-card text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground">
                    <Moon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Dark Mode</p>
                    <p className="text-[10px] text-muted-foreground font-mono">Zinc monochrome</p>
                  </div>
                </div>
                {theme === "dark" && (
                  <Check className="w-4 h-4 text-foreground" />
                )}
              </button>

              {/* Light Option */}
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn(
                  "apple-press flex items-center justify-between p-3.5 rounded-xl border text-left transition-all",
                  theme === "light"
                    ? "bg-secondary text-foreground border-foreground/40 shadow-sm ring-1 ring-foreground/20 font-semibold"
                    : "bg-card text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Light Mode</p>
                    <p className="text-[10px] text-muted-foreground font-mono">Clean monochrome</p>
                  </div>
                </div>
                {theme === "light" && (
                  <Check className="w-4 h-4 text-foreground" />
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Notifications */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-3 text-card-foreground">
          <div className="flex items-center gap-2 pb-3 border-b border-border/80">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-medium">
              Notifications
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="font-medium text-foreground">Campus Circulars & Notices</p>
                <p className="text-muted-foreground">Official circulars, exam schedules, and department notices</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={announcements}
                onClick={() => setAnnouncements(!announcements)}
                className={`w-9 h-5 rounded-full transition-colors relative focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  announcements ? "bg-primary" : "bg-muted"
                }`}
                aria-label="Toggle circular notifications"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full transition-transform block mx-0.5 ${
                    announcements ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <p className="font-medium text-foreground">Complaint Intelligence Status Updates</p>
                <p className="text-muted-foreground">Alerts when reported issues are analyzed or routed</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={complaintAlerts}
                onClick={() => setComplaintAlerts(!complaintAlerts)}
                className={`w-9 h-5 rounded-full transition-colors relative focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  complaintAlerts ? "bg-primary" : "bg-muted"
                }`}
                aria-label="Toggle complaint alert notifications"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full transition-transform block mx-0.5 ${
                    complaintAlerts ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <p className="font-medium text-foreground">Lost & Found Proximity Alerts</p>
                <p className="text-muted-foreground">Alerts when verified item matches are reported in custody</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lostFoundAlerts}
                onClick={() => setLostFoundAlerts(!lostFoundAlerts)}
                className={`w-9 h-5 rounded-full transition-colors relative focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  lostFoundAlerts ? "bg-primary" : "bg-muted"
                }`}
                aria-label="Toggle lost and found alerts"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full transition-transform block mx-0.5 ${
                    lostFoundAlerts ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Section 3: Privacy & Security */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-3 text-card-foreground">
          <div className="flex items-center gap-2 pb-3 border-b border-border/80">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-medium">
              Privacy Standards
            </h2>
          </div>

          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>
              • <strong>Phone Number Masking:</strong> Contact numbers remain masked across all unauthenticated endpoints.
            </p>
            <p>
              • <strong>Canonical Biodata Authority:</strong> Identity records are populated from official institutional catalogs.
            </p>
          </div>
        </section>

        {/* Section 4: Demo & Testing Controls */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4 text-card-foreground">
          <div className="flex items-center justify-between pb-3 border-b border-border/80">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-medium">
                Testing Controls
              </h2>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Local Mode</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="font-medium text-foreground">Reset Onboarding Tour</p>
                <p className="text-muted-foreground">Clears client flag so the three intro screens can be reviewed again.</p>
              </div>
              <button
                type="button"
                onClick={handleResetOnboarding}
                disabled={resetSuccess}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-muted text-foreground border border-border flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {resetSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Reset</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 border-t border-border/60">
              <span className="text-muted-foreground block mb-2 font-medium">Switch Active Demo Persona</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => switchDemoUser("STU2026001")}
                  className="py-1.5 px-2 rounded-md text-xs font-mono bg-secondary hover:bg-muted text-foreground border border-border text-center transition-colors"
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => switchDemoUser("FAC1001")}
                  className="py-1.5 px-2 rounded-md text-xs font-mono bg-secondary hover:bg-muted text-foreground border border-border text-center transition-colors"
                >
                  Faculty
                </button>
                <button
                  type="button"
                  onClick={() => switchDemoUser("FAC1011")}
                  className="py-1.5 px-2 rounded-md text-xs font-mono bg-secondary hover:bg-muted text-foreground border border-border text-center transition-colors"
                >
                  HOD
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/80">
            <button
              onClick={logout}
              className="w-full py-2 px-3 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive font-medium text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out of Current Session</span>
            </button>
          </div>
        </section>

        {/* Section 5: Legal & System Info */}
        <footer className="text-center text-[11px] text-muted-foreground font-mono pt-4 space-y-2">
          <div>CampusGram • Version 1.0 (Release Candidate) • Smart Campus Monorepo</div>
          <div className="flex items-center justify-center gap-3 font-sans">
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <span>•</span>
            <Link href="/help" className="hover:text-foreground transition-colors">
              Help &amp; Support
            </Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
