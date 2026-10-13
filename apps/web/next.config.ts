import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@smart-campus/contracts",
    "@smart-campus/complaint-intelligence",
    "@smart-campus/lost-and-found",
    "@smart-campus/ui",
    "@smart-campus/utils",
  ],
  reactStrictMode: true,
  async rewrites() {
    return {
      // Run before public-file lookup so legacy evidence cannot bypass auth.
      beforeFiles: [
        {
          source: "/uploads/complaints/:filename",
          destination: "/api/complaints/attachments/:filename",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
