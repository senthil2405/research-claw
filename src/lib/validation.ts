import { z } from "zod";

import { MAX_UPLOAD_BYTES, PDF_MIME } from "@/lib/constants";
import { isPdfMagic } from "@/server/pdf";

/** Query params for list endpoints. */
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export interface UploadValidationOk {
  ok: true;
  buffer: Buffer;
  filename: string;
  sizeBytes: number;
}

export type UploadValidationResult =
  | UploadValidationOk
  | { ok: false; status: number; message: string };

/** Strip any path components and return a safe basename, defaulting to "document.pdf". */
function sanitizeFilename(name: string | undefined | null): string {
  if (!name) return "document.pdf";
  // Take the last segment for both POSIX and Windows separators.
  const base = name.split(/[/\\]/).pop()?.trim() ?? "";
  // Drop any residual NUL bytes and leading dots-only names.
  const cleaned = base.replace(/\0/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "document.pdf";
  return cleaned;
}

/**
 * Validate a multipart upload File as a PDF. Pure: no Next.js objects involved.
 * Returns the read Buffer so the route does not need to re-read the stream.
 *
 * Status codes: 400 missing, 413 too large, 415 wrong type / bad magic.
 */
export async function validatePdfUpload(
  file: File | null,
): Promise<UploadValidationResult> {
  if (!file) {
    return { ok: false, status: 400, message: "No file provided" };
  }

  const filename = sanitizeFilename(file.name);
  const declaredType = (file.type ?? "").toLowerCase();
  const looksPdf =
    declaredType === PDF_MIME || filename.toLowerCase().endsWith(".pdf");
  if (!looksPdf) {
    return { ok: false, status: 415, message: "Unsupported media type" };
  }

  // Cheap pre-check via the declared size before buffering.
  if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, message: "File too large" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Authoritative size check against actual bytes.
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, message: "File too large" };
  }

  if (buffer.length === 0) {
    return { ok: false, status: 400, message: "Empty file" };
  }

  if (!isPdfMagic(buffer)) {
    return { ok: false, status: 415, message: "Not a valid PDF" };
  }

  return {
    ok: true,
    buffer,
    filename,
    sizeBytes: buffer.length,
  };
}
