"use client";

import React, { useEffect, useState } from "react";
import { Info, Code2, X, ExternalLink } from "lucide-react";

interface DemoConfig {
  isDemo: boolean;
  sourceRepoUrl: string;
  notice: string;
}

export function PortfolioDemoNotice() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if client override or fetch server demo status
    fetch("/api/demo/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.isDemo) {
          setConfig({
            isDemo: true,
            sourceRepoUrl: data.sourceRepoUrl || "https://github.com/helloabhishek2004/campus-hackthon",
            notice: data.notice || "This is an interactive demonstration using fictional data. Actions do not create real campus reports or trigger real emergency services.",
          });
        }
      })
      .catch(() => {
        // Safe silent fail
      });
  }, []);

  if (!config?.isDemo || isDismissed) {
    return null;
  }

  return (
    <aside
      aria-label="Portfolio Demo Notice"
      className="fixed bottom-4 right-4 z-50 max-w-sm font-sans print:hidden"
    >
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 p-3.5 shadow-2xl backdrop-blur-md transition-all duration-200">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-1.5 text-zinc-300">
            <Info className="h-4 w-4" aria-hidden="true" />
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                CampusGram — Portfolio Demo
              </span>
              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                className="rounded p-0.5 text-zinc-500 hover:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                aria-label="Dismiss demo notice for this session"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {config.notice}
            </p>

            <div className="mt-2.5 flex items-center gap-3">
              <a
                href={config.sourceRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors"
              >
                <Code2 className="h-3 w-3" />
                <span>View Source</span>
                <ExternalLink className="h-2.5 w-2.5 text-zinc-500" />
              </a>

              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {isOpen ? "Hide details" : "Learn more"}
              </button>
            </div>

            {isOpen && (
              <div className="mt-2.5 space-y-1.5 border-t border-zinc-900 pt-2 text-[11px] leading-normal text-zinc-400">
                <p>
                  • <strong>Authentication:</strong> Use demo credentials (e.g. <code className="text-zinc-300">STU2026001</code>) with simulated OTP <code className="text-zinc-300">123456</code>.
                </p>
                <p>
                  • <strong>Data Isolation:</strong> External notification channels, AI calls, and live database writes are cleanly simulated in-memory.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
