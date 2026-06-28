import { NextResponse, type NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors, json } from "@/server/http";
import {
  deleteDocument,
  getOwnedDocument,
  toDocumentMeta,
} from "@/server/services/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const owner = await resolveOwner();

  const doc = await getOwnedDocument(owner, id);
  if (!doc) return httpErrors.notFound();

  return json(toDocumentMeta(doc));
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const owner = await resolveOwner();

  const deleted = await deleteDocument(owner, id);
  if (!deleted) return httpErrors.notFound();

  return new NextResponse(null, { status: 204 });
}
