import {
  EmergencyAlert,
  EmergencyReport,
  CreateEmergencyAlertInput,
  CreateEmergencyReportInput,
  SafetyCheckIn,
} from "@smart-campus/contracts";
import type { EmergencyContact } from "../emergency/emergency-service";

export interface EmergencyDataResponse {
  success: boolean;
  alerts: EmergencyAlert[];
  active: EmergencyAlert[];
  hotlines: EmergencyContact[];
}

// In-memory cache & in-flight deduplication state
let cachedAlertsData: { data: EmergencyDataResponse; timestamp: number } | null = null;
let activeAlertsPromise: Promise<EmergencyDataResponse> | null = null;

let cachedReportsData: { data: { success: boolean; reports: EmergencyReport[] }; timestamp: number } | null = null;
let activeReportsPromise: Promise<{ success: boolean; reports: EmergencyReport[] }> | null = null;

const CACHE_TTL_MS = 15_000; // 15 seconds freshness window for non-mutating checks

export const emergencyClientService = {
  /**
   * Fetches active emergency alerts with in-flight deduplication and short TTL caching.
   * If forceRefresh is true, bypasses cache and re-fetches immediately.
   */
  async getAlerts(forceRefresh = false): Promise<EmergencyDataResponse> {
    const now = Date.now();

    // 1. Serve from fresh cache if valid and not forcing refresh
    if (!forceRefresh && cachedAlertsData && now - cachedAlertsData.timestamp < CACHE_TTL_MS) {
      return cachedAlertsData.data;
    }

    // 2. Reuse in-flight request to avoid duplicate parallel requests
    if (activeAlertsPromise && !forceRefresh) {
      return activeAlertsPromise;
    }

    activeAlertsPromise = (async () => {
      try {
        const res = await fetch("/api/emergency/alerts", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch alerts");
        const json: EmergencyDataResponse = await res.json();

        if (json.success) {
          cachedAlertsData = { data: json, timestamp: Date.now() };
        }
        return json;
      } catch {
        // Return stale cache if available during transient network drop
        if (cachedAlertsData) return cachedAlertsData.data;
        return { success: false, alerts: [], active: [], hotlines: [] };
      } finally {
        activeAlertsPromise = null;
      }
    })();

    return activeAlertsPromise;
  },

  /**
   * Fetches reported incidents with deduplication and TTL caching.
   */
  async getReports(forceRefresh = false): Promise<{ success: boolean; reports: EmergencyReport[] }> {
    const now = Date.now();

    if (!forceRefresh && cachedReportsData && now - cachedReportsData.timestamp < CACHE_TTL_MS) {
      return cachedReportsData.data;
    }

    if (activeReportsPromise && !forceRefresh) {
      return activeReportsPromise;
    }

    activeReportsPromise = (async () => {
      try {
        const res = await fetch("/api/emergency/reports", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch reports");
        const json = await res.json();

        if (json.success) {
          cachedReportsData = { data: json, timestamp: Date.now() };
        }
        return json;
      } catch {
        if (cachedReportsData) return cachedReportsData.data;
        return { success: false, reports: [] };
      } finally {
        activeReportsPromise = null;
      }
    })();

    return activeReportsPromise;
  },

  /**
   * Submits a new 1-tap SOS report and immediately invalidates cache.
   */
  async submitReport(input: CreateEmergencyReportInput): Promise<{ success: boolean; message: string; report?: EmergencyReport }> {
    try {
      const res = await fetch("/api/emergency/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      // Invalidate reports and alerts cache on mutation
      cachedReportsData = null;
      cachedAlertsData = null;
      return data;
    } catch {
      return { success: false, message: "Network transmission error" };
    }
  },

  /**
   * Broadcasts an official campus emergency alert and invalidates cache.
   */
  async broadcastAlert(input: CreateEmergencyAlertInput): Promise<{ success: boolean; message: string; alert?: EmergencyAlert }> {
    try {
      const res = await fetch("/api/emergency/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      // Invalidate cache immediately so new broadcast is live instantly
      cachedAlertsData = null;
      return data;
    } catch {
      return { success: false, message: "Failed to broadcast alert" };
    }
  },

  /**
   * Submits student/staff safety check-in status.
   */
  async checkIn(input: SafetyCheckIn): Promise<{ success: boolean; message: string; totalSafe?: number }> {
    try {
      const res = await fetch("/api/emergency/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      cachedAlertsData = null;
      return data;
    } catch {
      return { success: false, message: "Failed to register safety check-in" };
    }
  },

  /**
   * Updates an emergency report status (Responder action) and invalidates cached reports.
   */
  async updateReportStatus(
    reportId: string,
    status: import("@smart-campus/contracts").EmergencyReportStatus,
    expectedPreviousStatus?: import("@smart-campus/contracts").EmergencyReportStatus,
    note?: string
  ): Promise<{ success: boolean; message?: string; error?: string; report?: EmergencyReport }> {
    try {
      const res = await fetch(`/api/emergency/reports/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          expected_previous_status: expectedPreviousStatus,
          note: note ? note.trim() : undefined,
        }),
      });
      const data = await res.json();
      // Invalidate cached reports on mutation
      cachedReportsData = null;
      return data;
    } catch {
      return { success: false, error: "Network error updating report status" };
    }
  },

  /**
   * Retrieves chronological audit history for an emergency report.
   */
  async getReportHistory(
    reportId: string
  ): Promise<{ success: boolean; history: import("@smart-campus/contracts").EmergencyReportHistoryView[]; error?: string }> {
    try {
      const res = await fetch(`/api/emergency/reports/${encodeURIComponent(reportId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return { success: false, history: [], error: errorJson.error || "Failed to fetch report history" };
      }
      const data = await res.json();
      return { success: true, history: data.history || [] };
    } catch {
      return { success: false, history: [], error: "Network error fetching history" };
    }
  },

  /**
   * Subscribes to live emergency alerts via adaptive visibility-aware polling.
   * - Fires an immediate fetch (bypassing cache) on start.
   * - Polls every `intervalMs` (default 5000ms) while tab is visible.
   * - Pauses or reduces polling when tab is hidden.
   * - Immediately re-checks on tab visibility change back to visible or window focus.
   * - Ensures in-flight requests are not duplicated.
   * - Returns an unsubscribe cleanup function.
   */
  pollAlerts(
    onUpdate: (data: EmergencyDataResponse) => void,
    options: { intervalMs?: number; onError?: (err: unknown) => void } = {}
  ): () => void {
    const intervalMs = options.intervalMs ?? 5_000;
    let timer: NodeJS.Timeout | null = null;
    let disposed = false;
    let inFlight = false;

    const executeCheck = async (forceRefresh = true) => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const data = await emergencyClientService.getAlerts(forceRefresh);
        if (!disposed && data.success) {
          onUpdate(data);
        }
      } catch (err) {
        if (!disposed && options.onError) {
          options.onError(err);
        }
      } finally {
        inFlight = false;
      }
    };

    const scheduleNext = () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);

      // Only schedule standard interval if document is visible; otherwise pause
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }

      timer = setTimeout(async () => {
        await executeCheck(true);
        scheduleNext();
      }, intervalMs);
    };

    // 1. Immediate initial check
    void executeCheck(true).then(() => {
      scheduleNext();
    });

    // 2. Visibility change & focus listeners
    const handleVisibilityChange = () => {
      if (typeof document === "undefined" || disposed) return;
      if (!document.hidden) {
        // Document became visible again: refresh immediately and resume timer
        void executeCheck(true).then(() => {
          scheduleNext();
        });
      } else {
        // Document hidden: cancel pending timer
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
    };

    const handleFocus = () => {
      if (disposed) return;
      void executeCheck(true).then(() => {
        scheduleNext();
      });
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleFocus);
    }

    // Return cleanup function
    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleFocus);
      }
    };
  },

  /**
   * Explicitly clear cache (for test resetting or logout).
   */
  clearCache() {
    cachedAlertsData = null;
    cachedReportsData = null;
    activeAlertsPromise = null;
    activeReportsPromise = null;
  },
};
