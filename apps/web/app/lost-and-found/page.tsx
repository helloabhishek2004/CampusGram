"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@smart-campus/ui";
import {
  Search,
  PlusCircle,
  PackageSearch,
  ShieldCheck,
  ScanSearch,
  ArrowRight,
  Clock,
} from "lucide-react";

export default function LostAndFoundDashboard() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* Module Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-4 h-4 rounded-sm overflow-hidden bg-zinc-950 border border-border shrink-0">
                <Image src="/assets/campus_gram_icon.svg" alt="CampusGram" width={16} height={16} className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-border bg-muted text-muted-foreground font-semibold tracking-wider">
                Module 3
              </span>
              <span className="text-xs text-muted-foreground font-mono">Lost & Found Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <span>Lost & Found Network</span>
              <ScanSearch className="w-5 h-5 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Matching uses available text descriptions and photos. Private clues stay out of the public catalog; ownership claims are reviewed before handover.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/lost-and-found/my-reports"
              className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span>My Reports & Claims</span>
            </Link>
            <Link
              href="/lost-and-found/admin"
              className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Admin Desk</span>
            </Link>
          </div>
        </div>

        {/* Primary Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Lost Item */}
          <Link href="/lost-and-found/report/lost" className="group apple-press">
            <Card className="apple-card h-full border-border bg-card hover:border-primary/40 transition-all rounded-xl">
              <CardHeader className="pb-3">
                <div className="w-10 h-10 rounded-lg bg-muted border border-border text-foreground flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                  <ScanSearch className="w-5 h-5" />
                </div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center justify-between">
                  <span>I Lost Something</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Submit a report with location, approximate timestamp, and description. Check your report for processing updates and potential matches.
                </p>
              </CardContent>
              <CardFooter className="pt-0 text-[11px] text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                File Lost Report &rarr;
              </CardFooter>
            </Card>
          </Link>

          {/* Found Item */}
          <Link href="/lost-and-found/report/found" className="group apple-press">
            <Card className="apple-card h-full border-border bg-card hover:border-primary/40 transition-all rounded-xl">
              <CardHeader className="pb-3">
                <div className="w-10 h-10 rounded-lg bg-muted border border-border text-foreground flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center justify-between">
                  <span>I Found Something</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Report an item you discovered on campus. Sensitive identifying features are masked from public view for fraud prevention.
                </p>
              </CardContent>
              <CardFooter className="pt-0 text-[11px] text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                Submit Found Item &rarr;
              </CardFooter>
            </Card>
          </Link>

          {/* Browse Catalog */}
          <Link href="/lost-and-found/browse" className="group apple-press">
            <Card className="apple-card h-full border-border bg-card hover:border-primary/40 transition-all rounded-xl">
              <CardHeader className="pb-3">
                <div className="w-10 h-10 rounded-lg bg-muted border border-border text-foreground flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                  <PackageSearch className="w-5 h-5" />
                </div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center justify-between">
                  <span>Browse Item Catalog</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Search active items reported across campus buildings, filter by item category, and submit verification claims.
                </p>
              </CardContent>
              <CardFooter className="pt-0 text-[11px] text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                Explore Directory &rarr;
              </CardFooter>
            </Card>
          </Link>
        </div>

        {/* System Safeguards & Protocol Strip */}
        <div className="bg-muted/40 border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Verification & Custody Handover Protocol
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <span className="w-4 h-4 rounded-full bg-muted border border-border text-[10px] font-mono flex items-center justify-center text-muted-foreground">1</span>
                <span>Multimodal Matching</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Images and descriptions are embedded into high-dimensional vector space for semantic similarity scoring.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <span className="w-4 h-4 rounded-full bg-muted border border-border text-[10px] font-mono flex items-center justify-center text-muted-foreground">2</span>
                <span>Zero-Knowledge Questions</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Claimants must describe distinguishing private marks (wallpaper, scratches, contents) without seeing raw answers.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <span className="w-4 h-4 rounded-full bg-muted border border-border text-[10px] font-mono flex items-center justify-center text-muted-foreground">3</span>
                 <span>Approved Handover</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                 After approval, agree on an in-person, Campus Security, or Department Office handover process.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
