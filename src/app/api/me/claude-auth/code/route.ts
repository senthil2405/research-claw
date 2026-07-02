import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { resolveOwner } from "@/server/owner";
import { submitLoginCode } from "@/server/claudeCli";
import { json, error, httpErrors } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { RATE_WINDOW_MS, SECRET_RATE_PER_OWNER } from "@/lib/constants";
import type { ClaudeAuthStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId() {
  const o = await resolveOwner();
  return "userId" in o ? o.userId : null;
}

/**
 * POST /api/me/claude-auth/code — submit the authorization code pasted by the
 * user. Requires a prior `start` call (the pending login is held in memory).
 * Body: `{ code: string }`.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return httpErrors.unauthorized();

  const rl = rateLimit(`claude-auth:${userId}`, SECRET_RATE_PER_OWNER, RATE_WINDOW_MS);
  if (!rl.ok) return httpErrors.tooManyRequests(rl.retryAfterSec);

  let body: { code?: string } | null = null;
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    body = null;
  }

  const code = body?.code?.trim();
  if (!code) return httpErrors.badRequest("Code required");

  try {
    await submitLoginCode(userId, code);
  } catch (e) {
    // Bad code / no pending login → client error.
    return error(e instanceof Error ? e.message : String(e), 400);
  }

  // The login succeeded (credential is stored by the CLI). Persist the flag
  // best-effort — a session cookie can outlive its DB row (e.g. dev DB reset),
  // so don't fail the request if the user row is missing.
  const authorizedAt = new Date();
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { claudeAuthorized: true, claudeAuthorizedAt: authorizedAt },
    });
  } catch {
    /* no user row for this session — the CLI login still applies */
  }

  return json<ClaudeAuthStatus>({
    connected: true,
    authorizedAt: authorizedAt.toISOString(),
  });
}
