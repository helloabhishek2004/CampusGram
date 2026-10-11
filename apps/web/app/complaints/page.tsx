"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
} from "@smart-campus/ui";
import {
  ComplaintRecord,
  ComplaintAttachment,
  ComplaintCategory,
  CreateComplaintResponse,
  ComplaintListResponse,
} from "@smart-campus/contracts";
import {
  AlertTriangle,
  CheckCircle2,
  Upload,
  X,
  RefreshCw,
  Clock,
  Layers,
  ArrowLeft,
  Flame,
  FileText,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@smart-campus/utils";
import { complaintGroupCounts } from "@/lib/complaints/group-counts";

export default function ComplaintsPage() {
  // Form State
  const [complaintText, setComplaintText] = useState("");
  const [category, setCategory] = useState<ComplaintCategory>("infrastructure");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{
    message: string;
    isEmergency: boolean;
    groupCount: number;
    clusterId: string;
  } | null>(null);

  // Feed State
  const [activeTab, setActiveTab] = useState<"all" | "normal" | "emergency">("all");
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [counts, setCounts] = useState({ total: 0, normal: 0, emergency: 0 });
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [canManageComplaints, setCanManageComplaints] = useState(false);
  const [responseNotes, setResponseNotes] = useState<Record<string, string>>({});
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  // Modal State
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<{
    clusterId: string;
    items: ComplaintRecord[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchComplaintsSeq = useRef(0);

  // Keyboard Escape listener to dismiss open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedImage) {
          setExpandedImage(null);
        } else if (selectedCluster) {
          setSelectedCluster(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedImage, selectedCluster]);

  // Load complaints with in-flight race condition protection
  const fetchComplaints = async (view: "all" | "normal" | "emergency") => {
    const currentSeq = ++fetchComplaintsSeq.current;
    setIsLoadingFeed(true);
    setFeedError(null);
    try {
      const res = await fetch(`/api/complaints?view=${view}`);
      const data: ComplaintListResponse = await res.json();
      if (currentSeq === fetchComplaintsSeq.current) {
        if (data.success) {
          setComplaints(data.complaints);
          setCounts(data.counts);
        } else {
          setFeedError(data.error?.message || "Failed to load complaints");
        }
      }
    } catch (err) {
      if (currentSeq === fetchComplaintsSeq.current) {
        setFeedError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      if (currentSeq === fetchComplaintsSeq.current) {
        setIsLoadingFeed(false);
      }
    }
  };

  useEffect(() => {
    fetchComplaints(activeTab);
  }, [activeTab]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        const profile = data?.profile;
        setCanManageComplaints(Boolean(
          profile &&
            (["admin", "faculty", "staff"].includes(profile.role) ||
              profile.tags?.some((tag: string) =>
                ["HOD", "DEPARTMENT_COORDINATOR"].includes(tag),
              )),
        ));
      })
      .catch(() => setCanManageComplaints(false));
  }, []);

  const updateComplaint = async (complaintId: string, status: string) => {
    setTransitioningId(complaintId);
    setFeedError(null);
    try {
      const response = await fetch(`/api/complaints/${complaintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          response_note: responseNotes[complaintId]?.trim() || undefined,
          take_ownership: true,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Unable to update complaint");
      }
      setResponseNotes((current) => ({ ...current, [complaintId]: "" }));
      await fetchComplaints(activeTab);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Unable to update complaint");
    } finally {
      setTransitioningId(null);
    }
  };

  // Group emergency complaints into unique clusters
  const emergencyClusters = useMemo(() => {
    const map = new Map<string, ComplaintRecord[]>();
    for (const c of complaints) {
      if (c.is_emergency) {
        const list = map.get(c.cluster_id) || [];
        list.push(c);
        map.set(c.cluster_id, list);
      }
    }

    return Array.from(map.entries()).map(([clusterId, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latest = sorted[0];

      // Find first available thumbnail among all attachments
      let thumbnail: string | null = null;
      for (const item of items) {
        if (item.attachments && item.attachments.length > 0) {
          thumbnail = item.attachments[0].url;
          break;
        }
      }

      return {
        clusterId,
        ...complaintGroupCounts(items),
        category: latest.category,
        latestDate: latest.created_at,
        latestReport: latest,
        items: sorted,
        thumbnailUrl: thumbnail,
      };
    });
  }, [complaints]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setFormError("Only JPG, PNG, WebP, and GIF images are allowed.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError("Image must not exceed 5 MB.");
      return;
    }

    setFormError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitSuccess(null);

    const trimmed = complaintText.trim();
    if (trimmed.length < 5) {
      setFormError("Complaint text must be at least 5 characters long.");
      return;
    }

    setIsSubmitting(true);

    try {
      const attachments: ComplaintAttachment[] = [];

      // 1. Upload image if selected
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const uploadRes = await fetch("/api/complaints/upload", {
          method: "POST",
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error?.message || "Failed to upload image attachment");
        }

        attachments.push(uploadData.attachment);
      }

      // 2. Submit complaint with text (similarity pipeline uses text)
      const submitRes = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          category,
          attachments,
        }),
      });

      const submitData: CreateComplaintResponse = await submitRes.json();

      if (!submitRes.ok || !submitData.success || !submitData.complaint) {
        throw new Error(submitData.error?.message || "Failed to register complaint");
      }

      const clusterInfo = submitData.cluster || {
        cluster_id: submitData.complaint.cluster_id,
        group_count: submitData.complaint.similar_count,
        is_emergency: submitData.complaint.is_emergency,
      };

      setSubmitSuccess({
        message: "Your complaint has been recorded and grouped using deterministic text similarity.",
        isEmergency: clusterInfo.is_emergency,
        groupCount: clusterInfo.group_count,
        clusterId: clusterInfo.cluster_id,
      });

      setComplaintText("");
      handleRemoveImage();
      fetchComplaints(activeTab);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Submission error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

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
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-border bg-secondary text-secondary-foreground font-semibold tracking-wider">
                Module 2
              </span>
              <span className="text-xs text-muted-foreground font-mono">Grievance Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Campus Complaints System</span>
              <FileText className="w-5 h-5 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Deterministic text grouping with cluster-volume escalation. The standalone
              intelligence analyzer is not invoked by this submission path.
              Clusters with 5 or more corroborating reports escalate to Emergency automatically.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/emergency"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Life-Safety SOS</span>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchComplaints(activeTab)}
              disabled={isLoadingFeed}
              className="flex items-center gap-1.5 border-border bg-card text-foreground hover:bg-muted"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoadingFeed && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Complaint Submission Form (5 cols) */}
          <div className="lg:col-span-5">
            <Card className="sticky top-20 border-border bg-card shadow-sm text-card-foreground">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-sm font-semibold text-foreground">
                    File a New Grievance
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Describe your campus issue. Similarity is computed strictly from text representation.
                </CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  {/* Text Area */}
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground uppercase tracking-wider mb-1.5">
                      Issue Description <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-input bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring min-h-[105px] break-words whitespace-pre-wrap"
                      placeholder="e.g. Water is not available in hostel block A since morning. Pressure pump seems damaged..."
                      value={complaintText}
                      onChange={(e) => setComplaintText(e.target.value)}
                      disabled={isSubmitting}
                    />
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1 font-mono">
                      <span>Min 5 characters</span>
                      <span>{complaintText.length} chars</span>
                    </div>
                  </div>

                  {/* Category Selection */}
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <select
                      className="w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                      disabled={isSubmitting}
                    >
                      <option value="infrastructure">Infrastructure & Maintenance</option>
                      <option value="hostel">Hostel & Living</option>
                      <option value="sanitation">Sanitation & Water</option>
                      <option value="it_services">Campus IT & Network</option>
                      <option value="academic">Academic & Classroom</option>
                      <option value="security">Campus Security & Safety</option>
                      <option value="administration">Administration</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Image Attachment */}
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground uppercase tracking-wider mb-1.5">
                      Attachment (Optional Photo)
                    </label>

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isSubmitting}
                    />

                    {!previewUrl ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSubmitting}
                        className="w-full border border-dashed border-border hover:border-border/80 rounded-lg p-3.5 flex flex-col items-center justify-center gap-1.5 bg-muted/20 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium">Attach Photo (max 5 MB)</span>
                        <span className="text-[10px] text-muted-foreground">JPG, PNG, WebP only</span>
                      </button>
                    ) : (
                      <div className="relative border border-border rounded-lg p-2 bg-muted/30">
                        <div className="relative h-32 w-full overflow-hidden rounded bg-muted flex items-center justify-center">
                          <Image
                            src={previewUrl}
                            alt="Attachment preview"
                            fill
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2 px-1">
                          <span className="text-xs text-foreground truncate max-w-[180px]">
                            {selectedFile?.name}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="text-destructive hover:text-destructive/80 text-xs flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Form Error */}
                  {formError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* Submission Feedback */}
                  {submitSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>{submitSuccess.message}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={cn(
                            "text-[10px] font-mono px-2 py-0.5 rounded font-semibold",
                            submitSuccess.isEmergency
                              ? "bg-destructive/20 text-destructive border border-destructive/30"
                              : "bg-secondary text-secondary-foreground"
                          )}
                        >
                          {submitSuccess.isEmergency ? "Escalated to Emergency" : "Normal Priority"}
                        </span>
                        <span className="text-muted-foreground text-[11px]">
                          Cluster count: <strong>{submitSuccess.groupCount}</strong> reports
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || complaintText.trim().length < 5}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs py-2 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Grouping by text similarity...
                      </>
                    ) : (
                      "Submit Grievance"
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          {/* Right Column: Feed & Views (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 p-2 rounded-xl border border-border">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                    activeTab === "all"
                      ? "bg-card text-foreground font-semibold shadow-xs border border-border/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  All Grievances
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary border border-border text-foreground">
                    {counts.total}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("normal")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                    activeTab === "normal"
                      ? "bg-card text-foreground font-semibold shadow-xs border border-border/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  Normal
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary border border-border text-foreground">
                    {counts.normal}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("emergency")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                    activeTab === "emergency"
                      ? "bg-destructive/15 border border-destructive/30 text-destructive font-semibold"
                      : "text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                  )}
                >
                  <Flame className="w-3.5 h-3.5" />
                  Emergency (&ge; 5)
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-destructive/20 text-destructive border border-destructive/30">
                    {counts.emergency}
                  </span>
                </button>
              </div>

              <div className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
                Threshold: &ge; 5
              </div>
            </div>

            {/* Emergency Alert Banner */}
            {counts.emergency > 0 && activeTab !== "normal" && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2.5 text-xs text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold text-destructive">Active High-Volume Escalations!</strong>
                  <p className="text-destructive/80 text-[11px] mt-0.5">
                    Issues reported by 5 or more distinct members have auto-escalated to Emergency status for expedited dispatch.
                  </p>
                </div>
              </div>
            )}

            {/* Error state */}
            {feedError && (
              <div className="p-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{feedError}</span>
              </div>
            )}

            {/* List */}
            {isLoadingFeed ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-xs">Loading grievance records...</span>
              </div>
            ) : activeTab === "emergency" ? (
              /* Emergency View */
              emergencyClusters.length === 0 ? (
                <div className="p-10 text-center bg-card/40 rounded-xl border border-dashed border-border text-muted-foreground space-y-2">
                  <Layers className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                  <p className="text-xs font-semibold text-foreground">No active emergency clusters</p>
                  <p className="text-[11px] text-muted-foreground">
                    No similarity groups have met the 5-complaint threshold yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emergencyClusters.map((cluster) => (
                    <Card
                      key={cluster.clusterId}
                      className="border-destructive/30 bg-destructive/5 rounded-xl transition-colors hover:border-destructive/50 text-card-foreground"
                    >
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-destructive/20 text-destructive border border-destructive/30">
                              <Flame className="w-3 h-3 text-destructive" /> EMERGENCY CLUSTER
                            </span>

                            <span className="capitalize text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-secondary text-secondary-foreground">
                              {cluster.category?.replace("_", " ") || "General"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span>Latest: {formatDate(cluster.latestDate)}</span>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3 text-xs">
                        <p className="text-foreground font-medium leading-relaxed break-words whitespace-pre-wrap">
                          {cluster.latestReport.text}
                        </p>

                        {cluster.thumbnailUrl && (
                          <div className="pt-1">
                            <div
                              onClick={() => setExpandedImage(cluster.thumbnailUrl || null)}
                              className="group relative h-20 w-28 rounded-lg overflow-hidden border border-border bg-muted cursor-pointer hover:opacity-90"
                            >
                              <Image
                                src={cluster.thumbnailUrl}
                                alt={cluster.category ? `Evidence photo for ${cluster.category.replace("_", " ")} cluster` : "Complaint cluster evidence thumbnail"}
                                fill
                                unoptimized
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium">
                                View
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="pt-2 border-t border-border/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground text-[11px]">Cluster ID:</span>
                          <span className="font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded text-[10px] border border-border">
                            {cluster.clusterId.substring(0, 14)}...
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-destructive/20 text-destructive border border-destructive/30 font-mono">
                            {cluster.globalCount} matching reports
                          </span>

                          <button
                            onClick={() => setSelectedCluster({ clusterId: cluster.clusterId, items: cluster.items })}
                            className="text-xs px-2.5 py-1 rounded-lg text-destructive border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 transition-colors font-medium"
                          >
                            Inspect Group ({cluster.visibleCount} visible) &rarr;
                          </button>
                        </div>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )
            ) : (
              /* All or Normal View */
              complaints.length === 0 ? (
                <div className="p-10 text-center bg-card/40 rounded-xl border border-dashed border-border text-muted-foreground space-y-2">
                  <Layers className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                  <p className="text-xs font-semibold text-foreground">
                    {activeTab === "normal"
                      ? "No normal complaints currently."
                      : "No complaints have been reported yet."}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Use the form on the left to submit a grievance.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {complaints.map((item) => {
                    const isEmergency = item.is_emergency;

                    return (
                      <Card
                        key={item.id}
                        className={cn(
                          "rounded-xl transition-colors text-card-foreground",
                          isEmergency
                            ? "border-destructive/30 bg-destructive/5"
                            : "border-border bg-card hover:border-border/80"
                        )}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {isEmergency ? (
                                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-destructive/20 text-destructive border border-destructive/30">
                                  <Flame className="w-3 h-3 text-destructive" /> EMERGENCY
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">
                                  Standard
                                </span>
                              )}

                            <span className="capitalize text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-secondary text-secondary-foreground">
                              {item.category?.replace("_", " ") || "General"}
                            </span>
                            <span className="capitalize text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-secondary text-secondary-foreground">
                              {item.status.replace("_", " ")}
                            </span>
                            </div>

                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span>{formatDate(item.created_at)}</span>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 text-xs">
                          <p className="text-foreground font-medium leading-relaxed break-words whitespace-pre-wrap">
                            {item.text}
                          </p>

                          {item.attachments && item.attachments.length > 0 && (
                            <div className="flex items-center gap-2 pt-1">
                              {item.attachments.map((att, idx) => (
                                <div
                                  key={att.id || idx}
                                  onClick={() => setExpandedImage(att.url)}
                                  className="group relative h-16 w-24 rounded-lg overflow-hidden border border-border bg-muted cursor-pointer hover:opacity-90"
                                >
                                  <Image
                                    src={att.url}
                                    alt={att.filename || "Attachment"}
                                    fill
                                    unoptimized
                                    className="h-full w-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px]">
                                    View
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {item.response_note && (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                              <span className="font-semibold">Official response: </span>
                              {item.response_note}
                            </div>
                          )}
                        </CardContent>

                        <CardFooter className="pt-2 border-t border-border/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground text-[11px]">Cluster:</span>
                            <span className="font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded text-[10px] border border-border">
                              {item.cluster_id.substring(0, 14)}...
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-mono text-[10px] px-2 py-0.5 rounded font-medium",
                                isEmergency
                                  ? "bg-destructive/20 text-destructive border border-destructive/30"
                                  : "bg-secondary text-secondary-foreground"
                              )}
                            >
                              {item.similar_count} {item.similar_count === 1 ? "report" : "similar reports"}
                            </span>

                            {isEmergency && item.similar_count >= 5 && (
                              <button
                                onClick={() => {
                                  const clusterItems = complaints.filter(
                                    (c) => c.cluster_id === item.cluster_id
                                  );
                                  setSelectedCluster({
                                    clusterId: item.cluster_id,
                                    items: clusterItems.length > 0 ? clusterItems : [item],
                                  });
                                }}
                                className="text-xs px-2.5 py-1 rounded-lg text-destructive border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 transition-colors font-medium"
                              >
                                View cluster &rarr;
                              </button>
                            )}
                          </div>

                          {canManageComplaints && (
                            <div className="w-full mt-2 flex flex-col sm:flex-row gap-2 sm:items-end">
                              <label className="flex-1 text-[10px] text-muted-foreground">
                                Response / resolution note
                                <textarea
                                  value={responseNotes[item.id] || ""}
                                  onChange={(event) =>
                                    setResponseNotes((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full min-h-10 rounded border border-input bg-background p-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                  placeholder="Required for resolved or rejected"
                                />
                              </label>
                              <div className="flex gap-2">
                                <select
                                  defaultValue={item.status}
                                  className="rounded border border-input bg-background px-2 py-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                  id={`status-${item.id}`}
                                >
                                  <option value="under_review">Under review</option>
                                  <option value="in_progress">In progress</option>
                                  <option value="resolved">Resolved</option>
                                  <option value="rejected">Rejected</option>
                                </select>
                                <button
                                  type="button"
                                  disabled={transitioningId === item.id}
                                  onClick={() => {
                                    const select = document.getElementById(`status-${item.id}`) as HTMLSelectElement | null;
                                    if (select) void updateComplaint(item.id, select.value);
                                  }}
                                  className="rounded border border-border bg-secondary hover:bg-muted px-2.5 py-2 text-[11px] font-medium text-foreground transition-colors disabled:opacity-50"
                                >
                                  {transitioningId === item.id ? "Saving..." : "Update"}
                                </button>
                              </div>
                            </div>
                          )}
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>

        {/* Cluster Detail Modal */}
        {selectedCluster && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cluster-dialog-title"
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
            onClick={() => setSelectedCluster(null)}
          >
            <div
              className="relative max-w-2xl w-full max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-card-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border p-4 bg-muted/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-destructive/20 text-destructive border border-destructive/30">
                      <Flame className="w-3 h-3 text-destructive" /> EMERGENCY CLUSTER
                    </span>
                    <h3 id="cluster-dialog-title" className="font-semibold text-foreground text-sm">
                      {selectedCluster.items.length} Reports Visible to You
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
                    Cluster ID: {selectedCluster.clusterId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCluster(null)}
                  className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto p-4 space-y-3">
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    Only reports you are permitted to view are shown below. The matching-report badge reflects the global group count.
                  </span>
                </div>

                {selectedCluster.items.map((report, idx) => (
                  <div
                    key={report.id || idx}
                    className="p-3 rounded-lg border border-border/80 bg-muted/30 space-y-2 text-card-foreground"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground font-semibold">#{idx + 1}</span>
                        <span className="capitalize text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-secondary text-secondary-foreground">
                          {report.category?.replace("_", " ") || "General"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground text-[11px] font-mono">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span>{formatDate(report.created_at)}</span>
                      </div>
                    </div>

                    <p className="text-foreground text-xs font-medium leading-relaxed break-words whitespace-pre-wrap">
                      {report.text}
                    </p>

                    {report.attachments && report.attachments.length > 0 && (
                      <div className="flex items-center gap-2 pt-1">
                        {report.attachments.map((att, attIdx) => (
                          <div
                            key={att.id || attIdx}
                            onClick={() => setExpandedImage(att.url)}
                            className="group relative h-16 w-24 rounded-lg border border-border bg-muted overflow-hidden cursor-pointer"
                          >
                            <Image
                              src={att.url}
                              alt={att.filename || "Attachment"}
                              fill
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px]">
                              View
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="p-3 border-t border-border bg-muted/40 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedCluster(null)}
                  className="border-border text-foreground hover:bg-muted text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Enlarged Image Modal */}
        {expandedImage && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged attachment"
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs"
            onClick={() => setExpandedImage(null)}
          >
            <div
              className="relative max-w-3xl max-h-[85vh] bg-card border border-border rounded-xl overflow-hidden p-2 shadow-2xl text-card-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-3 right-3 bg-secondary/80 hover:bg-secondary text-foreground p-1.5 rounded-full z-10 transition-colors"
                aria-label="Close image preview"
              >
                <X className="w-4 h-4" />
              </button>
              <Image
                src={expandedImage}
                alt="Enlarged view of complaint evidence attachment"
                width={1200}
                height={800}
                unoptimized
                className="max-h-[80vh] max-w-full h-auto w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
