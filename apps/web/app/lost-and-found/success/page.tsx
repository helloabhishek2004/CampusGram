"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@smart-campus/ui";
import { CheckCircle2, AlertCircle, MapPin, ArrowRight, ScanSearch, Package, RefreshCw } from "lucide-react";
import { cn } from "@smart-campus/utils";
import { matchCheckStatus, readWorkflowResponse, workflowError } from "../_lib/workflow-client";

type MatchStatus = "checking" | "processing" | "waiting" | "match_found" | "no_match" | "error";

function SuccessContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const itemId = searchParams.get("id");
  const [status, setStatus] = useState<MatchStatus>("checking");
  const [match, setMatch] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setStatus("checking");
    setMatch(null);
    setError(null);
    async function check() {
      try {
        if (!itemId) throw new Error("A report reference is needed to check processing status. Open the report from My Reports.");
        const data = await readWorkflowResponse(await fetch(`/api/lost-found/items/${itemId}/check-matches`, { cache: "no-store", signal: controller.signal }));
        if (controller.signal.aborted) return;
        const result = matchCheckStatus(data);
        if (result === "failed") throw new Error(workflowError(data.error, "Report processing failed. Check the item’s status for details."));
        if (result === "unknown") throw new Error("The server did not provide a processing status. Open the report to check its current state.");
        if (result === "match_found") { setMatch(data.match); setStatus("match_found"); return; }
        if (result === "no_match") { setStatus("no_match"); return; }
        attempts += 1;
        if (attempts >= 8) { setStatus("waiting"); return; }
        setStatus("processing");
        timer = setTimeout(() => { void check(); }, 1500);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Unable to check report status.");
          setStatus("error");
        }
      }
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [itemId, retry]);

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div className="text-center space-y-3">
        <div className={cn("w-16 h-16 rounded-full border flex items-center justify-center mx-auto",
          status === "error" ? "bg-destructive/10 border-destructive/20 text-destructive" : status === "match_found" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted border-border text-foreground")}>
          {status === "error" ? <AlertCircle className="w-8 h-8" /> : status === "checking" || status === "processing" ? <ScanSearch className="w-8 h-8 animate-pulse" /> : <CheckCircle2 className="w-8 h-8" />}
        </div>
        <h1 className="text-xl font-bold text-foreground">{status === "match_found" ? "Potential Match Located" : type === "found" ? "Found Item Report" : "Lost Item Report"}</h1>
        <div aria-live="polite" className="text-muted-foreground text-xs leading-relaxed">
          {status === "checking" && <p>Checking the report’s current processing status...</p>}
          {status === "processing" && <p>The server reports that this item is still processing. Checking for an update...</p>}
          {status === "waiting" && <p>Your report is still awaiting processing. It has not been classified as having no match. Open the report later or check again.</p>}
          {status === "no_match" && <p>No current match candidates were returned. Your report’s status and future candidates can be checked from My Reports.</p>}
          {status === "match_found" && <p>This candidate was selected from the available item signals. Similarity is not a probability or confirmation of ownership.</p>}
          {status === "error" && <div role="alert" className="text-destructive space-y-1"><p>We couldn’t refresh the processing status. If submission was confirmed, your report remains saved.</p><p>{error}</p></div>}
        </div>
      </div>

      {status === "match_found" && match && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border",
              match.band === "high" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20")}>
              {match.band === "high" ? "High Similarity" : "Possible Match"}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{match.score}% Similarity</span>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/40 px-4 py-2.5 border-b border-border flex items-center gap-1.5 text-xs text-foreground font-medium"><Package className="w-3.5 h-3.5 text-muted-foreground" /> Candidate Item Preview</div>
            {match.matchedItem?.images?.[0]?.public_url && <div className="relative h-44 bg-muted/40 overflow-hidden"><Image src={match.matchedItem.images[0].public_url} alt={match.matchedItem.title} fill unoptimized className="w-full h-full object-cover" /></div>}
            <div className="p-4 space-y-2">
              <h3 className="font-semibold text-foreground text-sm">{match.matchedItem?.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{match.matchedItem?.public_description}</p>
              {match.matchedItem?.location_description && <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono"><MapPin className="w-3 h-3" /> {match.matchedItem.location_description}</p>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">Review the match and complete claim verification before arranging a handover. Contact details are not released on a match alone.</p>
          {match.id && <Link href={`/lost-and-found/matches/${match.id}`} className="block"><Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold">Review & Verify Match <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button></Link>}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {(status === "waiting" || status === "error") && itemId && <Button onClick={() => setRetry((value) => value + 1)} variant="outline" className="w-full border-border bg-card text-foreground hover:bg-muted text-xs">Check Status Again</Button>}
        {itemId && <Link href={`/lost-and-found/items/${itemId}`}><Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold">View Item Details <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button></Link>}
        <Link href="/lost-and-found/my-reports"><Button variant="outline" className="w-full border-border bg-card text-foreground hover:bg-muted text-xs">My Reports</Button></Link>
        <Link href="/lost-and-found"><Button variant="outline" className="w-full border-border bg-card text-foreground hover:bg-muted text-xs">Return to Lost & Found</Button></Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return <AppShell><Suspense fallback={<div className="py-20 flex flex-col items-center gap-2 text-zinc-500"><RefreshCw className="w-6 h-6 animate-spin text-zinc-400" /><span className="text-xs">Loading report confirmation...</span></div>}><SuccessContent /></Suspense></AppShell>;
}
