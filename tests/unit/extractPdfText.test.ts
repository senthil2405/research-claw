/**
 * @vitest-environment node
 *
 * extractPdfText uses the pdfjs-dist legacy build, which is happiest in a real
 * Node environment (no jsdom DOM globals to confuse it).
 */
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "@/server/pdf";

async function makeTextPdf(pageTexts: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([612, 792]);
    page.drawText(text, { x: 50, y: 700, size: 20, font });
  }
  return doc.save();
}

describe("extractPdfText", () => {
  it("extracts text from every page with '--- Page N ---' separators", async () => {
    const bytes = await makeTextPdf([
      "Alpha unique marker one",
      "Beta unique marker two",
      "Gamma unique marker three",
    ]);
    // Contract note: pass a plain Uint8Array, not a Node Buffer.
    const text = await extractPdfText(new Uint8Array(bytes));

    expect(text).toContain("--- Page 1 ---");
    expect(text).toContain("--- Page 2 ---");
    expect(text).toContain("--- Page 3 ---");
    expect(text).toContain("Alpha unique marker one");
    expect(text).toContain("Beta unique marker two");
    expect(text).toContain("Gamma unique marker three");

    // Pages appear in order.
    expect(text.indexOf("Alpha")).toBeLessThan(text.indexOf("Beta"));
    expect(text.indexOf("Beta")).toBeLessThan(text.indexOf("Gamma"));
  });

  it("returns a page header even for an image-only / empty page", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]); // no text drawn
    const bytes = await doc.save();
    const text = await extractPdfText(new Uint8Array(bytes));
    expect(text).toContain("--- Page 1 ---");
  });
});
