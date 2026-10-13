import React from "react";
import type { Metadata } from "next";
import { PublicInfoShell } from "../../components/layout/public-info-shell";
import {
  HelpCircle,
  AlertCircle,
  PackageSearch,
  ShieldAlert,
  PhoneCall,
  FileText,
  LifeBuoy,
  KeyRound,
} from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & Support",
  description: "User guide, operational troubleshooting, and support resources for CampusGram.",
};

const MODULE_GUIDES = [
  {
    title: "Campus Feed & Documents (Module 1)",
    icon: FileText,
    description:
      "Access verified departmental circulars, faculty notices, and your academic document vault. Documents can be filtered by course, department, or academic semester.",
    tips: [
      "Use Spotlight Search (⌘K / Ctrl+K) from any screen to locate academic syllabi or posts.",
      "Departmental notices carry verified institutional role badges (HOD, Coordinator).",
    ],
  },
  {
    title: "Complaint Intelligence (Module 2)",
    icon: AlertCircle,
    description:
      "Report campus infrastructure defects, electrical hazards, sanitation issues, or laboratory equipment faults. AI categorizes the complaint and assigns a severity rating from Tier 1 to Tier 5.",
    tips: [
      "Provide clear location names (e.g., 'Block C, Room 302') for swift dispatch.",
      "Complaints with 5+ matching community reports automatically cluster to prioritize resolution.",
    ],
  },
  {
    title: "Lost & Found Intelligence (Module 3)",
    icon: PackageSearch,
    description:
      "File lost item inquiries or log found property. The multimodal AI compares visual and text embeddings to suggest candidate matches while concealing private marks from public view.",
    tips: [
      "Keep identifying marks (stickers, serial numbers) in the private description field.",
      "To claim property, answer the owner verification challenge and complete physical custody handover at the Central Security Desk.",
    ],
  },
  {
    title: "Emergency Alert Center (Module 4)",
    icon: ShieldAlert,
    description:
      "Trigger immediate 1-tap SOS distress reports for medical crises, fires, or security hazards. View active broadcasts and register rapid safety check-in status.",
    tips: [
      "In active danger, use the persistent SOS button on the top navigation bar.",
      "Check-in with 'I am Safe' on active broadcasts so campus response coordinators can verify accountability.",
    ],
  },
];

export default function HelpSupportPage() {
  return (
    <PublicInfoShell
      title="Help & Support"
      subtitle="Operational guides, module walkthroughs, and practical assistance for the CampusGram platform."
      badge="Support Center"
    >
      {/* Quick Troubleshooting FAQs */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <LifeBuoy className="w-4 h-4 text-muted-foreground" />
          <h2>Frequently Asked Questions & Troubleshooting</h2>
        </div>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              How do I log in to CampusGram?
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Enter your official Institutional ID on the Sign In page. The server verifies your registered record and prompts for OTP confirmation against your registered phone number. In testing mode, the demo verification code is <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">123456</code>.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
            <h3 className="font-semibold text-foreground">
              Why can&apos;t I see private details on a Lost &amp; Found item?
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              CampusGram purposefully conceals distinguishing marks and private serial numbers to prevent fraudulent claims. When you submit a claim, you will be prompted to answer questions verifying those exact private features.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
            <h3 className="font-semibold text-foreground">
              What should I do if an emergency SOS fails to submit online?
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              If local network connectivity drops, immediately use a conventional telephone to dial the 24/7 direct campus emergency lines listed below. Never wait for an app response during an immediate physical life-safety threat.
            </p>
          </div>
        </div>
      </section>

      {/* Module Overview Guides */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          <h2>Module Operations Guide</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
          {MODULE_GUIDES.map((module) => {
            const Icon = module.icon;
            return (
              <div key={module.title} className="rounded-lg border border-border bg-card p-4 space-y-2.5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <h3>{module.title}</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">{module.description}</p>
                <div className="pt-2 border-t border-border/60 space-y-1 text-[11px] text-muted-foreground">
                  {module.tips.map((tip, idx) => (
                    <p key={idx}>• {tip}</p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Direct Campus Emergency Hotlines */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 text-foreground font-semibold text-sm">
          <PhoneCall className="w-4 h-4 text-muted-foreground" />
          <h2>24/7 Campus Emergency Hotlines</h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          For urgent, in-person campus dispatch, contact these official institutional extensions directly:
        </p>

        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <p className="font-semibold text-foreground">Campus Security Control</p>
            <p className="font-mono text-muted-foreground">+91 94470 00100</p>
            <p className="text-[10px] text-muted-foreground">Main Gate Station (24/7)</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <p className="font-semibold text-foreground">Campus Health Center</p>
            <p className="font-mono text-muted-foreground">+91 94470 00101</p>
            <p className="text-[10px] text-muted-foreground">Emergency Ambulance &amp; First Aid</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <p className="font-semibold text-foreground">Facilities &amp; Fire Response</p>
            <p className="font-mono text-muted-foreground">+91 94470 00102</p>
            <p className="text-[10px] text-muted-foreground">Electrical &amp; Infrastructure Triage</p>
          </div>
        </div>
      </section>

      {/* Institutional Support Note */}
      <section className="text-xs text-muted-foreground space-y-2 border-t border-border pt-4">
        <p>
          <strong>Technical Support Escalation:</strong> For account verification issues or system defects, contact your Department Coordinator or the campus IT Helpdesk.
        </p>
      </section>
    </PublicInfoShell>
  );
}
