"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  FileText,
  Settings,
  User,
  LogOut,
  GraduationCap,
  BookOpen,
  CheckSquare,
  AlertCircle,
  PackageSearch,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  Moon,
  HelpCircle,
  Info,
} from "lucide-react";
import { Avatar } from "../ui/avatar";
import { useCampusAuth } from "../auth/auth-guard";
import { useSidebar } from "./sidebar-context";
import { useTheme } from "../theme/theme-context";
import { cn } from "@smart-campus/utils";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
  badge?: string;
  badgeColor?: string;
}

const MAIN_NAV_ITEMS: NavItem[] = [
  { name: "Feed", href: "/home", icon: Home, shortcut: "G H" },
  { name: "Documents", href: "/documents", icon: FileText, shortcut: "G D" },
];

const MODULE_NAV_ITEMS: NavItem[] = [
  {
    name: "Complaints & AI",
    href: "/complaints",
    icon: AlertCircle,
    shortcut: "G C",
    badge: "M2",
    badgeColor: "text-zinc-600 dark:text-zinc-400 bg-zinc-200/80 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700",
  },
  {
    name: "Lost & Found",
    href: "/lost-and-found",
    icon: PackageSearch,
    shortcut: "G L",
    badge: "M3",
    badgeColor: "text-zinc-600 dark:text-zinc-400 bg-zinc-200/80 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700",
  },
  {
    name: "Emergency Alerts",
    href: "/emergency",
    icon: ShieldAlert,
    shortcut: "G E",
    badge: "M4 SOS",
    badgeColor: "text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-500/10 border-red-200 dark:border-red-500/20",
  },
];

const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { name: "Settings", href: "/settings", icon: Settings, shortcut: "G S" },
  { name: "Help & Support", href: "/help", icon: HelpCircle, shortcut: "G ?" },
  { name: "About", href: "/about", icon: Info, shortcut: "G I" },
];

const FACULTY_NAV_ITEMS: NavItem[] = [
  { name: "Faculty Portal", href: "/faculty", icon: GraduationCap, shortcut: "G F" },
  { name: "Academic Notices", href: "/faculty/documents", icon: BookOpen, shortcut: "G N" },
  { name: "Submissions", href: "/faculty/submissions", icon: CheckSquare, shortcut: "G A" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useCampusAuth();
  const { isCollapsed, toggleSidebar, toggleCommandPalette } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const isFacultyOrAdmin = user?.role === "faculty" || user?.role === "admin";

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-full shrink-0 border-r border-border bg-card/95 backdrop-blur-xl select-none z-30 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isCollapsed ? "w-16 items-center" : "w-64"
      )}
      aria-label="Application Sidebar"
    >
      {/* Pinned Sidebar Header: CampusGram Logo that morphs into collapse/expand switch on hover */}
      <div className={cn("shrink-0 w-full pt-3 pb-2", isCollapsed ? "px-2.5 flex justify-center" : "px-3.5")}>
        <button
          onClick={toggleSidebar}
          className={cn(
            "apple-press group relative flex min-h-11 items-center rounded-xl p-1.5 transition-all text-left border border-transparent hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isCollapsed ? "justify-center w-full mx-auto" : "w-full gap-2.5"
          )}
          title={isCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {/* Logo Mark with Hover Switch Transformation */}
          <div className="relative w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-900 border border-zinc-700/80 dark:border-zinc-800 flex items-center justify-center font-mono font-bold text-xs text-zinc-100 shadow-sm shrink-0 overflow-hidden group-hover:border-zinc-500 dark:group-hover:border-zinc-600 transition-colors">
            {/* Normal State: CampusGram Mark */}
            <Image
              src="/assets/campus_gram_icon.svg"
              alt="CampusGram"
              width={32}
              height={32}
              className="w-full h-full object-cover transition-all duration-200 group-hover:opacity-0 group-hover:scale-50"
            />

            {/* Hovered State: macOS Switch */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 text-zinc-100">
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </div>
          </div>

          {!isCollapsed && (
            <div className="flex flex-col leading-none min-w-0 pr-1">
              <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 truncate group-hover:text-black dark:group-hover:text-white transition-colors">
                CampusGram
              </span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase mt-0.5">
                Smart Campus
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Pinned Global Spotlight Search Trigger */}
      <div className={cn("shrink-0 w-full pb-2", isCollapsed ? "px-2.5 flex justify-center" : "px-3.5")}>
        {!isCollapsed ? (
          <button
            onClick={toggleCommandPalette}
            className="apple-press w-full min-h-9 flex items-center justify-between px-2.5 py-1 rounded-lg bg-secondary hover:bg-accent border border-border hover:border-ring/40 text-muted-foreground hover:text-foreground transition-all text-xs font-normal shadow-xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Search campus modules and actions (⌘K)"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
              <span className="text-muted-foreground group-hover:text-foreground text-[11px]">
                Spotlight Search...
              </span>
            </div>
            <span className="apple-kbd">⌘K</span>
          </button>
        ) : (
          <button
            onClick={toggleCommandPalette}
            className="apple-press w-10 h-10 flex items-center justify-center rounded-lg bg-secondary hover:bg-accent border border-border hover:border-ring/40 text-muted-foreground hover:text-foreground transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Spotlight Search (⌘K)"
            aria-label="Spotlight Search (⌘K)"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Independent Scrollable Navigation Area */}
      <div
        className={cn(
          "flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar py-1 space-y-3",
          isCollapsed ? "px-2 flex flex-col items-center" : "px-3.5"
        )}
      >
        <nav className="w-full space-y-3" aria-label="Main Navigation">
          {/* Section: Campus Life */}
          <div className="space-y-0.5">
            {!isCollapsed && (
              <div className="px-2 pt-0.5 pb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">
                  Campus Life
                </span>
              </div>
            )}

            {MAIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? `${item.name} (${item.shortcut})` : undefined}
                  className={cn(
                    "apple-press flex min-h-9 items-center rounded-lg text-xs font-medium transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isCollapsed ? "justify-center p-2.5 w-10 h-10 mx-auto" : "justify-between px-2.5 py-2",
                    isActive
                      ? "bg-accent text-accent-foreground border border-border shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                  </div>

                  {!isCollapsed && (
                    <span className="apple-kbd opacity-70 group-hover:opacity-100 transition-opacity">
                      {item.shortcut}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Section: Campus Systems (Modules 2, 3, 4) */}
          <div className="space-y-0.5">
            {!isCollapsed ? (
              <div className="pt-1.5 pb-1 px-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">
                  Campus Systems
                </span>
              </div>
            ) : (
              <div className="w-8 h-px bg-border my-1.5 mx-auto" />
            )}

            {MODULE_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? `${item.name} (${item.shortcut})` : undefined}
                  className={cn(
                    "apple-press flex min-h-9 items-center rounded-lg text-xs font-medium transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isCollapsed ? "justify-center p-2.5 w-10 h-10 mx-auto" : "justify-between px-2.5 py-2",
                    isActive
                      ? "bg-accent text-accent-foreground border border-border shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                  </div>

                  {!isCollapsed && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span
                          className={cn(
                            "text-[9px] font-mono px-1.5 py-0.5 rounded border font-semibold tracking-wide",
                            item.badgeColor
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                      <span className="apple-kbd opacity-60 group-hover:opacity-100 transition-opacity">
                        {item.shortcut}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Section: Faculty & Academic Portal */}
          {isFacultyOrAdmin && (
            <div className="space-y-0.5">
              {!isCollapsed ? (
                <div className="pt-1.5 pb-1 px-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">
                    Faculty & Academic
                  </span>
                </div>
              ) : (
                <div className="w-8 h-px bg-border my-1.5 mx-auto" />
              )}

              {FACULTY_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? `${item.name} (${item.shortcut})` : undefined}
                    className={cn(
                      "apple-press flex min-h-9 items-center rounded-lg text-xs font-medium transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      isCollapsed ? "justify-center p-2.5 w-10 h-10 mx-auto" : "justify-between px-2.5 py-2",
                      isActive
                        ? "bg-accent text-accent-foreground border border-border shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-colors",
                          isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {!isCollapsed && <span className="truncate">{item.name}</span>}
                    </div>

                    {!isCollapsed && (
                      <span className="apple-kbd opacity-60 group-hover:opacity-100 transition-opacity">
                        {item.shortcut}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Section: Account & Settings */}
          <div className="space-y-0.5">
            {!isCollapsed ? (
              <div className="pt-1.5 pb-1 px-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">
                  Account
                </span>
              </div>
            ) : (
              <div className="w-8 h-px bg-border my-1.5 mx-auto" />
            )}

            {ACCOUNT_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? `${item.name} (${item.shortcut})` : undefined}
                  className={cn(
                    "apple-press flex min-h-9 items-center rounded-lg text-xs font-medium transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isCollapsed ? "justify-center p-2.5 w-10 h-10 mx-auto" : "justify-between px-2.5 py-2",
                    isActive
                      ? "bg-accent text-accent-foreground border border-border shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                  </div>

                  {!isCollapsed && (
                    <span className="apple-kbd opacity-60 group-hover:opacity-100 transition-opacity">
                      {item.shortcut}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Pinned Sidebar Footer: Theme Switch & User Session */}
      <div
        className={cn(
          "shrink-0 mt-auto w-full pt-2.5 pb-3 border-t border-border bg-card/95 backdrop-blur-xl space-y-1.5",
          isCollapsed ? "px-2.5 flex flex-col items-center" : "px-3.5"
        )}
      >
        {/* Theme Toggle Button (Light / Dark) */}
        <div className="w-full">
          {!isCollapsed ? (
            <button
              onClick={toggleTheme}
              className="apple-press w-full min-h-9 flex items-center justify-between px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              <div className="flex items-center gap-2">
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Moon className="w-4 h-4 text-muted-foreground" />
                )}
                <span>{theme === "dark" ? "Light Theme" : "Dark Theme"}</span>
              </div>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                {theme}
              </span>
            </button>
          ) : (
            <button
              onClick={toggleTheme}
              className="apple-press w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Moon className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {/* User Session Profile & Sign Out */}
        {user && (
          <div className={cn("w-full flex items-center justify-between gap-1 pt-0.5", isCollapsed && "flex-col")}>
            <Link
              href="/profile"
              title={isCollapsed ? `${user.fullName} (${user.institutionalId})` : undefined}
              className={cn(
                "apple-press flex items-center rounded-lg hover:bg-accent border border-transparent hover:border-border transition-colors group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isCollapsed ? "p-1 justify-center w-full" : "gap-2 p-1.5 flex-1"
              )}
            >
              <Avatar name={user.fullName} role={user.role} size="sm" />
              {!isCollapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium text-foreground truncate group-hover:text-foreground">
                    {user.fullName}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {user.institutionalId}
                  </p>
                </div>
              )}
            </Link>

            {!isCollapsed ? (
              <button
                onClick={logout}
                className="apple-press p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Sign out of CampusGram session"
                aria-label="Sign out"
              >
                <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            ) : (
              <button
                onClick={logout}
                className="apple-press w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
