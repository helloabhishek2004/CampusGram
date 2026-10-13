import React from "react";
import type { Metadata } from "next";
import { PublicInfoShell } from "../../components/layout/public-info-shell";
import {
  Layers,
  Sparkles,
  ShieldAlert,
  PackageSearch,
  AlertCircle,
  FileText,
  Lock,
  Cpu,
  GraduationCap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About CampusGram",
  description: "Overview, architecture, and principles of the CampusGram Smart Campus platform.",
};

const PILLARS = [
  {
    title: "Institutional Identity Foundation",
    icon: GraduationCap,
    description:
      "A unified biodata architecture eliminating manual profile creation. Pre-existing department, program, and coordinator responsibility tags grant fine-grained institutional permissions.",
  },
  {
    title: "Complaint Intelligence (Module 2)",
    icon: AlertCircle,
    description:
      "Intelligent grievance intake with automated category classification, severity scoring (Tiers 1–5), duplicate clustering, and automated department dispatch.",
  },
  {
    title: "Lost & Found Intelligence (Module 3)",
    icon: PackageSearch,
    description:
      "A multimodal matching engine powered by CLIP visual representations and text embeddings, coupled with privacy-preserving concealed marks and custodial handover verification.",
  },
  {
    title: "Emergency Alert System (Module 4)",
    icon: ShieldAlert,
    description:
      "Instant 1-tap SOS reporting, rule-based priority scoring (P1–P4), multi-channel broadcast simulation, interactive safety check-ins, and an atomic database audit trail.",
  },
];

export default function AboutPage() {
  return (
    <PublicInfoShell
      title="About CampusGram"
      subtitle="The digital operating system unifying campus communication, grievance redressal, property recovery, and life safety."
      badge="System Architecture"
    >
      {/* Platform Mission */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-950 border border-border shrink-0 p-1 flex items-center justify-center">
            <Image
              src="/assets/campus_gram_logo.png"
              alt="CampusGram Logo"
              width={32}
              height={32}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Next-Gen Digital Campus Infrastructure</h2>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Smart Campus Monorepo • Release Candidate 1.0
            </p>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Higher education campuses are often fragmented across disparate portals for attendance, lost items, hostel maintenance, and emergency broadcasts. <strong>CampusGram</strong> unifies these critical operational workflows into a single cohesive, high-craftsmanship platform with zero emoji clutter, strict design foundations, and robust institutional privacy.
        </p>
      </section>

      {/* 4 Core Pillars */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h2>Core Architectural Pillars</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div key={pillar.title} className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <h3>{pillar.title}</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">{pillar.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Engineering Principles */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <h2>Engineering Principles</h2>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
            <strong className="text-foreground">Deterministic Mock-First Architecture:</strong>
            <p>
              Every AI classification engine, embedding pipeline, and SMS notification system implements an offline, deterministic mock mode. Developers and institutions can run the complete end-to-end complaint, matching, and emergency workflows without requiring paid external API keys or telecom gateways.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
            <strong className="text-foreground">Shared Contracts as Single Source of Truth:</strong>
            <p>
              Runtime validation is enforced through shared TypeScript types and Zod validation schemas (<code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">@smart-campus/contracts</code>), guaranteeing strict API boundaries across Next.js web clients and backend Python AI microservices.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
            <strong className="text-foreground">Zero Secret Leakage:</strong>
            <p>
              Database service keys and Gemini AI tokens are restricted to server-side execution. Client browsers only consume public anonymous Supabase keys, governed by PostgreSQL Row-Level Security (RLS) policies.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Quick Links */}
      <section className="border-t border-border pt-6 flex flex-wrap items-center justify-between gap-4 text-xs">
        <p className="text-muted-foreground">
          Explore documentation and policies:
        </p>
        <div className="flex items-center gap-3">
          <Link href="/privacy" className="text-foreground hover:underline font-medium">
            Privacy Policy
          </Link>
          <span>•</span>
          <Link href="/terms" className="text-foreground hover:underline font-medium">
            Terms of Service
          </Link>
          <span>•</span>
          <Link href="/help" className="text-foreground hover:underline font-medium">
            Help &amp; Support
          </Link>
        </div>
      </section>
    </PublicInfoShell>
  );
}
