import type { NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors } from "@/server/http";
import { streamMessage, NotFoundError } from "@/server/services/chat";
import type { ChatStreamEvent } from "@/lib/types";

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

  const encoder = new TextEncoder();
  const encode = (event: ChatStreamEvent) =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await streamMessage(owner, id, highlightId, question, (delta) => {
          controller.enqueue(encode({ type: "delta", text: delta }));
        });
        controller.enqueue(
          encode({
            type: "done",
            userMessage: result.userMessage,
            assistantMessage: result.assistantMessage,
          }),
        );
      } catch (err) {
        const message =
          err instanceof NotFoundError
            ? "Not found"
            : err instanceof Error
              ? err.message
              : "Internal server error";
        controller.enqueue(encode({ type: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so tokens flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
