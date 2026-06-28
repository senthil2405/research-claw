import { NextResponse, type NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors } from "@/server/http";
import { deleteHighlight, NotFoundError } from "@/server/services/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; hid: string }> };

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id, hid } = await ctx.params;
  const owner = await resolveOwner();

  try {
    const deleted = await deleteHighlight(owner, id, hid);
    if (!deleted) return httpErrors.notFound();
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof NotFoundError) return httpErrors.notFound();
    throw err;
  }
}
