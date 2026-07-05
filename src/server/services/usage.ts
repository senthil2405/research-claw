import { prisma } from "@/server/db";
import type { OwnerRef } from "@/server/owner";
import { ownerKey } from "@/server/ratelimit";
import { ANON_TRIAL_TOKENS, FREE_MONTHLY_TOKENS } from "@/lib/constants";

// Per-owner token metering. We bill on BILLABLE tokens (completion + uncached
// prompt) so that replaying a long, prefix-cached thread barely dents the
// budget — matching what OpenRouter actually charges. See `src/server/llm.ts`.
//
// - Logged-in accounts: FREE_MONTHLY_TOKENS, renewing each calendar month
//   (reset lazily on the first turn of a new month). `plan` in {paid,unlimited}
//   bypasses the budget entirely.
// - Anonymous visitors: ANON_TRIAL_TOKENS, one-time (never resets).

export interface QuotaStatus {
  /** Whether the owner may start another turn. */
  ok: boolean;
  /** Billable tokens consumed this period. */
  used: number;
  /** Budget for this period; null when unlimited. */
  limit: number | null;
  /** Remaining budget; null when unlimited. */
  remaining: number | null;
  unlimited: boolean;
  /** End of the current period (ISO); null for anon (one-time) or unlimited. */
  periodEnd: string | null;
  /** "free" | "paid" | "unlimited" for accounts, "anon" for anonymous. */
  plan: string;
}

interface UsageInput {
  documentId?: string | null;
  model: string;
  promptTokens: number | null;
  cachedTokens: number | null;
  completionTokens: number | null;
  costCredits: number | null;
}

const startOfMonth = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

const startOfNextMonth = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

const sameMonth = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth();

/** User-facing message when a turn is blocked by the budget. */
export function quotaExceededMessage(status: QuotaStatus): string {
  if (status.plan === "anon") {
    return "You've used your free trial tokens. Sign in to keep chatting with your monthly allowance.";
  }
  return "You've used all your monthly tokens. Upgrade to continue chatting.";
}

/** Billable tokens for a turn: completion + prompt not served from cache. */
export function billableTokens(input: {
  promptTokens: number | null;
  cachedTokens: number | null;
  completionTokens: number | null;
}): number {
  const prompt = input.promptTokens ?? 0;
  const cached = input.cachedTokens ?? 0;
  const completion = input.completionTokens ?? 0;
  return completion + Math.max(0, prompt - cached);
}

/** Current-period consumption, applying the lazy monthly reset (read-only). */
function effectiveConsumed(
  meter: { consumed: number; periodStart: Date } | null,
  monthly: boolean,
  now: Date,
): number {
  if (!meter) return 0;
  if (monthly && !sameMonth(meter.periodStart, now)) return 0; // rolled over
  return meter.consumed;
}

/** Read the owner's quota status (no side effects). */
export async function checkQuota(
  owner: OwnerRef,
  now: Date = new Date(),
): Promise<QuotaStatus> {
  const key = ownerKey(owner);
  const monthly = "userId" in owner;

  if (monthly) {
    const user = await prisma.user.findUnique({
      where: { id: owner.userId },
      select: { plan: true },
    });
    const plan = user?.plan ?? "free";
    if (plan === "paid" || plan === "unlimited") {
      return {
        ok: true,
        used: 0,
        limit: null,
        remaining: null,
        unlimited: true,
        periodEnd: null,
        plan,
      };
    }
    const meter = await prisma.usageMeter.findUnique({
      where: { ownerKey: key },
    });
    const used = effectiveConsumed(meter, true, now);
    const remaining = Math.max(0, FREE_MONTHLY_TOKENS - used);
    return {
      ok: remaining > 0,
      used,
      limit: FREE_MONTHLY_TOKENS,
      remaining,
      unlimited: false,
      periodEnd: startOfNextMonth(now).toISOString(),
      plan,
    };
  }

  // Anonymous: one-time trial.
  const meter = await prisma.usageMeter.findUnique({ where: { ownerKey: key } });
  const used = effectiveConsumed(meter, false, now);
  const remaining = Math.max(0, ANON_TRIAL_TOKENS - used);
  return {
    ok: remaining > 0,
    used,
    limit: ANON_TRIAL_TOKENS,
    remaining,
    unlimited: false,
    periodEnd: null,
    plan: "anon",
  };
}

/**
 * Record a turn's usage: append a ledger row and advance the owner's meter
 * (applying the lazy monthly reset for accounts). Called after each turn.
 */
export async function recordUsage(
  owner: OwnerRef,
  input: UsageInput,
  now: Date = new Date(),
): Promise<void> {
  const key = ownerKey(owner);
  const monthly = "userId" in owner;
  const effective = billableTokens(input);

  await prisma.usageEvent.create({
    data: {
      ownerKey: key,
      documentId: input.documentId ?? null,
      model: input.model,
      promptTokens: input.promptTokens ?? 0,
      cachedTokens: input.cachedTokens ?? 0,
      completionTokens: input.completionTokens ?? 0,
      effectiveTokens: effective,
      costCredits: input.costCredits ?? 0,
    },
  });

  const meter = await prisma.usageMeter.findUnique({ where: { ownerKey: key } });
  const periodStart = monthly ? startOfMonth(now) : now;
  if (!meter) {
    await prisma.usageMeter.create({
      data: { ownerKey: key, consumed: effective, periodStart },
    });
    return;
  }
  const rolledOver = monthly && !sameMonth(meter.periodStart, now);
  await prisma.usageMeter.update({
    where: { ownerKey: key },
    data: rolledOver
      ? { consumed: effective, periodStart }
      : { consumed: { increment: effective } },
  });
}
