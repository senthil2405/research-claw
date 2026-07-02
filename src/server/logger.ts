import pino from "pino";

/**
 * Structured JSON logger (stdout — the host ships it to the log sink).
 * Redaction + an allowlisted helper API keep secrets and user content (PDF/chat
 * text, emails, keys) out of logs. Prefer the typed helpers below over free-form
 * logging so sensitive fields are never passed in by accident.
 */
export const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "apiKey",
      "password",
      "token",
      "secret",
      "*.apiKey",
      "*.password",
      "*.token",
      "*.secret",
      "anthropicKeyEnc",
    ],
    remove: true,
  },
});

/** Per-turn LLM usage — the cost/observability "money event". No content. */
export function logLlmTurn(e: {
  documentId: string;
  highlightId: string;
  mock: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  ok: boolean;
}): void {
  logger.info({ evt: "llm_turn", ...e }, "llm turn");
}

/** A rate limit was hit. Key is already opaque (owner id / hashed ip). */
export function logRateLimitHit(e: { route: string; key: string }): void {
  logger.warn({ evt: "rate_limited", ...e }, "rate limited");
}

/** An unexpected server error, with safe context only (no request bodies). */
export function logError(
  err: unknown,
  ctx: Record<string, string | number | boolean> = {},
): void {
  logger.error(
    { evt: "error", err: err instanceof Error ? err.message : String(err), ...ctx },
    "server error",
  );
}

/** A previously-silent cleanup failure worth surfacing (non-fatal). */
export function logWarn(
  message: string,
  ctx: Record<string, string | number | boolean> = {},
): void {
  logger.warn({ evt: "warn", ...ctx }, message);
}
