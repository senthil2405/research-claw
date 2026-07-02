import { z } from "zod";

/**
 * Boot-time environment validation. Called once from `src/instrumentation.ts`
 * when the Node server starts. Fails fast on misconfiguration so a broken or
 * insecure deploy never serves traffic.
 *
 * Philosophy: lenient in dev/test (SQLite default, mock LLM, no secrets needed),
 * strict in production (real secrets required, dev-login bypass forbidden).
 */

const isProd = process.env.NODE_ENV === "production";

// Shape checks that apply in every environment. Everything is optional here;
// hard *presence* requirements are enforced below only for production.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  DATABASE_URL: z.string().min(1).optional(),
  ALLOW_DEV_LOGIN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional(),
});

export function validateEnv(): void {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Invalid environment configuration:\n" +
        parsed.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n"),
    );
  }

  // Fail-closed security rule: the one-click dev login must never be reachable
  // in production (it authenticates as a fixed user with no credentials).
  if (isProd && process.env.ALLOW_DEV_LOGIN === "true") {
    throw new Error(
      "ALLOW_DEV_LOGIN must not be enabled in production (one-click login bypass).",
    );
  }

  // Required secrets in production. In dev/test these have safe fallbacks
  // (SQLite default DATABASE_URL; crypto derives a key from AUTH_SECRET).
  if (isProd) {
    const missing: string[] = [];
    if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
    // Production supplies the connection string base64-encoded (DATABASE_URL_B64,
    // decoded at runtime in src/server/db.ts); accept either form.
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_B64) {
      missing.push("DATABASE_URL (or DATABASE_URL_B64)");
    }
    // Dedicated encryption key so rotating AUTH_SECRET never bricks stored
    // BYOK keys (see src/server/crypto.ts).
    if (!process.env.APP_ENCRYPTION_KEY) missing.push("APP_ENCRYPTION_KEY");
    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missing.join(", ")}`,
      );
    }
  }
}
