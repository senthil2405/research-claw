import { PDFDocument } from "pdf-lib";

import { PDF_MAGIC } from "@/lib/constants";

/** True iff the first 5 bytes equal the PDF magic ("%PDF-"). */
export function isPdfMagic(buf: Buffer | Uint8Array): boolean {
  if (buf.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (buf[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

/**
 * Parse a PDF and return its page count. Throws a clear Error if the bytes
 * cannot be parsed as a PDF (caller should treat as an invalid upload).
 * Encrypted-but-readable PDFs are tolerated via ignoreEncryption.
 */
export async function getPageCount(buf: Buffer | Uint8Array): Promise<number> {
  try {
    const doc = await PDFDocument.load(buf, {
      updateMetadata: false,
      ignoreEncryption: true,
    });
    return doc.getPageCount();
  } catch (err) {
    throw new Error(
      `Unable to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Extract the plain text of a PDF for use as model context. Uses the pdfjs-dist
 * legacy build, which runs in Node without a browser worker. Pages are joined
 * with form-feed-ish separators so the model can tell pages apart. Never
 * throws on a bad page — it skips it and continues; returns "" if nothing is
 * extractable (e.g. a scanned/image-only PDF).
 */
export async function extractPdfText(buf: Buffer | Uint8Array): Promise<string> {
  // Dynamic import: the legacy build is ESM and must not be bundled for the edge.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // In Node we run without a separate worker thread.
  // (GlobalWorkerOptions.workerSrc left unset → pdfjs uses its fake worker.)
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const parts: string[] = [];
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      try {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/[ \t]+/g, " ")
          .trim();
        parts.push(`--- Page ${pageNum} ---\n${text}`);
        page.cleanup();
      } catch {
        // Skip unreadable pages but keep going.
        parts.push(`--- Page ${pageNum} ---\n`);
      }
    }
  } finally {
    await doc.destroy();
  }
  return parts.join("\n\n").trim();
}
