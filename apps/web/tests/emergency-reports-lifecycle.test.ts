import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, GET } from "../app/api/emergency/reports/[id]/route";
import * as serverIdentity from "../lib/auth/server-identity";
import { emergencyService } from "../lib/emergency/emergency-service";

describe("PATCH & GET /api/emergency/reports/[id] - Responder Lifecycle & Audit Trail API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const staffIdentity: serverIdentity.ServerIdentity = {
    userId: "staff-1",
    profile: {
      id: "staff-1",
      institutionalId: "FAC2026001",
      fullName: "Officer Sharma",
      maskedPhone: "******0001",
      role: "faculty",
      tags: ["DEPARTMENT_COORDINATOR"],
      isActive: true,
    },
    isDemo: false,
  };

  const studentIdentity: serverIdentity.ServerIdentity = {
    userId: "stu-1",
    profile: {
      id: "stu-1",
      institutionalId: "STU2026002",
      fullName: "Student User",
      maskedPhone: "******0002",
      role: "student",
      tags: [],
      isActive: true,
    },
    isDemo: false,
  };

  it("rejects unauthenticated requests with 401", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "acknowledged" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Authentication required");
  });

  it("blocks ordinary students from transitioning report status with 403", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(studentIdentity);

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "acknowledged" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Responder authorization required");
  });

  it("rejects invalid request bodies with 400", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid_status_enum" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("allows authorized responders to transition valid statuses", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);
    vi.spyOn(emergencyService, "updateReportStatus").mockResolvedValue({
      id: "rep-1",
      public_ref: "EMR-2026-101",
      type: "fire",
      location_name: "Library",
      description: "Smoke detected",
      priority: 1,
      status: "acknowledged",
      reporter_name: "Student",
      is_drill: false,
      created_at: new Date().toISOString(),
    });

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "acknowledged", expected_previous_status: "submitted" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.report.status).toBe("acknowledged");
  });

  it("surfaces 404 when report does not exist", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);
    vi.spyOn(emergencyService, "updateReportStatus").mockRejectedValue(
      new Error("Emergency report not found.")
    );

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "acknowledged" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("surfaces 409 when invalid transition or conflict occurs", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);
    vi.spyOn(emergencyService, "updateReportStatus").mockRejectedValue(
      new Error("Invalid status transition from 'submitted' to 'resolved'.")
    );

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Invalid status transition");
  });

  it("blocks forged client-supplied role or identity claims in headers/payload", async () => {
    // resolveServerIdentity determines real identity; student attempting to forge 'role: admin'
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(studentIdentity);

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-role": "admin",
        "x-user-id": "staff-1",
      },
      body: JSON.stringify({
        status: "acknowledged",
        role: "admin",
        userId: "staff-1",
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Responder authorization required");
  });

  it("blocks reopening of terminal statuses (resolved / rejected)", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);

    // Testing transition from terminal 'resolved' -> 'submitted'
    vi.spyOn(emergencyService, "updateReportStatus").mockRejectedValue(
      new Error("Invalid status transition from 'resolved' to 'submitted'.")
    );

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "submitted", expected_previous_status: "resolved" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("Invalid status transition from 'resolved' to 'submitted'.");
  });

  it("rejects malformed or empty report ID parameters", async () => {
    vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);

    const req = new NextRequest("http://localhost:3000/api/emergency/reports/%20", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "acknowledged" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "   " }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid or missing report ID");
  });

  describe("GET /api/emergency/reports/[id] - Audit History Retrieval", () => {
    it("rejects unauthenticated history requests with 401", async () => {
      vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1");
      const res = await GET(req, { params: Promise.resolve({ id: "rep-1" }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Authentication required");
    });

    it("blocks ordinary students from accessing report audit history with 403", async () => {
      vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(studentIdentity);

      const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1");
      const res = await GET(req, { params: Promise.resolve({ id: "rep-1" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Responder authorization required");
    });

    it("allows authorized responders to retrieve sanitized audit history", async () => {
      vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);
      vi.spyOn(emergencyService, "getReportHistory").mockResolvedValue([
        {
          id: "hist-1",
          report_id: "rep-1",
          from_status: "submitted",
          to_status: "acknowledged",
          actor_id: "staff-1",
          actor_name: "Officer Sharma",
          note: "Unit dispatched",
          created_at: new Date().toISOString(),
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1");
      const res = await GET(req, { params: Promise.resolve({ id: "rep-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.history).toHaveLength(1);
      expect(json.history[0].actor_id).toBe("staff-1");
      expect(json.history[0].actor_name).toBe("Officer Sharma");
      expect(json.history[0].note).toBe("Unit dispatched");
    });

    it("returns 404 when report does not exist", async () => {
      vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);
      vi.spyOn(emergencyService, "getReportHistory").mockRejectedValue(
        new Error("Emergency report not found.")
      );

      const req = new NextRequest("http://localhost:3000/api/emergency/reports/missing");
      const res = await GET(req, { params: Promise.resolve({ id: "missing" }) });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Emergency report not found.");
    });
  });

  describe("Repository Atomic Transition Integrity", () => {
    it("fails safely without partial status change if atomic transition RPC fails", async () => {
      vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);
      vi.spyOn(emergencyService, "updateReportStatus").mockRejectedValue(
        new Error("Database error: Emergency report status transition")
      );

      const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged", expected_previous_status: "submitted" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Database error");
    });

    it("surfaces 409 conflict when report status was concurrently modified", async () => {
      vi.spyOn(serverIdentity, "resolveServerIdentity").mockResolvedValue(staffIdentity);
      vi.spyOn(emergencyService, "updateReportStatus").mockRejectedValue(
        new Error("Conflict: Emergency report status changed from 'submitted' to 'verifying'. Please refresh.")
      );

      const req = new NextRequest("http://localhost:3000/api/emergency/reports/rep-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged", expected_previous_status: "submitted" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "rep-1" }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Conflict: Emergency report status changed");
    });
  });
});
