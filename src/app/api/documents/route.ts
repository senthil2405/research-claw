import type { NextRequest } from "next/server";

import { resolveOwner } from "@/server/owner";
import { error, httpErrors, json } from "@/server/http";
import { clientIp, limitAll, ownerKey } from "@/server/ratelimit";
import { createDocument, listDocuments } from "@/server/services/documents";
import { validatePdfUpload } from "@/lib/validation";
import { RATE_WINDOW_MS, UPLOAD_RATE_PER_OWNER } from "@/lib/constants";
import type { DocumentListResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const owner = await resolveOwner();

  const rl = limitAll([
    { key: `upload:${ownerKey(owner)}`, limit: UPLOAD_RATE_PER_OWNER, windowMs: RATE_WINDOW_MS },
    { key: `upload-ip:${clientIp(req)}`, limit: UPLOAD_RATE_PER_OWNER * 2, windowMs: RATE_WINDOW_MS },
  ]);
  if (!rl.ok) return httpErrors.tooManyRequests(rl.retryAfterSec);

  const form = await req.formData();
  const entry = form.get("file");
  // Treat a non-File entry (e.g. a stray string field) as a missing file.
  const file = entry instanceof File ? entry : null;

  const v = await validatePdfUpload(file);
  if (!v.ok) {
    return error(v.message, v.status);
  }

  try {
    const meta = await createDocument(owner, {
      buffer: v.buffer,
      filename: v.filename,
      sizeBytes: v.sizeBytes,
    });
    return json(meta, { status: 201 });
  } catch (err) {
    // getPageCount throws "Unable to parse PDF: ..." on bytes that pass the
    // magic check but aren't a parseable PDF — surface that as 415. Any other
    // failure (e.g. DB/file store) is a server error.
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("Unable to parse PDF")) {
      return httpErrors.unsupportedMediaType("Not a valid PDF");
    }
    return httpErrors.serverError();
  }
}

export async function GET() {
  const owner = await resolveOwner();
  const documents = await listDocuments(owner);
  return json<DocumentListResponse>({ documents });
}
