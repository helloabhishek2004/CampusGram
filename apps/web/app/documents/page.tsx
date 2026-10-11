"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentCard } from "@/components/documents/document-card";
import { DocumentModal } from "@/components/documents/document-modal";
import { DocumentUploadDialog } from "@/components/documents/document-upload-dialog";
import { CampusDocument, AcademicDocument } from "@smart-campus/contracts";
import { documentsClientService } from "@/lib/services/documents-client-service";
import { facultyAcademicClientService } from "@/lib/services/faculty-academic-client-service";
import { AcademicDocCard } from "@/components/faculty/academic-doc-card";
import { AcademicDocDetailDialog } from "@/components/faculty/academic-doc-detail-dialog";
import { Search, FileText, Upload, Loader2, RefreshCw, BookOpen, UserCheck } from "lucide-react";
import { cn } from "@smart-campus/utils";

export default function DocumentsPage() {
  const [activeSection, setActiveSection] = useState<"credentials" | "notices">("credentials");

  // Personal Documents State
  const [filter, setFilter] = useState<"all" | "academic" | "non-academic">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<CampusDocument | null>(null);
  const [documents, setDocuments] = useState<CampusDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Academic Notices State
  const [academicNotices, setAcademicNotices] = useState<AcademicDocument[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<AcademicDocument | null>(null);
  const [noticeDetailOpen, setNoticeDetailOpen] = useState(false);
  const [unreadNoticesCount, setUnreadNoticesCount] = useState(0);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await documentsClientService.getDocuments({
        category: filter,
        query: searchQuery,
      });
      setDocuments(data);
    } catch (_err) {
      // Handled gracefully in client service
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery]);

  const fetchNotices = useCallback(async () => {
    setLoadingNotices(true);
    try {
      const res = await facultyAcademicClientService.getDocuments({
        tab: "received",
        limit: 20,
      });
      setAcademicNotices(res.items);
      if (res.unreadCount !== undefined) {
        setUnreadNoticesCount(res.unreadCount);
      }
    } catch (err) {
      console.error("Failed to load academic notices:", err);
    } finally {
      setLoadingNotices(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchNotices();
  }, [fetchDocuments, fetchNotices]);

  const handleUploadSuccess = (newDoc: CampusDocument) => {
    setDocuments((prev) => [newDoc, ...prev]);
    setSelectedDoc(newDoc);
  };

  const handleSelectNotice = (notice: AcademicDocument) => {
    setSelectedNotice(notice);
    setNoticeDetailOpen(true);
  };

  const handleNoticeUpdated = (updatedNotice: AcademicDocument) => {
    setSelectedNotice(updatedNotice);
    setAcademicNotices((prev) =>
      prev.map((n) => (n.id === updatedNotice.id ? updatedNotice : n))
    );
    setUnreadNoticesCount((prev) => Math.max(0, prev - 1));
  };

  const academicCount = documents.filter((d) => d.category === "academic").length;
  const nonAcademicCount = documents.filter((d) => d.category === "non-academic").length;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <header className="border-b border-border pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-950 border border-border shadow-sm shrink-0">
                <Image
                  src="/assets/campus_gram_icon.svg"
                  alt="CampusGram"
                  width={44}
                  height={44}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Documents & Academic Records
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Access official university credentials, student certificates, and class notices.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  fetchDocuments();
                  fetchNotices();
                }}
                title="Refresh Documents"
                className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Refresh documents list"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", (loading || loadingNotices) && "animate-spin text-foreground")} />
              </button>

              {activeSection === "credentials" && (
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Document</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Section Switcher: Personal Credentials vs Academic Notices */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setActiveSection("credentials")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2",
              activeSection === "credentials"
                ? "bg-card text-foreground border border-border shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
            )}
          >
            <UserCheck className="w-4 h-4 text-emerald-500" />
            My Credentials & Records ({documents.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("notices")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2",
              activeSection === "notices"
                ? "bg-card text-foreground border border-border shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
            )}
          >
            <BookOpen className="w-4 h-4 text-blue-500" />
            Official Academic Notices
            {unreadNoticesCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                {unreadNoticesCount}
              </span>
            )}
          </button>
        </div>

        {activeSection === "credentials" ? (
          <>
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, reference, or description..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                />
              </div>

              {/* Segmented Filter Control */}
              <div
                role="tablist"
                className="inline-flex p-1 rounded-lg bg-muted/60 border border-border self-start sm:self-auto select-none"
              >
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    filter === "all"
                      ? "bg-card text-foreground shadow-xs border border-border/40 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All ({documents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("academic")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    filter === "academic"
                      ? "bg-card text-foreground shadow-xs border border-border/40 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Academic ({academicCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("non-academic")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    filter === "non-academic"
                      ? "bg-card text-foreground shadow-xs border border-border/40 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Non-Academic ({nonAcademicCount})
                </button>
              </div>
            </div>

            {/* Documents Grid / States */}
            {loading && documents.length === 0 ? (
              <div className="py-16 text-center rounded-xl border border-border bg-card/40 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">Loading documents from institutional directory...</p>
              </div>
            ) : documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {documents.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} onView={setSelectedDoc} />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center rounded-xl border border-border bg-card/40 space-y-2">
                <FileText className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                <h4 className="text-sm font-medium text-foreground">No documents found</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  No official documents matched your query. Try clearing your filter or uploading a new document.
                </p>
              </div>
            )}
          </>
        ) : (
          /* Official Academic Notices Section */
          <div className="space-y-4">
            {loadingNotices ? (
              <div className="py-16 text-center rounded-xl border border-border bg-card/40 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">Loading assigned academic notices & circulars...</p>
              </div>
            ) : academicNotices.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {academicNotices.map((notice) => (
                  <AcademicDocCard
                    key={notice.id}
                    document={notice}
                    viewMode="received"
                    onSelect={handleSelectNotice}
                  />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center rounded-xl border border-border bg-card/40 space-y-2">
                <BookOpen className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                <h4 className="text-sm font-medium text-foreground">No academic notices received</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  There are currently no circulars or notices published for your enrolled class or department.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Modal for Personal Document */}
        <DocumentModal document={selectedDoc} onClose={() => setSelectedDoc(null)} />

        {/* Modal for Academic Notice */}
        <AcademicDocDetailDialog
          document={selectedNotice}
          isOpen={noticeDetailOpen}
          onClose={() => setNoticeDetailOpen(false)}
          onDocumentUpdated={handleNoticeUpdated}
          isSentView={false}
        />

        {/* Upload Dialog */}
        <DocumentUploadDialog
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      </div>
    </AppShell>
  );
}
