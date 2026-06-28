import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { httpErrors } from "@/server/http";
import { localFileStore } from "@/server/files/localStore";
import { getOwnedDocument } from "@/server/services/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type RangeResult =
  | { kind: "full" }
  | { kind: "range"; start: number; end: number }
  | { kind: "unsatisfiable" };

/**
 * Parse a single HTTP byte range against a known content size.
 * Supports `bytes=start-end`, `bytes=start-`, and suffix `bytes=-N`.
 * A missing/unparseable header is treated as a full-content request.
 */
function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: "full" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "full" }; // Per spec: ignore malformed ranges.

  const startStr = match[1];
  const endStr = match[2];

  let start: number;
  let end: number;

  if (startStr === "") {
    // Suffix range: last N bytes.
    if (endStr === "") return { kind: "unsatisfiable" };
    const suffixLen = Number(endStr);
    if (suffixLen === 0) return { kind: "unsatisfiable" };
    start = Math.max(size - suffixLen, 0);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === "" ? size - 1 : Math.min(Number(endStr), size - 1);
  }

  if (start > end || start >= size || start < 0) {
    return { kind: "unsatisfiable" };
  }

  return { kind: "range", start, end };
}

/** Make a filename safe for a Content-Disposition quoted-string. */
function sanitizeHeaderFilename(name: string): string {
  const cleaned = name
    // Strip control chars (incl. CR/LF) to prevent header injection.
    .replace(/[\x00-\x1f\x7f]/g, "")
    // Drop chars that would break the quoted-string.
    .replace(/["\\]/g, "")
    .trim();
  return cleaned || "document.pdf";
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const owner = await resolveOwner();

  const doc = await getOwnedDocument(owner, id);
  if (!doc) return httpErrors.notFound();

  const { size } = await localFileStore.stat(doc.storedName);

  const dispositionName = sanitizeHeaderFilename(doc.filename);
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `inline; filename="${dispositionName}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  const parsed = parseRange(req.headers.get("range"), size);

  if (parsed.kind === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  if (parsed.kind === "range") {
    const { start, end } = parsed;
    const nodeStream = localFileStore.createReadStream(doc.storedName, {
      start,
      end,
    });
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
    return new NextResponse(webStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const nodeStream = localFileStore.createReadStream(doc.storedName);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  return new NextResponse(webStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
