import type { NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors, json } from "@/server/http";
import { clientIp, limitAll, ownerKey } from "@/server/ratelimit";
import { sendMessage, NotFoundError } from "@/server/services/chat";
import {
  CHAT_RATE_PER_IP,
  CHAT_RATE_PER_OWNER,
  MAX_QUESTION_CHARS,
  RATE_WINDOW_MS,
} from "@/lib/constants";
import type { SendMessageResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const owner = await resolveOwner();

  const rl = limitAll([
    { key: `chat:${ownerKey(owner)}`, limit: CHAT_RATE_PER_OWNER, windowMs: RATE_WINDOW_MS },
    { key: `chat-ip:${clientIp(req)}`, limit: CHAT_RATE_PER_IP, windowMs: RATE_WINDOW_MS },
  ]);
  if (!rl.ok) return httpErrors.tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpErrors.badRequest("Invalid JSON body");
  }

  const b = body as Record<string, unknown>;
  const highlightId = b?.highlightId;
  const question = b?.question;

  if (typeof highlightId !== "string" || highlightId.length === 0) {
    return httpErrors.badRequest("highlightId is required");
  }
  if (typeof question !== "string") {
    return httpErrors.badRequest("question must be a string");
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return httpErrors.badRequest(
      `question must be at most ${MAX_QUESTION_CHARS} characters`,
    );
  }

  try {
    const result = await sendMessage(owner, id, highlightId, question);
    return json<SendMessageResponse>(result);
  } catch (err) {
    if (err instanceof NotFoundError) return httpErrors.notFound();
    const msg = err instanceof Error ? err.message : "Internal server error";
    return httpErrors.serverError(msg);
  }
}
