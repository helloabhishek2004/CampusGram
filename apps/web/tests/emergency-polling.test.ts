import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emergencyClientService, EmergencyDataResponse } from "../lib/services/emergency-client-service";
import type { EmergencyAlert } from "@smart-campus/contracts";

describe("Module 4: Emergency Client Service - Realtime Polling & Resilience", () => {
  let originalDocument: any;
  let originalWindow: any;

  beforeEach(() => {
    vi.useFakeTimers();
    emergencyClientService.clearCache();
    vi.restoreAllMocks();

    originalDocument = (global as any).document;
    originalWindow = (global as any).window;

    const listeners: Record<string, Function[]> = {};
    const docListeners: Record<string, Function[]> = {};

    (global as any).document = {
      hidden: false,
      addEventListener: (event: string, fn: Function) => {
        docListeners[event] = docListeners[event] || [];
        docListeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: Function) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((f) => f !== fn);
        }
      },
      dispatchEvent: (evt: any) => {
        if (docListeners[evt.type]) {
          docListeners[evt.type].forEach((f) => f());
        }
      },
    };

    (global as any).window = {
      addEventListener: (event: string, fn: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((f) => f !== fn);
        }
      },
      dispatchEvent: (evt: any) => {
        if (listeners[evt.type]) {
          listeners[evt.type].forEach((f) => f());
        }
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    emergencyClientService.clearCache();
    (global as any).document = originalDocument;
    (global as any).window = originalWindow;
  });

  const mockAlert: EmergencyAlert = {
    id: "alert-101",
    kind: "alert",
    severity: "critical",
    scope: "campus_wide",
    title: "FIRE ALERT: Library 2nd Floor",
    body: "Evacuate immediately via designated stairs.",
    channels: ["in_app", "sms"],
    is_drill: false,
    status: "sent",
    drafted_by_name: "Security Lead",
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const mockResponse: EmergencyDataResponse = {
    success: true,
    alerts: [mockAlert],
    active: [mockAlert],
    hotlines: [],
  };

  it("subscribes and receives immediate alert update on start", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const onUpdate = vi.fn();
    const unsubscribe = emergencyClientService.pollAlerts(onUpdate, { intervalMs: 5000 });

    // Allow immediate promise to resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(mockResponse);

    unsubscribe();
  });

  it("polls periodically while the document is visible", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          ...mockResponse,
          active: callCount > 1 ? [{ ...mockAlert, title: "UPDATED: Evacuation Complete" }] : [mockAlert],
        }),
      } as Response;
    });

    const onUpdate = vi.fn();
    const unsubscribe = emergencyClientService.pollAlerts(onUpdate, { intervalMs: 5000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        active: [expect.objectContaining({ title: "UPDATED: Evacuation Complete" })],
      })
    );

    // Advance another 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it("pauses polling when tab is hidden and refreshes immediately when visible", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const onUpdate = vi.fn();
    const unsubscribe = emergencyClientService.pollAlerts(onUpdate, { intervalMs: 5000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Simulate tab becoming hidden
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Advance timers - no fetch should occur while hidden
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Simulate tab becoming visible again
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Immediately triggers refresh
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("handles transient network failures without crashing or clearing state", async () => {
    let succeed = false;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      if (!succeed) {
        throw new Error("Network offline");
      }
      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    const onUpdate = vi.fn();
    const onError = vi.fn();
    const unsubscribe = emergencyClientService.pollAlerts(onUpdate, { intervalMs: 5000, onError });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();

    // Now network recovers
    succeed = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith(mockResponse);

    unsubscribe();
  });

  it("cleans up timer and listeners on unsubscribe", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const onUpdate = vi.fn();
    const unsubscribe = emergencyClientService.pollAlerts(onUpdate, { intervalMs: 5000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Unsubscribe immediately
    unsubscribe();

    // Advancing timers should not cause any further fetches
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
