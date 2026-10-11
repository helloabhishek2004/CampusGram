"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
} from "@smart-campus/ui";
import { Search, MapPin, Calendar, Image as ImageIcon, ArrowLeft, RefreshCw, Layers } from "lucide-react";
import { cn } from "@smart-campus/utils";

type Item = {
  id: string;
  type: "lost" | "found";
  title: string;
  category: string;
  public_description: string;
  location_description: string;
  event_date: string;
  status: string;
  images: any[];
};

export default function BrowseItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "lost" | "found">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchItems = React.useCallback(async () => {
    // Abort previous in-flight request to avoid race condition
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      let url = "/api/lost-found/items";
      if (filterType !== "all") {
        url += `?type=${filterType}`;
      }
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Failed to fetch items:", err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [filterType]);

  useEffect(() => {
    fetchItems();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchItems]);

  const formatSafeDate = (d?: string) => {
    if (!d) return "Recently";
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return "Recently";
      return format(parsed, "MMM d");
    } catch {
      return "Recently";
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.public_description?.toLowerCase().includes(q) ||
        item.location_description?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-4">
          <div>
            <Link
              href="/lost-and-found"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium mb-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Lost & Found
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Campus Item Directory
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Browse recently reported lost valuables and found items registered across campus.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Toggle */}
            <div className="flex bg-muted/70 border border-border p-1 rounded-lg">
              <button
                onClick={() => setFilterType("all")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  filterType === "all"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilterType("lost")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  filterType === "lost"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Lost
              </button>
              <button
                onClick={() => setFilterType("found")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  filterType === "found"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Found
              </button>
            </div>

            <button
              onClick={fetchItems}
              disabled={loading}
              className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by keywords (e.g. calculator, keys, blue bottle, library)..."
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
          />
        </div>

        {/* Content Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-muted/60 border border-border animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 rounded-xl border border-dashed border-border space-y-2">
            <Layers className="w-8 h-8 text-muted-foreground/60 mx-auto" />
            <p className="text-xs font-semibold text-foreground">No items match your criteria</p>
            <p className="text-[11px] text-muted-foreground">
              Try adjusting your search query or switching filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <Link key={item.id} href={`/lost-and-found/items/${item.id}`} className="group block">
                <Card className="h-full border-border bg-card hover:border-primary/40 transition-all rounded-xl overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="h-44 bg-muted/50 flex items-center justify-center text-muted-foreground relative overflow-hidden border-b border-border">
                      {item.images && item.images.length > 0 && item.images[0].public_url ? (
                        <Image
                          src={item.images[0].public_url}
                          alt={item.title}
                          fill
                          unoptimized
                          onError={(e) => {
                            // Graceful fallback on broken image link
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <ImageIcon className="w-10 h-10 opacity-40 text-muted-foreground" />
                      )}
                      <div className="absolute top-2.5 left-2.5">
                        <span
                          className={cn(
                            "text-[10px] font-mono px-2 py-0.5 rounded font-bold border",
                            item.type === "lost"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          )}
                        >
                          {item.type === "lost" ? "LOST" : "FOUND"}
                        </span>
                      </div>
                      <div className="absolute bottom-2.5 right-2.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-xs text-foreground border border-border capitalize">
                          {item.category?.replace("_", " ") || "General"}
                        </span>
                      </div>
                    </div>

                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                        {item.title}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="px-4 pb-3 space-y-3">
                      <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px] leading-relaxed">
                        {item.public_description || "No public notes provided."}
                      </p>
                    </CardContent>
                  </div>

                  <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-1 truncate max-w-[55%]">
                      <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.location_description}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Calendar className="w-3 h-3 shrink-0 text-muted-foreground" />
                      <span>{formatSafeDate(item.event_date)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
