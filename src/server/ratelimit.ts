import type { OwnerRef } from "@/server/owner";

/**
 * In-memory fixed-window rate limiter. Sufficient because the app runs as a
 * SINGLE instance (the Claude CLI pins us to one machine). If we ever scale
 * horizontally, swap the Map for a shared store (e.g. Upstash Redis) behind the
 * same `rateLimit` signature.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

/** Consume one token for `key`. `now` is injectable for tests. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, limit, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  return { ok: true, limit, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Run several independent limits; return the first failure, else the last ok. */
export function limitAll(
  checks: { key: string; limit: number; windowMs: number }[],
): RateLimitResult {
  let last: RateLimitResult = {
    ok: true,
    limit: 0,
    remaining: 0,
    retryAfterSec: 0,
  };
  for (const c of checks) {
    const r = rateLimit(c.key, c.limit, c.windowMs);
    if (!r.ok) return r;
    last = r;
  }
  return last;
}

/** Best-effort client IP from proxy headers (Cloudflare/Fly set these). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Stable string key for an owner (logged-in user or anon session). */
export function ownerKey(owner: OwnerRef): string {
  return "userId" in owner ? `u:${owner.userId}` : `a:${owner.anonId}`;
}

/** Only clears state between tests — do not use in request paths. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
