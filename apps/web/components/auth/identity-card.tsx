import React from "react";
import Image from "next/image";
import { InstitutionalLookupResponse, InstitutionalTag } from "@smart-campus/contracts";
import { Avatar } from "../ui/avatar";
import {
  Building2,
  GraduationCap,
  Briefcase,
  Phone,
  ShieldCheck,
  Tag,
  BookOpen,
} from "lucide-react";
import { cn } from "@smart-campus/utils";

interface IdentityCardProps {
  profile: InstitutionalLookupResponse;
  className?: string;
  variant?: "verification" | "profile";
  footerAction?: React.ReactNode;
}

export function IdentityCard({
  profile,
  className,
  variant = "verification",
  footerAction,
}: IdentityCardProps) {
  const isStudent = profile.role === "student";
  const isFaculty = profile.role === "faculty";
  const isAdmin = profile.role === "admin";

  const formatTagLabel = (tag: InstitutionalTag) => {
    return tag.replace(/_/g, " ");
  };

  if (variant === "profile") {
    return (
      <div className={cn("space-y-4 select-none", className)}>
        {/* Section 1: Core Identity */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-medium">
              Identity Record
            </span>
            <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-mono">
              <Image src="/assets/campus_gram_icon.svg" alt="CampusGram" width={14} height={14} className="w-3.5 h-3.5 rounded-xs" />
              <span>Campus Directory</span>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <Avatar name={profile.fullName} role={profile.role} size="xl" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-zinc-100">{profile.fullName}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {profile.institutionalId}
                </span>
                <span className="text-xs font-mono capitalize text-zinc-600 dark:text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {profile.role}
                </span>
              </div>
              <p className="text-xs text-zinc-500 pt-1">
                Canonical status: {profile.isActive ? "Active Directory Record" : "Inactive"}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Academic / Professional Standing */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-medium">
              {isStudent ? "Academic Information" : "Faculty Assignment"}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                Department
              </span>
              <span className="font-medium text-zinc-200 text-right">
                {profile.departmentName || profile.departmentCode || "Institutional Core"}
              </span>
            </div>

            {isStudent && profile.programName && (
              <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-zinc-400" />
                  Program
                </span>
                <span className="font-medium text-zinc-200 text-right max-w-[60%]">
                  {profile.programName}
                </span>
              </div>
            )}

            {isStudent && (profile.academicYear || profile.semester) && (
              <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
                  Cohort & Section
                </span>
                <span className="font-mono text-zinc-200">
                  Year {profile.academicYear} • Semester {profile.semester} (Section {profile.section || "A"})
                </span>
              </div>
            )}

            {(isFaculty || isAdmin) && profile.designation && (
              <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
                  Designation
                </span>
                <span className="font-medium text-zinc-200 text-right">
                  {profile.designation}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Contact & Privacy */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-medium">
              Contact & Privacy
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
              <ShieldCheck className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
              Masked for privacy
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-zinc-400" />
                Registered Phone
              </span>
              <span className="font-mono text-zinc-200">{profile.maskedPhone}</span>
            </div>
          </div>
        </div>

        {/* Section 4: Institutional Responsibilities (if any) */}
        {profile.tags && profile.tags.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800/80">
              <Tag className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-medium">
                Institutional Responsibility Tags
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-mono bg-zinc-950 border border-zinc-800 text-zinc-300 px-2.5 py-1 rounded"
                >
                  {formatTagLabel(tag)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        {footerAction && <div className="pt-2">{footerAction}</div>}
      </div>
    );
  }

  // Verification Screen Card Variant
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl space-y-5 select-none",
        className
      )}
    >
      {/* Top Banner */}
      <div className="flex flex-col items-center text-center pb-5 border-b border-zinc-800">
        <div className="relative mb-3">
          <Avatar
            name={profile.fullName}
            role={profile.role}
            size="lg"
          />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full overflow-hidden bg-zinc-950 border border-zinc-700 shadow-xs flex items-center justify-center">
            <Image src="/assets/campus_gram_icon.svg" alt="Verified" width={20} height={20} className="w-full h-full object-cover" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-zinc-100 tracking-tight">
          {profile.fullName}
        </h3>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="font-mono text-xs text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
            {profile.institutionalId}
          </span>
          <span className="text-xs font-mono capitalize text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
            {profile.role}
          </span>
        </div>
      </div>

      {/* Identity Details */}
      <div className="space-y-2.5 text-xs">
        <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
          <span className="text-zinc-500">Department</span>
          <span className="font-medium text-zinc-200 text-right">
            {profile.departmentName || profile.departmentCode || "Institutional Core"}
          </span>
        </div>

        {isStudent && profile.programName && (
          <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
            <span className="text-zinc-500">Program</span>
            <span className="font-medium text-zinc-200 text-right max-w-[60%]">
              {profile.programName}
            </span>
          </div>
        )}

        {isStudent && (profile.academicYear || profile.semester) && (
          <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
            <span className="text-zinc-500">Academic Standing</span>
            <span className="font-mono text-zinc-200">
              Year {profile.academicYear} • Sem {profile.semester} ({profile.section || "A"})
            </span>
          </div>
        )}

        {(isFaculty || isAdmin) && profile.designation && (
          <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
            <span className="text-zinc-500">Designation</span>
            <span className="font-medium text-zinc-200 text-right">
              {profile.designation}
            </span>
          </div>
        )}

        <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
          <span className="text-zinc-500">Registered Phone</span>
          <span className="font-mono text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-850">
            {profile.maskedPhone}
          </span>
        </div>

        {profile.tags && profile.tags.length > 0 && (
          <div className="pt-2">
            <span className="text-zinc-500 block mb-1.5">Responsibilities</span>
            <div className="flex flex-wrap gap-1">
              {profile.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono bg-zinc-950 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded"
                >
                  {formatTagLabel(tag)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Action */}
      {footerAction && <div className="pt-2">{footerAction}</div>}
    </div>
  );
}
