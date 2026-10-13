"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldAlert, AlertTriangle, ArrowRight, X, Info } from "lucide-react";
import { EmergencyAlert } from "@smart-campus/contracts";
import { emergencyClientService } from "@/lib/services/emergency-client-service";
import { cn } from "@smart-campus/utils";

export function EmergencyBanner() {
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(null);
  const [dismissedAlertId, setDismissedAlertId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = emergencyClientService.pollAlerts(
      (res) => {
        if (res.active && res.active.length > 0) {
          // Priority to critical or warning
          const criticalOrWarning = res.active.find(
            (a) => a.severity === "critical" || a.severity === "warning"
          );
          setActiveAlert(criticalOrWarning || res.active[0]);
        } else {
          // All active alerts cleared / resolved
          setActiveAlert(null);
        }
      },
      { intervalMs: 5_000 }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  if (!activeAlert || dismissedAlertId === activeAlert.id) return null;

  const isCritical = activeAlert.severity === "critical";
  const isWarning = activeAlert.severity === "warning";

  return (
    <div
      role="region"
      aria-label="Campus Emergency Alert"
      className={cn(
        "relative w-full border-b transition-colors px-4 py-2.5 flex items-center justify-between text-xs z-30",
        isCritical
          ? "bg-red-50 border-red-200 text-red-950 dark:bg-red-950/80 dark:border-red-800 dark:text-red-100"
          : isWarning
          ? "bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/80 dark:border-amber-800/80 dark:text-amber-100"
          : "bg-blue-50 border-blue-200 text-blue-950 dark:bg-blue-950/80 dark:border-blue-800/80 dark:text-blue-100"
      )}
    >
      <div className="flex items-center gap-2 max-w-4xl min-w-0 pr-2 sm:pr-6">
        <div className="shrink-0 p-1 rounded-md bg-black/5 dark:bg-black/20">
          {isCritical ? (
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 animate-pulse" />
          ) : isWarning ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          )}
        </div>
        <div className="min-w-0 flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span
            className={cn(
              "font-mono uppercase text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wider shrink-0",
              isCritical
                ? "bg-red-600 text-white dark:bg-red-800 dark:text-red-100"
                : isWarning
                ? "bg-amber-600 text-white dark:bg-amber-800/90 dark:text-amber-100"
                : "bg-blue-600 text-white dark:bg-blue-800/90 dark:text-blue-100"
            )}
          >
            {activeAlert.is_drill ? "DRILL" : activeAlert.severity}
          </span>
          <p className="font-semibold truncate text-[11px] sm:text-xs">{activeAlert.title}</p>
          <span className="hidden md:inline text-zinc-400 dark:text-zinc-600">|</span>
          <span className="hidden md:inline text-zinc-700 dark:text-zinc-300 truncate max-w-sm">
            {activeAlert.action_required || activeAlert.body}
          </span>
          <span className="text-[9px] uppercase tracking-wide opacity-75 font-mono">Campus Notice</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link
          href="/emergency"
          className={cn(
            "flex items-center gap-1 font-semibold hover:underline text-[11px] sm:text-xs whitespace-nowrap",
            isCritical
              ? "text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
              : isWarning
              ? "text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
              : "text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
          )}
        >
          <span className="hidden sm:inline">Control Center</span>
          <span className="sm:hidden">View</span>
          <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </Link>
        <button
          onClick={() => activeAlert && setDismissedAlertId(activeAlert.id)}
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          aria-label="Dismiss alert banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
