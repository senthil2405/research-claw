import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { resolveOwner } from "@/server/owner";
import { getAuthStatus, logoutUser } from "@/server/claudeCli";
import { json, httpErrors } from "@/server/http";
import type { ClaudeAuthStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId() {
  const o = await resolveOwner();
  return "userId" in o ? o.userId : null;
}

/** GET /api/me/claude-auth — current Claude authorization status (from DB flag). */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return httpErrors.unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { claudeAuthorized: true, claudeAuthorizedAt: true },
  });

  let connected = !!user?.claudeAuthorized;
  let authorizedAt = user?.claudeAuthorizedAt?.toISOString() ?? null;

  // If the flag is unset but the CLI still has a valid (persistent) login,
  // adopt it — so a restart doesn't show a misleading "not connected" and
  // trigger a needless re-authorization.
  if (!connected) {
    const status = await getAuthStatus(userId);
    if (status.connected) {
      connected = true;
      // Persist the flag only if the user row exists. A session cookie can
      // outlive its DB row (e.g. the dev DB was reset) — in that case report
      // the live status without crashing on a missing-record update.
      if (user) {
        try {
          const updated = await prisma.user.update({
            where: { id: userId },
            data: { claudeAuthorized: true, claudeAuthorizedAt: new Date() },
          });
          authorizedAt = updated.claudeAuthorizedAt?.toISOString() ?? null;
        } catch {
          /* row vanished between read and write — ignore */
        }
      }
    }
  }

  return json<ClaudeAuthStatus>({ connected, authorizedAt });
}

/** DELETE /api/me/claude-auth — log out the user's Claude session and clear the flag. */
export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return httpErrors.unauthorized();

  await logoutUser(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { claudeAuthorized: false, claudeAuthorizedAt: null },
  });

  return new NextResponse(null, { status: 204 });
}
