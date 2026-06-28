import type { NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors, json } from "@/server/http";
import {
  createHighlight,
  listHighlights,
  NotFoundError,
} from "@/server/services/chat";
import type { HighlightDTO, NormRect } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const owner = await resolveOwner();

  try {
    const highlights = await listHighlights(owner, id);
    return json<{ highlights: HighlightDTO[] }>({ highlights });
  } catch (err) {
    if (err instanceof NotFoundError) return httpErrors.notFound();
    throw err;
  }
}

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
  if (
    typeof b?.pageNumber !== "number" ||
    !Array.isArray(b?.rects) ||
    typeof b?.selectedText !== "string"
  ) {
    return httpErrors.badRequest(
      "Expected { pageNumber: number, rects: array, selectedText: string }",
    );
  }

  try {
    const dto = await createHighlight(owner, id, {
      pageNumber: b.pageNumber,
      rects: b.rects as NormRect[],
      selectedText: b.selectedText,
    });
    return json(dto, { status: 201 });
  } catch (err) {
    if (err instanceof NotFoundError) return httpErrors.notFound();
    throw err;
  }
}
