import { NextResponse } from "next/server";
import { resolveOwner } from "@/server/owner";
import { error, httpErrors, json } from "@/server/http";
import {
  deleteUserApiKey,
  getUserKeyStatus,
  InvalidKeyError,
  setUserApiKey,
} from "@/server/services/claudeKey";
import type { ClaudeKeyStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve the current request's logged-in user id, or null for anon sessions. */
async function requireUserId(): Promise<string | null> {
  const o = await resolveOwner();
  return "userId" in o ? o.userId : null;
}

/** GET — return the non-sensitive status of the user's stored Anthropic key. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return httpErrors.unauthorized();
  return json<ClaudeKeyStatus>(await getUserKeyStatus(userId));
}

/** PUT — validate, encrypt, and store the user's Anthropic key. */
export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (!userId) return httpErrors.unauthorized();

  let apiKey: unknown;
  try {
    const body = (await req.json()) as { apiKey?: unknown };
    apiKey = body?.apiKey;
  } catch {
    return httpErrors.badRequest("API key required");
  }

  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return httpErrors.badRequest("API key required");
  }

  try {
    const status = await setUserApiKey(userId, apiKey);
    return json<ClaudeKeyStatus>(status);
  } catch (e) {
    if (e instanceof InvalidKeyError) {
      return error(e.reason ?? e.message, 400);
    }
    return httpErrors.serverError();
  }
}

/** DELETE — remove the user's stored Anthropic key. */
export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return httpErrors.unauthorized();
  await deleteUserApiKey(userId);
  return new NextResponse(null, { status: 204 });
}
