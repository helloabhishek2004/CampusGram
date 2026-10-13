import React from "react";
import type { Metadata } from "next";
import { PublicInfoShell } from "../../components/layout/public-info-shell";
import { Scale, CheckCircle2, AlertOctagon, HelpCircle, FileCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Institutional acceptable use policy and terms of service for the CampusGram platform.",
};

export default function TermsOfServicePage() {
  return (
    <PublicInfoShell
      title="Terms of Service"
      subtitle="Acceptable use policy and operational guidelines governing the CampusGram campus platform."
      badge="Legal & Usage"
    >
      {/* Preamble */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5 text-foreground font-semibold text-sm">
          <Scale className="w-4 h-4 text-muted-foreground" />
          <h2>Acceptance of Institutional Terms</h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          By signing into CampusGram with an authorized institutional identifier, users agree to abide by these Terms of Service as well as the institution&apos;s existing Code of Conduct, Academic Honesty Policies, and IT Acceptable Use Guidelines.
        </p>
      </section>

      {/* 1. Account & Identity Responsibilities */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          <h2>1. Identity & Account Responsibilities</h2>
        </div>
        <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <p>
            • <strong>Authorized Access Only:</strong> Users must access CampusGram solely using their own official institutional ID and telephone credentials. Attempting to spoof institutional IDs, intercept verification OTPs, or assume another member&apos;s identity is strictly prohibited and subject to institutional disciplinary procedures.
          </p>
          <p>
            • <strong>Session Integrity:</strong> Users are responsible for safeguarding active browser sessions and must sign out when utilizing shared lab workstations or public campus terminals.
          </p>
        </div>
      </section>

      {/* 2. Grievance & Complaint Redressal (Module 2) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <FileCheck className="w-4 h-4 text-muted-foreground" />
          <h2>2. Responsible Complaint & Grievance Submissions</h2>
        </div>
        <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <p>
            • <strong>Truthful Reporting:</strong> Complaints submitted to Module 2 are automatically categorized by AI and routed to designated campus authorities. All reports must represent genuine maintenance defects, infrastructural faults, or administrative grievances.
          </p>
          <p>
            • <strong>Prohibited Filings:</strong> Knowingly submitting frivolous complaints, vexatious grievances, defamatory statements, or uploading non-incident graphic material is a violation of institutional conduct rules.
          </p>
        </div>
      </section>

      {/* 3. Lost & Found Governance (Module 3) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <FileCheck className="w-4 h-4 text-muted-foreground" />
          <h2>3. Lost & Found Custody & Handover Policy</h2>
        </div>
        <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <p>
            • <strong>Honest Identification:</strong> When claiming found property, claimants must provide accurate answers to ownership verification questions regarding concealed marks.
          </p>
          <p>
            • <strong>Physical Verification:</strong> The matching engine provides similarity scoring as an empirical tool. Handover decisions require in-person validation at the Central Security Desk. CampusGram does not guarantee property recovery or accept liability for contested physical property.
          </p>
        </div>
      </section>

      {/* 4. Life-Safety & Emergency Rules (Module 4) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <AlertOctagon className="w-4 h-4 text-destructive" />
          <h2>4. Emergency SOS & Broadcast Abuse Prohibition</h2>
        </div>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-2 text-xs sm:text-sm">
          <p className="text-foreground font-medium">
            Strict Zero-Tolerance Policy for False Distress Reports:
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Module 4 triggers immediate priority alerts for campus security and first responders. Generating false SOS alerts, testing emergency alarms without authorized coordination, or submitting prank distress calls will result in immediate suspension of account privileges and referral to campus security authorities.
          </p>
        </div>
      </section>

      {/* 5. Limitations & Institutional Review */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          <h2>5. Service Availability & Legal Disclaimers</h2>
        </div>
        <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <p>
            • <strong>Service Level:</strong> CampusGram is provided as an internal digital campus platform. While high availability is maintained, uninterrupted uptime is not guaranteed during scheduled maintenance windows or upstream institutional network outages.
          </p>
          <p>
            • <strong>Immediate Distress Hotline:</strong> In circumstances involving active, life-threatening danger (major fire, acute cardiac arrest, active violence), users must dial official emergency telephone lines directly rather than relying solely on web application delivery.
          </p>
        </div>
      </section>
    </PublicInfoShell>
  );
}
