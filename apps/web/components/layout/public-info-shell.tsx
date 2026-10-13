"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CampusGramLogo } from "./logo";
import { useCampusAuth } from "../auth/auth-guard";
import { useTheme } from "../theme/theme-context";
import { Sun, Moon, ArrowLeft, Shield, FileText, HelpCircle, Info } from "lucide-react";
import { cn } from "@smart-campus/utils";

interface PublicInfoShellProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}

const FOOTER_LINKS = [
  { name: "About", href: "/about", icon: Info },
  { name: "Help & Support", href: "/help", icon: HelpCircle },
  { name: "Privacy Policy", href: "/privacy", icon: Shield },
  { name: "Terms of Service", href: "/terms", icon: FileText },
];

export function PublicInfoShell({ children, title, subtitle, badge }: PublicInfoShellProps) {
  const pathname = usePathname();
  const { user } = useCampusAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-muted selection:text-foreground">
      {/* Top Header */}
      <header className="border-b border-border bg-card/90 backdrop-blur-xl sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={user ? "/home" : "/login"}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            title={user ? "Return to Campus Feed" : "Return to Login"}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{user ? "Back to Workspace" : "Back to Sign In"}</span>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <CampusGramLogo size="sm" withLink={false} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Nav Pills */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Informational links">
            {FOOTER_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>

          <div className="h-4 w-px bg-border hidden md:block" />

          {/* Theme switch */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {user ? (
            <Link
              href="/home"
              className="px-3 py-1 rounded-md bg-secondary hover:bg-muted text-foreground text-xs font-medium border border-border transition-colors"
            >
              Open App
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Header */}
      <div className="border-b border-border bg-card/40 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-2">
          {badge && (
            <span className="inline-block text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">
              {badge}
            </span>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="space-y-10">{children}</div>
      </main>

      {/* Unified Informational Footer */}
      <footer className="border-t border-border bg-card/60 py-8 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">CampusGram</span>
            <span>•</span>
            <span>Smart Campus System</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="Footer links">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "hover:text-foreground transition-colors",
                  pathname === link.href && "text-foreground font-semibold underline underline-offset-4"
                )}
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
