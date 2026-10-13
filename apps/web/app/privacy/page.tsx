import React from "react";
import type { Metadata } from "next";
import { PublicInfoShell } from "../../components/layout/public-info-shell";
import { ShieldCheck, Eye, Lock, Database, UserCheck, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Institutional privacy disclosures, data handling boundaries, and security rules for CampusGram.",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicInfoShell
      title="Privacy Policy"
      subtitle="Transparency on institutional identity, operational grievance data, and life-safety records."
      badge="Legal & Compliance"
    >
      {/* Scope Notice */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5 text-foreground font-semibold text-sm">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <h2>Institutional Context & Purpose</h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          CampusGram is an integrated institutional operating platform designed for campus students, faculty, and administrative coordinators. This Privacy Policy details what information is processed, the technical boundaries protecting personal records, and how data is handled across all active campus modules.
        </p>
      </section>

      {/* 1. Information Collected */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h2>1. Information Handled by CampusGram</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">A. Institutional Identity & Biodata</h3>
            <p className="text-muted-foreground leading-relaxed">
              Users do not create raw self-registered accounts. Identity data (Full Name, Institutional ID, Roll Number, Academic Department, Program, and Registered Phone) is derived from pre-existing institutional catalogs (<code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">institutional_users</code>).
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">B. Grievances & Complaints (Module 2)</h3>
            <p className="text-muted-foreground leading-relaxed">
              When filing a complaint, CampusGram collects the description, category, location references, and optional uploaded evidence. Media uploads are restricted to supported formats and undergo server-side validation.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">C. Lost & Found Intelligence (Module 3)</h3>
            <p className="text-muted-foreground leading-relaxed">
              When listing lost or found items, CampusGram stores titles, item categories, locations, descriptions, and optional photos. Distinctive private marks and serial numbers are stored privately and concealed from public browsing.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">D. Life-Safety & Emergency Data (Module 4)</h3>
            <p className="text-muted-foreground leading-relaxed">
              When triggering 1-tap SOS distress reports or submitting safety check-ins, CampusGram records incident types, location names, descriptions, timestamps, and responder audit histories.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Privacy Boundaries & Phone Masking */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <h2>2. Technical Privacy Boundaries</h2>
        </div>
        <ul className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <li className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0 mt-2" />
            <div>
              <strong className="text-foreground">Phone Number Masking:</strong> Registered phone numbers are strictly masked on the server before client transmission (e.g. <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">+91 ******0001</code>). Raw telephone numbers are never delivered to client browsers or exposed in public API routes.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0 mt-2" />
            <div>
              <strong className="text-foreground">Concealed Distinguishing Marks:</strong> In Lost & Found, private marks and verification answers are excluded from public search endpoints and card projections to prevent fraudulent ownership claims.
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0 mt-2" />
            <div>
              <strong className="text-foreground">Audience-Scoped Emergency Alerts:</strong> Emergency broadcasts are filtered on the server using verified authorization rules. Operational alerts marked for responders are excluded from student client payloads.
            </div>
          </li>
        </ul>
      </section>

      {/* 3. Role-Based Access & Authorization */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <UserCheck className="w-4 h-4 text-muted-foreground" />
          <h2>3. Authorized Access & Institutional Roles</h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Access to student submissions and operational records is governed strictly by authenticated role and responsibility tags:
        </p>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-xs sm:text-sm">
          <p className="text-muted-foreground">
            • <strong>Students:</strong> Access only their own submitted grievances, item claims, academic vault files, and campus-wide announcements.
          </p>
          <p className="text-muted-foreground">
            • <strong>Faculty & Academic Coordinators:</strong> Access course announcements, student submissions, and department circulars within their authorized academic scope.
          </p>
          <p className="text-muted-foreground">
            • <strong>Designated Responders & Officers:</strong> Authorized staff (Security Officers, Maintenance Officers, HODs, Department Coordinators) can review escalated complaints, triage SOS reports, and manage item custodial handovers.
          </p>
        </div>
      </section>

      {/* 4. Infrastructure & Third-Party Processors */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base border-b border-border pb-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2>4. Storage, Infrastructure & Zero Secret Leakage</h2>
        </div>
        <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <p>
            CampusGram maintains strict server-boundary security rules. Infrastructure secrets (<code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">SUPABASE_SERVICE_ROLE_KEY</code> and <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">GEMINI_API_KEY</code>) are executed exclusively on server routes and are never bundled into client-side JavaScript.
          </p>
          <p>
            PostgreSQL databases utilize Row-Level Security (RLS) policies to ensure that unauthenticated clients cannot read operational tables directly.
          </p>
        </div>
      </section>

      {/* 5. Institutional Contact & Disclaimers */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5 text-foreground font-semibold text-sm">
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          <h2>Institutional Disclosures & Verification Requirements</h2>
        </div>
        <div className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          <p>
            • <strong>Simulated OTP & Mock Mode:</strong> In local development and mock mode environments, OTP verification codes and external messaging channels (SMS/Push blasts) are simulated strings for system testing and demonstration.
          </p>
          <p>
            • <strong>Institutional Inquiries:</strong> Formal requests for data correction, record review, or institutional privacy governance should be submitted through the official campus Registrar or designated Systems Administrator.
          </p>
        </div>
      </section>
    </PublicInfoShell>
  );
}
