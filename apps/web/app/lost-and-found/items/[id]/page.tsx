"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from "@smart-campus/ui";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Info,
  ScanSearch,
  RefreshCw,
} from "lucide-react";
import { cn } from "@smart-campus/utils";
import { useCurrentUser } from "../../_lib/use-current-user";
import { readClaimSummaries, readWorkflowResponse, workflowCapabilities, type ClaimSummary, type WorkflowCapabilities } from "../../_lib/workflow-client";

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [item, setItem] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<WorkflowCapabilities>({});
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const { userId, loading: sessionLoading, error: sessionError } = useCurrentUser();

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        setMatchesError(null);
        setItem(null);
        setMatches([]);
        setClaims([]);
        setCapabilities({});
        if (!userId) throw new Error(sessionError || "Sign in to view item details.");
        const data = await readWorkflowResponse(await fetch(`/api/lost-found/items/${id}`, { cache: "no-store" }));
        if (cancelled) return;
        const permissions = workflowCapabilities(data.capabilities ?? data.item?.capabilities);
        const claimSummaries = readClaimSummaries(data.claims);
        setItem(data.item);
        setCapabilities(permissions);
        setClaims(claimSummaries);
        if (permissions.canViewMatches) {
          try {
            const matchesData = await readWorkflowResponse(await fetch(`/api/lost-found/items/${id}/matches`, { cache: "no-store" }));
            if (!cancelled) setMatches(matchesData.matches || []);
          } catch (e) {
            if (!cancelled) setMatchesError(e instanceof Error ? e.message : "Unable to load matches.");
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load this item.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => { cancelled = true; };
  }, [id, userId, sessionLoading, sessionError]);

  if (loading || sessionLoading) {
    return (
      <AppShell>
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-xs">Loading item details...</span>
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell>
        <div className="py-20 text-center space-y-3">
          <p role="alert" className="text-sm font-semibold text-destructive">{error || "Item not found."}</p>
          <Link
            href="/lost-and-found/browse"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            &larr; Return to directory
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/lost-and-found/browse"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Directory
          </Link>
          <Link href="/lost-and-found/my-reports" className="text-xs text-muted-foreground hover:text-foreground font-medium">My Reports & Claims &rarr;</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Details (8 cols) */}
          <div className="lg:col-span-8 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "text-[10px] font-mono px-2 py-0.5 rounded font-bold border",
                    item.type === "lost"
                      ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  )}
                >
                  {item.type.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground uppercase">
                  {item.status?.replace("_", " ")}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground capitalize">
                  {item.category?.replace("_", " ")}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground break-words">{item.title}</h1>
            </div>

            {item.images?.length > 0 ? (
              <div className="relative aspect-video bg-muted/40 rounded-xl overflow-hidden border border-border">
                <Image
                  src={item.images[0].public_url}
                  alt={item.title}
                  fill
                  unoptimized
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video bg-muted/20 rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs">
                No photo provided for this report
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2.5 bg-card p-3 rounded-xl border border-border">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Location
                  </p>
                  <p className="text-xs font-medium text-foreground truncate">
                    {item.location_description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 bg-card p-3 rounded-xl border border-border">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Event Date
                  </p>
                  <p className="text-xs font-medium text-foreground truncate">
                    {format(new Date(item.event_date || item.created_at), "MMM d, yyyy - h:mm a")}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-card p-4 rounded-xl border border-border">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                <Info className="w-4 h-4 text-muted-foreground" /> Public Description
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {item.public_description || "No public notes provided."}
              </p>
            </div>
          </div>

          {/* Right Col: AI Matches (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {item.status === "processing" && (
              <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Report awaiting processing</p>
                <p>Match candidates are not available yet. Check your report again for updated status.</p>
              </div>
            )}
            {claims.length > 0 && (
              <Card className="border-border bg-card rounded-xl">
                <CardHeader className="p-3.5"><CardTitle className="text-xs text-foreground">{item.type === "found" ? "Incoming Claims" : "Related Claims"}</CardTitle></CardHeader>
                <CardContent className="p-3.5 pt-0 space-y-2">
                  {claims.map((claim) => (
                    <Link key={claim.id} href={`/lost-and-found/claims/${claim.id}`} className="block rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground hover:border-primary/40 transition-colors">
                      Review claim · {claim.status?.replaceAll("_", " ")}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
            {capabilities.canViewMatches && (
            <Card className="border-border bg-card rounded-xl overflow-hidden">
              <CardHeader className="bg-muted/40 border-b border-border p-3.5">
                <div className="flex items-center gap-2">
                  <ScanSearch className="w-4 h-4 text-foreground" />
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    AI Match Candidates
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3.5 space-y-3">
                {matchesError ? <p role="alert" className="text-xs text-destructive">{matchesError}</p> : matches.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-xs space-y-1">
                    <p className="font-medium text-foreground">No match candidates yet</p>
                    <p className="text-[11px] text-muted-foreground">
                      Candidates will appear here when report processing finds a similar item.
                    </p>
                  </div>
                ) : (
                  matches.map((match) => {
                    const otherItem = item.type === "lost" ? match.found_item : match.lost_item;
                    if (!otherItem) return null;

                    return (
                      <div
                        key={match.id}
                        className="border border-border rounded-lg p-3 space-y-2 hover:border-primary/40 transition-colors bg-card"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-semibold text-xs text-foreground line-clamp-1">
                            {otherItem.title}
                          </h4>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-foreground shrink-0 font-bold">
                            {(match.overall_score * 100).toFixed(0)}% Similarity
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {otherItem.public_description}
                        </p>
                        <div className="pt-2 border-t border-border">
                          <Link href={`/lost-and-found/matches/${match.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs h-7 border-border bg-background text-foreground hover:bg-muted"
                            >
                              Review & Verify Match &rarr;
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
