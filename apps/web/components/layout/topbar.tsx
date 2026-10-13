"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Search,
  ShieldAlert,
} from "lucide-react";
import { useSidebar } from "./sidebar-context";
import { useCampusAuth } from "../auth/auth-guard";
import { Avatar } from "../ui/avatar";

export function DesktopTopBar() {
  const pathname = usePathname();
  const { toggleCommandPalette } = useSidebar();
  const { user } = useCampusAuth();

  // Compute clean breadcrumb title
  const getPageTitle = () => {
    if (pathname === "/home") return "Campus Life / Verified Feed";
    if (pathname === "/documents") return "Academic / Document Vault";
    if (pathname.startsWith("/complaints")) return "Campus Systems / Complaint Intelligence";
    if (pathname.startsWith("/lost-and-found")) return "Campus Systems / Lost & Found";
    if (pathname.startsWith("/emergency")) return "Life Safety / Emergency Alert Center";
    if (pathname.startsWith("/faculty")) return "Faculty & Administration / Academic Portal";
    if (pathname.startsWith("/profile")) return "Account / Institutional Profile";
    if (pathname.startsWith("/settings")) return "Account / Preferences";
    if (pathname === "/about") return "Information / About CampusGram";
    if (pathname === "/help") return "Support / Operational Guide";
    if (pathname === "/privacy") return "Legal / Privacy Policy";
    if (pathname === "/terms") return "Legal / Terms of Service";
    return "CampusGram Smart Campus";
  };

  return (
    <header className="hidden md:flex min-h-14 items-center justify-between gap-4 px-4 sm:px-6 py-2.5 bg-background/90 backdrop-blur-xl border-b border-border sticky top-0 z-20 select-none transition-colors duration-200">
      {/* Left: Breadcrumb / Section context */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-4 h-4 rounded-sm overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 shadow-xs">
          <Image
            src="/assets/campus_gram_icon.svg"
            alt="CampusGram"
            width={16}
            height={16}
            className="w-full h-full object-cover"
          />
        </div>
        <span className="text-border text-xs font-mono">/</span>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider truncate font-medium">
          {getPageTitle()}
        </span>
      </div>

      {/* Middle: Spotlight search pill */}
      <button
        onClick={toggleCommandPalette}
        className="apple-press flex min-h-10 items-center gap-2.5 px-3 py-1.5 rounded-full bg-secondary hover:bg-accent border border-border hover:border-ring/40 text-muted-foreground hover:text-foreground transition-all text-xs font-normal shadow-xs w-44 sm:w-60 lg:w-72 justify-between group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Spotlight Search (⌘K / Ctrl+K)"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground group-hover:text-foreground truncate">
            Search campus, SOS...
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="apple-kbd">⌘K</span>
        </div>
      </button>

      {/* Right: Quick SOS trigger & profile avatar */}
      <div className="flex items-center gap-2.5 shrink-0">
        <Link
          href="/emergency"
          className="apple-press flex min-h-10 items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 border border-red-200 dark:border-red-900/60 hover:border-red-300 dark:hover:border-red-800 text-red-700 dark:text-red-300 transition-all text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          title="Campus Life-Safety Emergency Center"
        >
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
          <span className="text-[11px] font-mono tracking-wider font-semibold">SOS</span>
        </Link>

        {user && (
          <Link
            href="/profile"
            className="apple-press p-1.5 rounded-lg hover:bg-accent border border-transparent hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`${user.fullName} (${user.institutionalId})`}
          >
            <Avatar name={user.fullName} role={user.role} size="sm" />
          </Link>
        )}
      </div>
    </header>
  );
}
