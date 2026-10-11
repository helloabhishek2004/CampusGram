"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@smart-campus/ui";
import {
  ArrowLeft,
  PackageSearch,
  RefreshCw,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { cn } from "@smart-campus/utils";
import { useCurrentUser } from "../_lib/use-current-user";
import { myReportsUrl, readMyReports, readWorkflowResponse, type ReportSummary } from "../_lib/workflow-client";

export default function MyReportsPage() {
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20 });
  const [refresh, setRefresh] = useState(0);
  const { userId, loading: sessionLoading, error: sessionError } = useCurrentUser();

  useEffect(() => { setPage(1); }, [userId]);

  useEffect(() => {
    if (sessionLoading) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);
    async function fetchItems() {
      try {
        if (!userId) throw new Error(sessionError || "Sign in to view your lost and found reports.");
        const data = readMyReports(await readWorkflowResponse(await fetch(myReportsUrl(page), { cache: "no-store", signal: controller.signal })));
        if (data.pagination.page !== page) throw new Error("The server returned an unexpected report page. Please refresh.");
        if (!controller.signal.aborted) {
          setItems(data.items);
          setPagination(data.pagination);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load your reports.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void fetchItems();
    return () => controller.abort();
  }, [page, refresh, userId, sessionLoading, sessionError]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-4">
          <div>
            <Link
              href="/lost-and-found"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium mb-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Lost & Found
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md overflow-hidden bg-zinc-950 border border-border shrink-0">
                <Image src="/assets/campus_gram_icon.svg" alt="CampusGram" width={24} height={24} className="w-full h-full object-cover" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                My Reports & Claims
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your lost and found reports in every lifecycle state. Open an item to review matches and incoming claims.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/lost-and-found/report/lost"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + Report Lost
            </Link>
            <Link href="/lost-and-found/report/found" className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card text-foreground hover:bg-muted transition-colors">+ Report Found</Link>
            <button
              onClick={() => setRefresh((value) => value + 1)}
              disabled={loading || sessionLoading}
              className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", (loading || sessionLoading) && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading || sessionLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-xs">Loading reported items...</span>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-5 text-xs text-destructive">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground space-y-3">
            <PackageSearch className="w-10 h-10 text-muted-foreground/60 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">{page === 1 ? "No reports filed yet" : "No reports on this page"}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Items you report as lost or found will appear here alongside potential matches.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link
                href="/lost-and-found/report/lost"
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted"
              >
                I Lost Something
              </Link>
              <Link
                href="/lost-and-found/report/found"
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted"
              >
                I Found Something
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <Card
                key={item.id}
                className="border-border bg-card rounded-xl overflow-hidden hover:border-primary/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded font-bold border",
                          item.type === "lost"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        )}
                      >
                        {item.type === "lost" ? "LOST REPORT" : "FOUND REPORT"}
                      </span>

                      <span className="text-[10px] font-mono text-muted-foreground">
                        {item.status.replaceAll("_", " ").toUpperCase()}
                      </span>
                    </div>

                    <CardTitle className="text-sm font-semibold text-foreground line-clamp-1">
                      {item.title}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="px-4 pb-3 space-y-2">
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.public_description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span>{item.location_description}</span>
                    </div>
                  </CardContent>
                </div>

                <CardFooter className="pt-2 pb-3 px-4 border-t border-border flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground font-mono">
                    {Number.isNaN(new Date(item.event_date || item.created_at).getTime()) ? "Date unavailable" : format(new Date(item.event_date || item.created_at), "MMM d, yyyy")}
                  </span>

                  <Link
                    href={`/lost-and-found/items/${item.id}`}
                    className="flex items-center gap-1 text-foreground hover:text-primary font-medium transition-colors"
                  >
                    <span>Details & Claims</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
        {!loading && !sessionLoading && !error && (pagination.total > pagination.limit || page > 1) && (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-border bg-card px-3 py-2 text-foreground hover:bg-muted disabled:opacity-40 transition-colors">Previous</button>
            <span>Page {page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit))} · {pagination.total} reports</span>
            <button disabled={page * pagination.limit >= pagination.total} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border bg-card px-3 py-2 text-foreground hover:bg-muted disabled:opacity-40 transition-colors">Next</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
