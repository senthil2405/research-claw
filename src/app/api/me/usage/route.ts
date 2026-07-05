import { resolveOwner } from "@/server/owner";
import { json } from "@/server/http";
import { checkQuota } from "@/server/services/usage";
import type { UsageStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current owner's chat token budget (used/limit/remaining/period). */
export async function GET() {
  const owner = await resolveOwner();
  const q = await checkQuota(owner);
  return json<UsageStatus>({
    used: q.used,
    limit: q.limit,
    remaining: q.remaining,
    unlimited: q.unlimited,
    periodEnd: q.periodEnd,
    plan: q.plan,
  });
}
