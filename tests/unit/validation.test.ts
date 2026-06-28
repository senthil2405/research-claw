import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { validatePdfUpload } from "@/lib/validation";

async function pdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  return doc.save();
}

describe("validatePdfUpload", () => {
  it("returns ok for a valid PDF File", async () => {
    const bytes = await pdfBytes();
    const file = new File([new Uint8Array(bytes)], "paper.pdf", {
      type: "application/pdf",
    });

    const res = await validatePdfUpload(file);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.filename).toBe("paper.pdf");
      expect(res.sizeBytes).toBe(bytes.length);
      expect(res.buffer.length).toBe(bytes.length);
    }
  });

  it("returns 400 when no file is provided", async () => {
    const res = await validatePdfUpload(null);
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("returns 415 for a non-PDF file (wrong type and extension)", async () => {
    const file = new File(["hello world"], "notes.txt", {
      type: "text/plain",
    });
    const res = await validatePdfUpload(file);
    expect(res).toMatchObject({ ok: false, status: 415 });
  });

  it("returns 415 for a .pdf-named file with bad magic bytes", async () => {
    const file = new File(["GIF89a not a pdf"], "fake.pdf", {
      type: "application/pdf",
    });
    const res = await validatePdfUpload(file);
    expect(res).toMatchObject({ ok: false, status: 415 });
    if (!res.ok) expect(res.message).toMatch(/valid PDF/i);
  });

  it("returns 413 for an oversized file (stubbed size)", async () => {
    const file = new File(["%PDF-1.7"], "huge.pdf", {
      type: "application/pdf",
    });
    // Stub the declared size to exceed the 25 MB cap.
    Object.defineProperty(file, "size", { value: 26214400 + 1 });
    const res = await validatePdfUpload(file);
    expect(res).toMatchObject({ ok: false, status: 413 });
  });
});
