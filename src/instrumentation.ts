/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * We use it to validate environment configuration and fail fast on a broken or
 * insecure deploy before any request is served.
 */
export async function register() {
  // Only the Node runtime has the full env + our server modules.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/server/env");
    validateEnv();
  }
}
