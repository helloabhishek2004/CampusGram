import { describe, it, expect, beforeEach, vi } from "vitest";
import { isDemoMode, getDemoConfiguration } from "../lib/demo/demo-mode";
import { GET as getDemoConfigHandler } from "../app/api/demo/config/route";
import { GET as getComplaintsHandler } from "../app/api/complaints/route";
import { NextRequest } from "next/server";

describe("CampusGram Demo Mode Isolation & Showcase", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Demo Mode Configuration Detection", () => {
    it("defaults to false when CAMPUSGRAM_DEMO_MODE is absent or false", () => {
      delete process.env.CAMPUSGRAM_DEMO_MODE;
      expect(isDemoMode()).toBe(false);

      process.env.CAMPUSGRAM_DEMO_MODE = "false";
      expect(isDemoMode()).toBe(false);
    });

    it("activates only when CAMPUSGRAM_DEMO_MODE is strictly 'true'", () => {
      process.env.CAMPUSGRAM_DEMO_MODE = "true";
      expect(isDemoMode()).toBe(true);
    });

    it("returns safe client metadata with verified repository link and no secrets", () => {
      process.env.CAMPUSGRAM_DEMO_MODE = "true";
      const config = getDemoConfiguration();
      expect(config.isDemo).toBe(true);
      expect(config.sourceRepoUrl).toBe("https://github.com/helloabhishek2004/campus-hackthon");
      expect(config.notice).toContain("interactive demonstration");
      expect(JSON.stringify(config)).not.toContain("SUPABASE");
      expect(JSON.stringify(config)).not.toContain("SECRET");
    });

    it("/api/demo/config returns valid json matching configuration", async () => {
      process.env.CAMPUSGRAM_DEMO_MODE = "true";
      const res = await getDemoConfigHandler();
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.isDemo).toBe(true);
      expect(body.sourceRepoUrl).toBe("https://github.com/helloabhishek2004/campus-hackthon");
    });
  });

  describe("API Service Isolation Under Demo Mode", () => {
    it("complaints route rejects unauthenticated requests cleanly in demo mode", async () => {
      process.env.CAMPUSGRAM_DEMO_MODE = "true";
      const req = new NextRequest("http://localhost:3000/api/complaints");
      const res = await getComplaintsHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("UNAUTHENTICATED");
    });
  });
});
