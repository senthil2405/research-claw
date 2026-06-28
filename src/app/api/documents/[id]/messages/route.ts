import type { NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors, json } from "@/server/http";
import { listMessages, NotFoundError } from "@/server/services/chat";
import type { ChatMessageDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const owner = await resolveOwner();

  const highlightId = req.nextUrl.searchParams.get("highlightId") ?? undefined;

  try {
    const messages = await listMessages(owner, id, highlightId);
    return json<{ messages: ChatMessageDTO[] }>({ messages });
  } catch (err) {
    if (err instanceof NotFoundError) return httpErrors.notFound();
    throw err;
  }
}
