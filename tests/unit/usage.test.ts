/**
 * @vitest-environment node
 *
 * Token-metering service. prisma is fully mocked (no DB). Covers the billable-
 * token formula, the lazy monthly reset for accounts, the one-time anon trial,
 * and the unlimited-plan bypass.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerRef } from "@/server/owner";
import { ANON_TRIAL_TOKENS, FREE_MONTHLY_TOKENS } from "@/lib/constants";

const userFindUnique = vi.fn(async (_a?: unknown): Promise<unknown> => null);
const meterFindUnique = vi.fn(async (_a?: unknown): Promise<unknown> => null);
const meterCreate = vi.fn(async (_a?: unknown) => ({}));
const meterUpdate = vi.fn(async (_a?: unknown) => ({}));
const eventCreate = vi.fn(async (_a?: unknown) => ({}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    usageMeter: {
      findUnique: (a: unknown) => meterFindUnique(a),
      create: (a: unknown) => meterCreate(a),
      update: (a: unknown) => meterUpdate(a),
    },
    usageEvent: { create: (a: unknown) => eventCreate(a) },
  },
}));

import {
  billableTokens,
  checkQuota,
  recordUsage,
} from "@/server/services/usage";

const user: OwnerRef = { userId: "u1" };
const anon: OwnerRef = { anonId: "a1" };
const MAR = new Date(Date.UTC(2026, 2, 15)); // 2026-03-15
const APR = new Date(Date.UTC(2026, 3, 2)); // 2026-04-02

beforeEach(() => {
  userFindUnique.mockReset();
  meterFindUnique.mockReset();
  meterCreate.mockClear();
  meterUpdate.mockClear();
  eventCreate.mockClear();
  meterFindUnique.mockResolvedValue(null);
});

describe("billableTokens", () => {
  it("charges completion + uncached prompt", () => {
    expect(
      billableTokens({ promptTokens: 1000, cachedTokens: 800, completionTokens: 200 }),
    ).toBe(400);
  });
  it("treats nulls as zero and never goes negative", () => {
    expect(
      billableTokens({ promptTokens: null, cachedTokens: 999, completionTokens: null }),
    ).toBe(0);
  });
});

describe("checkQuota", () => {
  it("anon: full trial when unused, keyed by anonId", async () => {
    const q = await checkQuota(anon, MAR);
    expect(q).toMatchObject({
      ok: true,
      used: 0,
      limit: ANON_TRIAL_TOKENS,
      remaining: ANON_TRIAL_TOKENS,
      plan: "anon",
      periodEnd: null,
    });
    expect(meterFindUnique).toHaveBeenCalledWith({ where: { ownerKey: "a:a1" } });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("anon: blocked when the one-time trial is spent (no reset)", async () => {
    meterFindUnique.mockResolvedValue({
      consumed: ANON_TRIAL_TOKENS,
      periodStart: new Date(Date.UTC(2026, 0, 1)),
    });
    const q = await checkQuota(anon, MAR);
    expect(q.ok).toBe(false);
    expect(q.remaining).toBe(0);
  });

  it("user free: within budget", async () => {
    userFindUnique.mockResolvedValue({ plan: "free" });
    const q = await checkQuota(user, MAR);
    expect(q).toMatchObject({
      ok: true,
      used: 0,
      limit: FREE_MONTHLY_TOKENS,
      unlimited: false,
      plan: "free",
    });
    expect(q.periodEnd).toBe(new Date(Date.UTC(2026, 3, 1)).toISOString());
  });

  it("user free: blocked when the monthly budget is spent", async () => {
    userFindUnique.mockResolvedValue({ plan: "free" });
    meterFindUnique.mockResolvedValue({
      consumed: FREE_MONTHLY_TOKENS,
      periodStart: new Date(Date.UTC(2026, 2, 1)),
    });
    const q = await checkQuota(user, MAR);
    expect(q.ok).toBe(false);
    expect(q.remaining).toBe(0);
  });

  it("user free: last month's usage doesn't count (lazy reset)", async () => {
    userFindUnique.mockResolvedValue({ plan: "free" });
    meterFindUnique.mockResolvedValue({
      consumed: FREE_MONTHLY_TOKENS,
      periodStart: new Date(Date.UTC(2026, 2, 1)), // March
    });
    const q = await checkQuota(user, APR); // April
    expect(q.ok).toBe(true);
    expect(q.used).toBe(0);
  });

  it("user unlimited plan: always ok, no limit", async () => {
    userFindUnique.mockResolvedValue({ plan: "unlimited" });
    const q = await checkQuota(user, MAR);
    expect(q).toMatchObject({ ok: true, unlimited: true, limit: null, remaining: null });
    expect(meterFindUnique).not.toHaveBeenCalled();
  });
});

describe("recordUsage", () => {
  const turn = {
    documentId: "d1",
    model: "gemini-2.5-flash",
    promptTokens: 1000,
    cachedTokens: 800,
    completionTokens: 200,
    costCredits: 0.001,
  };

  it("always writes a ledger row with effective tokens", async () => {
    await recordUsage(user, turn, MAR);
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerKey: "u:u1",
        effectiveTokens: 400,
        costCredits: 0.001,
      }),
    });
  });

  it("creates the meter on first use", async () => {
    await recordUsage(user, turn, MAR);
    expect(meterCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerKey: "u:u1", consumed: 400 }),
    });
  });

  it("increments the meter within the same month", async () => {
    meterFindUnique.mockResolvedValue({
      consumed: 100,
      periodStart: new Date(Date.UTC(2026, 2, 1)),
    });
    await recordUsage(user, turn, MAR);
    expect(meterUpdate).toHaveBeenCalledWith({
      where: { ownerKey: "u:u1" },
      data: { consumed: { increment: 400 } },
    });
  });

  it("resets the meter when the month rolled over", async () => {
    meterFindUnique.mockResolvedValue({
      consumed: 99999,
      periodStart: new Date(Date.UTC(2026, 2, 1)), // March
    });
    await recordUsage(user, turn, APR); // April
    expect(meterUpdate).toHaveBeenCalledWith({
      where: { ownerKey: "u:u1" },
      data: expect.objectContaining({ consumed: 400 }),
    });
  });
});
