"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/layout/app-shell";
import { useCampusAuth } from "@/components/auth/auth-guard";
import {
  EmergencyAlert,
  EmergencyReport,
  EmergencyType,
  EmergencySeverity,
  EmergencyScope,
  AlertChannel,
} from "@smart-campus/contracts";
import {
  emergencyClientService,
  EmergencyDataResponse,
} from "@/lib/services/emergency-client-service";
import type { EmergencyContact } from "@/lib/emergency/emergency-service";
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  HeartPulse,
  Lock,
  Building,
  Radio,
  CheckCircle2,
  Phone,
  Clock,
  Send,
  MapPin,
  RefreshCw,
  Info,
  Check,
  Megaphone,
  UserCheck,
  Layers,
  ArrowRight,
} from "lucide-react";
import { cn } from "@smart-campus/utils";

const EMERGENCY_TYPES: { type: EmergencyType; label: string; icon: any; isP1: boolean }[] = [
  { type: "fire", label: "Fire / Smoke", icon: Flame, isP1: true },
  { type: "medical", label: "Medical Trauma", icon: HeartPulse, isP1: true },
  { type: "security_threat", label: "Security Threat", icon: Lock, isP1: true },
  { type: "hazmat", label: "Gas / Hazmat", icon: AlertTriangle, isP1: true },
  { type: "building_problem", label: "Elevator / Trap", icon: Building, isP1: false },
  { type: "other", label: "Other Hazard", icon: Radio, isP1: false },
];

export default function EmergencyControlPage() {
  const { user } = useCampusAuth();

  const isStaffOrAdmin =
    user?.role === "faculty" ||
    user?.role === "admin" ||
    user?.tags?.some((r: string) =>
      ["HOD", "CAS_COORDINATOR", "DEPARTMENT_COORDINATOR"].includes(r)
    );


  // Data states
  const [data, setData] = useState<EmergencyDataResponse>({
    success: false,
    alerts: [],
    active: [],
    hotlines: [],
  });
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // SOS Form state
  const [sosType, setSosType] = useState<EmergencyType>("medical");
  const [sosLocation, setSosLocation] = useState("");
  const [sosDescription, setSosDescription] = useState("");
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [sosFeedback, setSosFeedback] = useState<{ message: string; ref?: string } | null>(null);

  // Safety Check-In state
  const [checkedInAlerts, setCheckedInAlerts] = useState<Record<string, "safe" | "need_help">>({});
  const [checkInLoading, setCheckInLoading] = useState<string | null>(null);

  // Broadcast Composer state (for authorized staff)
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastSeverity, setBroadcastSeverity] = useState<EmergencySeverity>("warning");
  const [broadcastScope, setBroadcastScope] = useState<EmergencyScope>("campus_wide");
  const [broadcastAssembly, setBroadcastAssembly] = useState("Central Sports Ground Assembly A");
  const [broadcastAction, setBroadcastAction] = useState("");
  const [broadcastIsDrill, setBroadcastIsDrill] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<AlertChannel[]>(["in_app", "push", "sms"]);
  const [broadcastSubmitting, setBroadcastSubmitting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<"live" | "sos" | "hotlines" | "dispatch" | "reports">(
    "live"
  );

  const fetchEmergencyData = useCallback(async (forceRefresh = false) => {
    try {
      setRefreshing(true);
      const [alertsRes, reportsRes] = await Promise.all([
        emergencyClientService.getAlerts(forceRefresh),
        emergencyClientService.getReports(forceRefresh),
      ]);

      if (alertsRes.success) setData(alertsRes);
      if (reportsRes.success) setReports(reportsRes.reports);
    } catch (e) {
      console.error("Emergency data fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEmergencyData(false);
  }, [fetchEmergencyData]);

  // Handle SOS submission
  const handleSosSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sosLocation.trim() || !sosDescription.trim() || sosSubmitting) return;

    setSosSubmitting(true);
    setSosFeedback(null);

    try {
      const res = await emergencyClientService.submitReport({
        type: sosType,
        location_name: sosLocation.trim(),
        description: sosDescription.trim(),
        reporter_name: user?.fullName || "Campus Resident",
      });

      if (res.success) {
        setSosFeedback({ message: res.message, ref: res.report?.public_ref });
        setSosDescription("");
        setSosLocation("");
        fetchEmergencyData(true);
      } else {
        setSosFeedback({ message: res.message || "Failed to transmit SOS report" });
      }
    } catch {
      setSosFeedback({ message: "Network transmission error" });
    } finally {
      setSosSubmitting(false);
    }
  };

  // Handle Safety Check-In
  const handleCheckIn = async (alertId: string, status: "safe" | "need_help") => {
    if (checkInLoading) return;
    setCheckInLoading(alertId);
    try {
      const res = await emergencyClientService.checkIn({
        alert_id: alertId,
        status,
        user_id: user?.institutionalId,
        location_note: "Checked in via CampusGram Portal",
      });

      if (res.success) {
        setCheckedInAlerts((prev) => ({ ...prev, [alertId]: status }));
      }
    } catch {
      // silent
    } finally {
      setCheckInLoading(null);
    }
  };

  // Handle Broadcast Dispatch
  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim() || broadcastSubmitting) return;

    setBroadcastSubmitting(true);
    setBroadcastResult(null);

    try {
      const res = await emergencyClientService.broadcastAlert({
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        severity: broadcastSeverity,
        scope: broadcastScope,
        kind: "alert",
        channels: selectedChannels,
        assembly_point: broadcastAssembly.trim() || undefined,
        action_required: broadcastAction.trim() || undefined,
        is_drill: broadcastIsDrill,
      });

      if (res.success) {
        setBroadcastResult(res.message);
        setBroadcastTitle("");
        setBroadcastBody("");
        setBroadcastAction("");
        fetchEmergencyData(true);
        setActiveTab("live");
      } else {
        setBroadcastResult(res.message || "Failed to dispatch broadcast");
      }
    } catch {
      setBroadcastResult("Broadcast transmission failed");
    } finally {
      setBroadcastSubmitting(false);
    }
  };

  const toggleChannel = (ch: AlertChannel) => {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Module 4 Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-4 h-4 rounded-sm overflow-hidden bg-zinc-950 border border-border shrink-0">
                <Image src="/assets/campus_gram_icon.svg" alt="CampusGram" width={16} height={16} className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 font-bold tracking-wider">
                Module 4
              </span>
              <span className="text-xs text-muted-foreground font-mono">Emergency Alert & Life Safety</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Emergency Command Center</span>
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Campus broadcast monitoring, SOS request recording, and priority triage rules. External responder dispatch and notification delivery are not connected in this prototype.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("sos")}
              className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-xs"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Report SOS</span>
            </button>
            <button
              onClick={() => fetchEmergencyData(true)}
              disabled={refreshing}
              className="apple-press p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1.5 rounded-xl border border-border text-xs font-medium">
          <button
            onClick={() => setActiveTab("live")}
            className={cn(
              "apple-press px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5",
              activeTab === "live"
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Radio className="w-3.5 h-3.5 text-red-500" />
            <span>Active Broadcasts</span>
            {data.active.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-bold">
                {data.active.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("sos")}
            className={cn(
              "apple-press px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5",
              activeTab === "sos"
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>1-Tap SOS Reporting</span>
          </button>

          <button
            onClick={() => setActiveTab("hotlines")}
            className={cn(
              "apple-press px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5",
              activeTab === "hotlines"
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Phone className="w-3.5 h-3.5 text-emerald-500" />
            <span>Campus Hotlines</span>
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={cn(
              "apple-press px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5",
              activeTab === "reports"
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>Incident Registry</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted border border-border text-muted-foreground">
              {reports.length}
            </span>
          </button>

          {isStaffOrAdmin && (
            <button
              onClick={() => setActiveTab("dispatch")}
              className={cn(
                "apple-press px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 sm:ml-auto",
                activeTab === "dispatch"
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-semibold"
                  : "text-red-600/80 dark:text-red-400/80 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-500/10"
              )}
            >
              <Megaphone className="w-3.5 h-3.5 text-red-500" />
              <span>Broadcast Console (Admin)</span>
            </button>
          )}
        </div>

        {/* Tab 1: Live Active Broadcasts */}
        {activeTab === "live" && (
          <div className="space-y-4">
            {data.active.length === 0 ? (
              <div className="text-center py-16 bg-muted/30 rounded-xl border border-dashed border-border space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-semibold text-foreground">No active emergency alerts</p>
                <p className="text-xs text-muted-foreground">
                   No active CampusGram emergency alerts are currently recorded.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.active.map((alert) => {
                  const isCritical = alert.severity === "critical";
                  const isWarning = alert.severity === "warning";
                  const checkedStatus = checkedInAlerts[alert.id];

                  return (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-xl border p-5 space-y-4 transition-all",
                        isCritical
                          ? "bg-red-500/10 border-red-500/30 shadow-xs"
                          : isWarning
                          ? "bg-amber-500/10 border-amber-500/30"
                          : "bg-card border-border"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border",
                              isCritical
                                ? "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30"
                                : isWarning
                                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            )}
                          >
                            {alert.is_drill ? "DRILL EXERCISE" : alert.severity.toUpperCase()}
                          </span>

                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground capitalize">
                            Scope: {alert.scope.replace("_", " ")}
                          </span>

                          {alert.kind === "all_clear" && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                              ALL CLEAR
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {alert.sent_at
                              ? new Date(alert.sent_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Just now"}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <h2 className="text-base font-bold text-foreground">{alert.title}</h2>
                        <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                          {alert.body}
                        </p>
                      </div>

                      {/* Instructions & Assembly Point */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                        {alert.assembly_point && (
                          <div className="flex items-start gap-2 bg-background/80 p-3 rounded-lg border border-border">
                            <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                Designated Evacuation Assembly
                              </p>
                              <p className="text-foreground font-medium">{alert.assembly_point}</p>
                            </div>
                          </div>
                        )}

                        {alert.action_required && (
                          <div className="flex items-start gap-2 bg-background/80 p-3 rounded-lg border border-border">
                            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                Immediate Action Protocol
                              </p>
                              <p className="text-foreground font-medium">{alert.action_required}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Safety Check-in Strip */}
                      <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-medium text-foreground">
                            Personal Safety Status:
                          </span>
                          {checkedStatus ? (
                            <span
                              className={cn(
                                "text-[11px] font-mono px-2 py-0.5 rounded font-bold border",
                                checkedStatus === "safe"
                                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30"
                              )}
                            >
                              {checkedStatus === "safe" ? "Marked Safe" : "Assistance Requested"}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Not checked in</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCheckIn(alert.id, "safe")}
                            disabled={checkInLoading === alert.id || checkedStatus === "safe"}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-60 flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>I am Safe</span>
                          </button>

                          <button
                            onClick={() => handleCheckIn(alert.id, "need_help")}
                            disabled={checkInLoading === alert.id || checkedStatus === "need_help"}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-60 flex items-center gap-1.5"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Need Assistance</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: 1-Tap SOS Reporting */}
        {activeTab === "sos" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl space-y-1">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Priority 1 Emergency Report
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Use this channel exclusively for active threats, fires, medical trauma, or structural hazards. 
                 Reports are recorded for the campus demo. This interface does not dispatch real responders; call a listed hotline for immediate help.
              </p>
            </div>

            <form onSubmit={handleSosSubmit} className="space-y-4 bg-card p-5 rounded-xl border border-border">
              {/* Type Grid */}
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-foreground uppercase tracking-wider">
                  Incident Nature <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {EMERGENCY_TYPES.map((item) => {
                    const Icon = item.icon;
                    const isSelected = sosType === item.type;
                    return (
                      <button
                        type="button"
                        key={item.type}
                        onClick={() => setSosType(item.type)}
                        className={cn(
                          "p-3 rounded-lg border flex flex-col items-center justify-center gap-1.5 text-xs font-medium transition-all text-center",
                          isSelected
                            ? "bg-red-500/15 border-red-500 text-red-600 dark:text-red-400 shadow-xs ring-1 ring-red-500/30 font-semibold"
                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-input"
                        )}
                      >
                        <Icon className={cn("w-5 h-5", isSelected ? "text-red-500" : "text-muted-foreground")} />
                        <span>{item.label}</span>
                        {item.isP1 && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-red-500/20 text-red-600 dark:text-red-400">
                            P1 Rapid
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location Input */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-foreground uppercase tracking-wider">
                  Exact Location <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={sosLocation}
                  onChange={(e) => setSosLocation(e.target.value)}
                  placeholder="e.g. Science Complex Lab 304, or Hostel Block B Stairwell"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
              </div>

              {/* Description Input */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-foreground uppercase tracking-wider">
                  Situation Details <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={sosDescription}
                  onChange={(e) => setSosDescription(e.target.value)}
                  placeholder="Describe what happened, any injuries, visible smoke, or immediate dangers..."
                  className="w-full px-3 py-2 border border-input rounded-lg resize-none bg-background text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
              </div>

              {sosFeedback && (
                <div
                  className={cn(
                    "p-3 rounded-lg border text-xs flex items-center gap-2",
                    sosFeedback.ref
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/15 border-destructive/30 text-destructive"
                  )}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{sosFeedback.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={sosSubmitting || !sosLocation.trim() || !sosDescription.trim()}
                className="w-full py-3 rounded-lg font-bold text-xs bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-xs"
              >
                {sosSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                   <span>Recording SOS...</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4" />
                       <span>RECORD SOS REPORT</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Campus Emergency Hotlines */}
        {activeTab === "hotlines" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.hotlines.map((contact) => (
                <div
                  key={contact.id}
                  className="bg-card border border-border rounded-xl p-4 space-y-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded font-bold border",
                          contact.category === "Security"
                            ? "bg-muted text-foreground border-border"
                            : contact.category === "Medical"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : contact.category === "Fire"
                            ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                            : "bg-muted text-foreground border-border"
                        )}
                      >
                        {contact.category.toUpperCase()}
                      </span>

                      <span className="text-[10px] font-mono text-muted-foreground">
                        Ext: {contact.ext}
                      </span>
                    </div>

                    <h3 className="font-semibold text-foreground text-sm">{contact.name}</h3>

                    <div className="pt-2 space-y-1 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{contact.location}</span>
                      </p>
                      <p className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-mono">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{contact.availableHours}</span>
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {contact.phone}
                    </span>
                    <a
                      href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-muted hover:bg-accent text-foreground transition-colors flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3 text-emerald-500" />
                      <span>Call</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Broadcast Dispatch Console (Admin/Staff only) */}
        {activeTab === "dispatch" && isStaffOrAdmin && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-card p-5 rounded-xl border border-border space-y-4">
              <div className="border-b border-border pb-3">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-red-500" />
                  <span>Campus-Wide Alert Dispatch Console</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                   Record a campus broadcast and simulate the selected notification channels. No external SMS, push, or siren delivery is performed.
                </p>
              </div>

              <form onSubmit={handleBroadcastSubmit} className="space-y-4 text-xs">
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Broadcast Title <span className="text-destructive">*</span></label>
                  <input
                    required
                    type="text"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="e.g. FLASH STORM WARNING: North Corridor Trees Clearance"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                  />
                </div>

                {/* Message Body */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Alert Message Body <span className="text-destructive">*</span></label>
                  <textarea
                    required
                    rows={3}
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    placeholder="Full advisory or evacuation instruction for campus community..."
                    className="w-full px-3 py-2 border border-input rounded-lg resize-none bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Severity */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Severity Tier</label>
                    <select
                      value={broadcastSeverity}
                      onChange={(e) => setBroadcastSeverity(e.target.value as EmergencySeverity)}
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                    >
                      <option value="advisory">Advisory (Informative, Low Urgency)</option>
                      <option value="warning">Warning (Cautionary Action Required)</option>
                      <option value="critical">Critical (Immediate Evacuation / Danger)</option>
                    </select>
                  </div>

                  {/* Scope */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Target Audience Scope</label>
                    <select
                      value={broadcastScope}
                      onChange={(e) => setBroadcastScope(e.target.value as EmergencyScope)}
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                    >
                      <option value="campus_wide">Campus-Wide (All Registered Users)</option>
                      <option value="audience">Targeted Building / Department</option>
                      <option value="responders_only">Emergency Responders Only</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Assembly Point */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Evacuation Assembly Point</label>
                    <input
                      type="text"
                      value={broadcastAssembly}
                      onChange={(e) => setBroadcastAssembly(e.target.value)}
                      placeholder="e.g. Central Sports Field A"
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                    />
                  </div>

                  {/* Action Required */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Action Instruction</label>
                    <input
                      type="text"
                      value={broadcastAction}
                      onChange={(e) => setBroadcastAction(e.target.value)}
                      placeholder="e.g. Evacuate via West Stairwell immediately"
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                    />
                  </div>
                </div>

                {/* Multi-Channel Selection */}
                <div className="space-y-2 pt-1">
                  <label className="font-semibold text-foreground">Fan-Out Delivery Channels</label>
                  <div className="flex flex-wrap gap-2">
                    {(["in_app", "push", "sms", "siren"] as AlertChannel[]).map((ch) => {
                      const isSelected = selectedChannels.includes(ch);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => toggleChannel(ch)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border font-mono text-[11px] transition-colors",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                              : "bg-background text-muted-foreground border-border hover:text-foreground"
                          )}
                        >
                          {ch.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Drill toggle */}
                <div className="pt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="drillToggle"
                    checked={broadcastIsDrill}
                    onChange={(e) => setBroadcastIsDrill(e.target.checked)}
                    className="w-4 h-4 rounded bg-background border-input text-red-600 focus:ring-red-500 accent-red-600"
                  />
                  <label htmlFor="drillToggle" className="text-foreground font-medium cursor-pointer select-none">
                    Mark as Training / Routine Drill (appends DRILL badge)
                  </label>
                </div>

                {broadcastResult && (
                  <div className="p-3 bg-muted border border-border rounded-lg text-emerald-600 dark:text-emerald-400 text-xs font-mono">
                    {broadcastResult}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={broadcastSubmitting}
                  className="w-full py-2.5 rounded-lg font-bold text-xs bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center gap-2 shadow-xs"
                >
                  {broadcastSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                       <span>Recording Broadcast...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                       <span>RECORD CAMPUS BROADCAST</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 5: Recent Incident Registry */}
        {activeTab === "reports" && (
          <div className="space-y-3">
            {reports.length === 0 ? (
              <div className="text-center py-16 bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground space-y-2">
                <Layers className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                <p className="text-xs font-semibold text-foreground">No emergency incident logs</p>
                <p className="text-[11px] text-muted-foreground">
                  Transmitted SOS reports will be archived here.
                </p>
              </div>
            ) : (
              reports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-card border border-border rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded font-bold border",
                          rep.priority === 1
                            ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                            : rep.priority === 2
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            : "bg-muted text-foreground border-border"
                        )}
                      >
                        PRIORITY {rep.priority}
                      </span>

                      <span className="font-mono text-muted-foreground text-[11px]">
                        Ref: {rep.public_ref}
                      </span>

                      <span className="capitalize text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-muted text-muted-foreground">
                        {rep.type.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(rep.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <p className="text-xs text-foreground font-medium leading-relaxed whitespace-pre-wrap">
                    {rep.description}
                  </p>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span>{rep.location_name}</span>
                    </div>
                    <div>
                      <span>Status: </span>
                      <strong className="text-foreground uppercase">{rep.status}</strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
