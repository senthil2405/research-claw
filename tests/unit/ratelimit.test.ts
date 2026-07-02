import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimitForTests,
  clientIp,
  limitAll,
  ownerKey,
  rateLimit,
} from "@/server/ratelimit";

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("allows up to the limit then blocks within the window", () => {
    const t0 = 1_000_000;
    const key = "k1";
    // limit=3, window=60s
    expect(rateLimit(key, 3, 60_000, t0).ok).toBe(true); // 1
    expect(rateLimit(key, 3, 60_000, t0).ok).toBe(true); // 2
    const third = rateLimit(key, 3, 60_000, t0);
    expect(third.ok).toBe(true); // 3
    expect(third.remaining).toBe(0);
    const blocked = rateLimit(key, 3, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const t0 = 2_000_000;
    const key = "k2";
    rateLimit(key, 1, 60_000, t0);
    expect(rateLimit(key, 1, 60_000, t0).ok).toBe(false);
    // Advance past the window.
    expect(rateLimit(key, 1, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const t0 = 3_000_000;
    expect(rateLimit("a", 1, 60_000, t0).ok).toBe(true);
    expect(rateLimit("b", 1, 60_000, t0).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000, t0).ok).toBe(false);
  });

  it("limitAll returns the first failing check", () => {
    __resetRateLimitForTests();
    // owner ok (limit 5) but ip exhausted (limit 1)
    rateLimit("ip:x", 1, 60_000);
    const r = limitAll([
      { key: "own:y", limit: 5, windowMs: 60_000 },
      { key: "ip:x", limit: 1, windowMs: 60_000 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("ownerKey distinguishes users from anon sessions", () => {
    expect(ownerKey({ userId: "u1" })).toBe("u:u1");
    expect(ownerKey({ anonId: "a1" })).toBe("a:a1");
  });

  it("clientIp reads x-forwarded-for first", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
});
