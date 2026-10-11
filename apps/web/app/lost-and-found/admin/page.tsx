"use client";

import React, { useEffect, useState, useCallback } from "react";
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
  Activity,
  Users,
  Eye,
  CheckCircle2,
  Play,
  RefreshCw,
} from "lucide-react";
import { cn } from "@smart-campus/utils";

export default function AdminDashboardPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/lost-found/admin/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const triggerCron = async (jobName: string) => {
    try {
      const res = await fetch(`/api/lost-found/admin/crons/${jobName}`, { method: "POST" });
      const data = await res.json();
      alert(data.message || "Cron Triggered");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-4">
          <div className="space-y-1">
            <Link
              href="/lost-and-found"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium mb-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Lost & Found
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md overflow-hidden bg-zinc-950 border border-border shrink-0">
                <Image src="/assets/campus_gram_icon.svg" alt="CampusGram" width={24} height={24} className="w-full h-full object-cover" />
              </div>
              <span>Custody & Audit Desk</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Audit log of campus contact reveals, ownership claims, and physical custody handovers.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={refreshing}
              className="border-border bg-card text-foreground hover:bg-muted text-xs"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerCron("expire")}
              className="border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted text-xs"
            >
              <Play className="w-3 h-3 mr-1 text-muted-foreground" /> Expire Items
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerCron("windows")}
              className="border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted text-xs"
            >
              <Play className="w-3 h-3 mr-1 text-muted-foreground" /> Close Windows
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground text-xs font-medium flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" /> Contact Reveals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-extrabold text-foreground font-mono">
                {logs.filter((l) => l.type === "contact_reveal").length}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Audit verified disclosures</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Handover Claims
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                {logs.filter((l) => l.type === "claim").length}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Total claims processed</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground text-xs font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" /> Item Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-extrabold text-foreground font-mono">
                {logs.filter((l) => l.type === "item_event").length}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">State machine transitions</p>
            </CardContent>
          </Card>
        </div>

        {/* Audit Log Table */}
        <Card className="border-border bg-card rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border px-4 py-3 bg-muted/40">
            <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" /> Audit Log Trail
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-xs">Loading audit logs...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-xs font-medium">
                No recent security desk activity recorded.
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-xs text-left text-foreground">
                  <thead className="text-[10px] text-muted-foreground uppercase bg-muted/50 border-b border-border font-mono">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Timestamp</th>
                      <th className="px-4 py-3 font-semibold">Event Type</th>
                      <th className="px-4 py-3 font-semibold">Details / Reason</th>
                      <th className="px-4 py-3 font-semibold">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {logs.map((log, i) => (
                      <tr key={log.id || i} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                          {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "text-[10px] font-mono px-2 py-0.5 rounded font-medium border",
                              log.type === "contact_reveal"
                                ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                                : log.type === "claim"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-muted text-foreground border-border"
                            )}
                          >
                            {log.type.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground">{log.action}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                          {log.actor_id || "System"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
