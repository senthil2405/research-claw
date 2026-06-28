import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only PDF libs: keep them out of the server bundle so they resolve
  // from node_modules at runtime. pdfjs-dist (used for server-side text
  // extraction) otherwise fails its fake-worker setup under Turbopack.
  serverExternalPackages: ["pdf-lib", "pdfjs-dist"],
  turbopack: {},
};

export default nextConfig;
