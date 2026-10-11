import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import nextConfig from "../next.config";
import { GET as getAttachment } from "../app/api/complaints/attachments/[filename]/route";
import { createMockSessionToken } from "../lib/auth/identity-service";
import { MOCK_INSTITUTIONAL_DIRECTORY } from "../lib/auth/mock-identities";

const owner = MOCK_INSTITUTIONAL_DIRECTORY[0];
const staff = MOCK_INSTITUTIONAL_DIRECTORY.find((profile) => profile.tags.includes("HOD"))!;

async function rewriteBeforePublicLookup(url: string, cookie?: string) {
  const rewrites = await nextConfig.rewrites?.();
  // Next's testing utility does not simulate filesystem lookup and flattens all
  // rewrite phases. Isolate beforeFiles so moving this rule after public lookup
  // fails the regression instead of silently preserving the unit-test result.
  const beforeFiles = rewrites && !Array.isArray(rewrites) ? rewrites.beforeFiles : [];
  const response = await unstable_getResponseFromNextConfig({
    url,
    headers: cookie ? { cookie } : {},
    nextConfig: {
      ...nextConfig,
      rewrites: async () => ({ beforeFiles, afterFiles: [], fallback: [] }),
    },
  });
  return getRewrittenUrl(response);
}

describe("complaint attachment rewrites before public assets", () => {
  it.each(["legacy-evidence.jpeg", "opaque-reference.png"])(
    "routes %s to authentication before public lookup even without a cookie",
    async (filename) => {
      const rewritten = await rewriteBeforePublicLookup(`http://localhost/uploads/complaints/${filename}`);
      expect(rewritten).toBe(`http://localhost/api/complaints/attachments/${filename}`);
      const response = await getAttachment(new NextRequest(rewritten!), {
        params: Promise.resolve({ filename }),
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    },
  );

  it.each([["owner", owner], ["staff", staff]] as const)(
    "rejects legacy unissued JPEG references for authenticated %s without serving public bytes",
    async (_label, profile) => {
      const filename = "legacy-evidence.jpeg";
      const cookie = `campusgram_mock_session=${createMockSessionToken(profile, profile.id)}`;
      const rewritten = await rewriteBeforePublicLookup(`http://localhost/uploads/complaints/${filename}`, cookie);
      expect(rewritten).toBe(`http://localhost/api/complaints/attachments/${filename}`);
      const response = await getAttachment(new NextRequest(rewritten!, { headers: { Cookie: cookie } }), {
        params: Promise.resolve({ filename }),
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    },
  );

  it.each([
    "/uploads/lost-found/evidence.jpeg",
    "/uploads/complaints-other/evidence.jpeg",
    "/api/complaints/attachments/evidence.jpeg",
  ])("does not rewrite unrelated or already internal paths: %s", async (pathname) => {
    expect(await rewriteBeforePublicLookup(`http://localhost${pathname}`)).toBeNull();
  });
});
