import type { NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors, json } from "@/server/http";
import { sendMessage, NotFoundError } from "@/server/services/chat";
import type { SendMessageResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const owner = await resolveOwner();

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

  try {
    const result = await sendMessage(owner, id, highlightId, question);
    return json<SendMessageResponse>(result);
  } catch (err) {
    if (err instanceof NotFoundError) return httpErrors.notFound();
    const msg = err instanceof Error ? err.message : "Internal server error";
    return httpErrors.serverError(msg);
  }
}
