import { NextRequest } from "next/server";
import { resolveOwner } from "@/server/owner";
import { startLogin } from "@/server/claudeCli";
import { json, httpErrors } from "@/server/http";
import type { ClaudeLoginStart } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId() {
  const o = await resolveOwner();
  return "userId" in o ? o.userId : null;
}

/**
 * POST /api/me/claude-auth/start — begin `claude auth login` and return the
 * authorization URL the user must open. Body: `{ console?: boolean }`
 * (defaults to the subscription/claude.ai flow).
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return httpErrors.unauthorized();

  let body: { console?: boolean } | null = null;
  try {
    body = (await req.json()) as { console?: boolean };
  } catch {
    body = null;
  }

  try {
    const { url } = await startLogin(userId, { console: !!body?.console });
    return json<ClaudeLoginStart>({ url });
  } catch (e) {
    return httpErrors.serverError(e instanceof Error ? e.message : String(e));
  }
}
