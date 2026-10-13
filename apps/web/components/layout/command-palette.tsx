"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Home,
  FileText,
  AlertCircle,
  PackageSearch,
  ShieldAlert,
  GraduationCap,
  User,
  Settings,
  PlusCircle,
  PhoneCall,
  CheckCircle2,
  SlidersHorizontal,
  FolderGit2,
  Radio,
  Lock,
  ArrowRight,
  Command,
  HelpCircle,
  Info,
  Shield,
  Scale,
} from "lucide-react";

export interface CommandItem {
  id: string;
  title: string;
  description: string;
  category: "Navigation" | "Module 2 (Complaints)" | "Module 3 (Lost & Found)" | "Module 4 (Emergency)" | "Quick Actions";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  badge?: string;
  badgeColor?: string;
  keywords?: string[];
  action?: () => void;
}

const COMMAND_ITEMS: CommandItem[] = [
  // Navigation
  {
    id: "nav-home",
    title: "Campus Feed",
    description: "Verified institutional posts, departmental announcements, and campus updates",
    category: "Navigation",
    href: "/home",
    icon: Home,
    shortcut: "G H",
    keywords: ["home", "feed", "posts", "announcements", "campusgram"],
  },
  {
    id: "nav-docs",
    title: "Document Vault",
    description: "Academic files, syllabus, past questions, and course materials",
    category: "Navigation",
    href: "/documents",
    icon: FileText,
    shortcut: "G D",
    keywords: ["documents", "vault", "pdf", "notes", "materials", "syllabus"],
  },
  {
    id: "nav-complaints",
    title: "Complaint Intelligence",
    description: "AI-classified institutional complaints, severity scoring, and clustering",
    category: "Navigation",
    href: "/complaints",
    icon: AlertCircle,
    shortcut: "G C",
    badge: "M2 AI",
    badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    keywords: ["complaints", "issues", "maintenance", "wifi", "hostel", "cluster"],
  },
  {
    id: "nav-lost-found",
    title: "Lost & Found Intelligence",
    description: "Multimodal item matching, custodial registry, and private mark verification",
    category: "Navigation",
    href: "/lost-and-found",
    icon: PackageSearch,
    shortcut: "G L",
    badge: "M3 L&F",
    badgeColor: "text-zinc-300 bg-zinc-800/80 border-zinc-700",
    keywords: ["lost", "found", "items", "keys", "wallet", "laptop", "matching"],
  },
  {
    id: "nav-emergency",
    title: "Emergency Alert Center",
    description: "1-Tap SOS, life-safety broadcasts, hotlines, and instant safety check-ins",
    category: "Navigation",
    href: "/emergency",
    icon: ShieldAlert,
    shortcut: "G E",
    badge: "M4 SOS",
    badgeColor: "text-red-400 bg-red-500/10 border-red-500/20",
    keywords: ["emergency", "sos", "alert", "fire", "medical", "safety", "broadcast", "hotline"],
  },
  {
    id: "nav-faculty",
    title: "Faculty & Academic Portal",
    description: "Course coordinators, HOD circulars, and departmental notices",
    category: "Navigation",
    href: "/faculty",
    icon: GraduationCap,
    shortcut: "G F",
    keywords: ["faculty", "hod", "coordinator", "attendance", "circular"],
  },
  {
    id: "nav-profile",
    title: "My Profile",
    description: "Institutional identity, bio-data, roll number, and assigned tags",
    category: "Navigation",
    href: "/profile",
    icon: User,
    keywords: ["profile", "account", "identity", "biodata", "student", "roll"],
  },
  {
    id: "nav-settings",
    title: "System Settings",
    description: "Appearance, notification preferences, and session controls",
    category: "Navigation",
    href: "/settings",
    icon: Settings,
    keywords: ["settings", "preferences", "config", "session"],
  },
  {
    id: "nav-help",
    title: "Help & Support",
    description: "Operational guides, module walkthroughs, FAQs, and emergency hotlines",
    category: "Navigation",
    href: "/help",
    icon: HelpCircle,
    shortcut: "G ?",
    keywords: ["help", "support", "faq", "guide", "troubleshooting", "hotline", "assistance"],
  },
  {
    id: "nav-about",
    title: "About CampusGram",
    description: "Architecture, mission, engineering principles, and core pillars",
    category: "Navigation",
    href: "/about",
    icon: Info,
    shortcut: "G I",
    keywords: ["about", "campusgram", "platform", "version", "architecture", "overview"],
  },
  {
    id: "nav-privacy",
    title: "Privacy Policy",
    description: "Institutional identity protection, phone masking, and data handling rules",
    category: "Navigation",
    href: "/privacy",
    icon: Shield,
    keywords: ["privacy", "policy", "security", "gdpr", "masking", "biodata", "confidentiality"],
  },
  {
    id: "nav-terms",
    title: "Terms of Service",
    description: "Acceptable use guidelines, account responsibilities, and abuse prohibition",
    category: "Navigation",
    href: "/terms",
    icon: Scale,
    keywords: ["terms", "service", "acceptable use", "rules", "conduct", "abuse"],
  },

  // Module 2 Quick Actions
  {
    id: "action-new-complaint",
    title: "File an Institutional Complaint",
    description: "AI automatically categorizes department, location, and severity tier",
    category: "Module 2 (Complaints)",
    href: "/complaints",
    icon: PlusCircle,
    badge: "File M2",
    badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    keywords: ["file complaint", "report issue", "broken", "leak", "cleanliness", "infrastructure"],
  },
  {
    id: "action-clusters",
    title: "Inspect Complaint Clusters",
    description: "Review recurring campus-wide issues grouping 5+ similar reports",
    category: "Module 2 (Complaints)",
    href: "/complaints",
    icon: SlidersHorizontal,
    badge: "Clusters",
    badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    keywords: ["clusters", "duplicates", "grouping", "recurrence"],
  },

  // Module 3 Quick Actions
  {
    id: "action-report-lost",
    title: "Report Lost Item",
    description: "Submit item details with private marks kept confidential from search",
    category: "Module 3 (Lost & Found)",
    href: "/lost-and-found/report/lost",
    icon: PackageSearch,
    badge: "Report Lost",
    badgeColor: "text-zinc-300 bg-zinc-800/80 border-zinc-700",
    keywords: ["report lost", "lost keys", "lost id", "lost phone"],
  },
  {
    id: "action-report-found",
    title: "Report Found Item",
    description: "Deposit details and specify custody handover location at Security Desk",
    category: "Module 3 (Lost & Found)",
    href: "/lost-and-found/report/found",
    icon: PlusCircle,
    badge: "Report Found",
    badgeColor: "text-zinc-300 bg-zinc-800/80 border-zinc-700",
    keywords: ["report found", "found keys", "found card", "found bag"],
  },
  {
    id: "action-browse-items",
    title: "Browse Lost & Found Catalog",
    description: "Search open campus catalog with masked serial numbers and photos",
    category: "Module 3 (Lost & Found)",
    href: "/lost-and-found/browse",
    icon: Search,
    keywords: ["browse catalog", "search lost", "inventory"],
  },
  {
    id: "action-my-items",
    title: "My Items & Match Candidates",
    description: "Monitor AI similarity scores, pending claims, and custody verification",
    category: "Module 3 (Lost & Found)",
    href: "/lost-and-found/my-reports",
    icon: FolderGit2,
    badge: "My Claims",
    badgeColor: "text-zinc-300 bg-zinc-800/80 border-zinc-700",
    keywords: ["my items", "my reports", "my matches", "claims"],
  },
  {
    id: "action-admin-custody",
    title: "Security Desk Custody Console",
    description: "Staff audit log, verified claims, and manual match triggers",
    category: "Module 3 (Lost & Found)",
    href: "/lost-and-found/admin",
    icon: Lock,
    badge: "Staff Desk",
    badgeColor: "text-zinc-400 bg-zinc-800 border-zinc-700",
    keywords: ["security desk", "custody", "handover", "admin", "audit"],
  },

  // Module 4 Quick Actions
  {
    id: "action-emergency-sos",
    title: "Trigger 1-Tap SOS Incident",
    description: "Send immediate life-safety alert with GPS location to campus dispatch",
    category: "Module 4 (Emergency)",
    href: "/emergency",
    icon: ShieldAlert,
    badge: "P1 Critical",
    badgeColor: "text-red-400 bg-red-500/10 border-red-500/20",
    keywords: ["sos", "help", "panic", "danger", "incident", "threat", "accident"],
  },
  {
    id: "action-check-in",
    title: "Safety Check-In",
    description: "Mark your status as SAFE or REQUEST_HELP during active alerts",
    category: "Module 4 (Emergency)",
    href: "/emergency",
    icon: CheckCircle2,
    badge: "Check-in",
    badgeColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    keywords: ["check in", "mark safe", "safety status", "i am safe"],
  },
  {
    id: "action-hotlines",
    title: "Campus 24/7 Hotlines",
    description: "Quick dial security control, ambulance, fire post, and women helpline",
    category: "Module 4 (Emergency)",
    href: "/emergency",
    icon: PhoneCall,
    badge: "Hotlines",
    badgeColor: "text-zinc-300 bg-zinc-800/80 border-zinc-700",
    keywords: ["call", "phone", "hotline", "ambulance", "security", "police", "control room"],
  },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input whenever opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter commands by query
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return COMMAND_ITEMS;

    return COMMAND_ITEMS.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchCat = item.category.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(q));
      return matchTitle || matchDesc || matchCat || matchKeywords;
    });
  }, [query]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  const executeCommand = React.useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [onClose, router]
  );

  // Handle keyboard navigation inside the palette
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, filteredItems.length - 1)));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        if (selected) {
          executeCommand(selected);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, executeCommand, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/70 backdrop-blur-md transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Spotlight Command Palette"
    >
      <div
        className="w-full max-w-xl bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.06)] rounded-2xl overflow-hidden animate-apple-dropdown select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spotlight Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-zinc-800/80 gap-3">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campus modules, SOS, complaints, items... (⌘K)"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-normal"
            autoComplete="off"
            spellCheck="false"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded bg-zinc-800"
            >
              Clear
            </button>
          ) : (
            <span className="apple-kbd">ESC</span>
          )}
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Search suggestions"
          className="max-h-[380px] overflow-y-auto custom-scrollbar p-2 space-y-1 divide-y divide-zinc-800/40"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs font-normal">
              No matching modules, actions, or records found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  id={`command-item-${idx}`}
                  data-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => executeCommand(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-100 ${
                    isSelected
                      ? "bg-zinc-800/90 text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                      : "text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? "bg-zinc-700/80 border-zinc-600/80 text-zinc-100"
                          : "bg-zinc-800/60 border-zinc-700/40 text-zinc-400"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold shrink-0 ${
                              item.badgeColor || "text-zinc-400 bg-zinc-800 border-zinc-700"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {item.shortcut && (
                      <span className="apple-kbd">{item.shortcut}</span>
                    )}
                    {isSelected && (
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with macOS-style hints */}
        <div className="px-4 py-2 bg-zinc-950/80 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="apple-kbd">↑</span>
              <span className="apple-kbd">↓</span>
              <span className="text-[10px] text-zinc-400 font-sans">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="apple-kbd">↵</span>
              <span className="text-[10px] text-zinc-400 font-sans">Open</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Command className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] text-zinc-400 font-sans">Campus Spotlight</span>
          </div>
        </div>
      </div>
    </div>
  );
}
