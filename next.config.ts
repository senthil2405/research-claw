import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle (.next/standalone) for a small
  // runtime container image. Required for the Fly.io Docker deployment.
  output: "standalone",
  // Server-only PDF libs: keep them out of the server bundle so they resolve
  // from node_modules at runtime. pdfjs-dist (used for server-side text
  // extraction) otherwise fails its fake-worker setup under Turbopack.
  serverExternalPackages: ["pdf-lib", "pdfjs-dist"],
  turbopack: {},
};

export default nextConfig;
