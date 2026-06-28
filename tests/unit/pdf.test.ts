import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { getPageCount, isPdfMagic } from "@/server/pdf";

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return doc.save();
}

describe("isPdfMagic", () => {
  it("returns true for bytes starting with %PDF-", () => {
    const buf = Buffer.from("%PDF-1.7\n...rest...", "latin1");
    expect(isPdfMagic(buf)).toBe(true);
  });

  it("returns false for non-PDF bytes", () => {
    expect(isPdfMagic(Buffer.from("not a pdf at all"))).toBe(false);
    expect(isPdfMagic(Buffer.from("%PDx-"))).toBe(false);
  });

  it("returns false for a buffer shorter than the magic", () => {
    expect(isPdfMagic(Buffer.from("%PD"))).toBe(false);
    expect(isPdfMagic(new Uint8Array([]))).toBe(false);
  });
});

describe("getPageCount", () => {
  it("returns the correct count for a pdf-lib-generated buffer", async () => {
    const five = await makePdf(5);
    expect(await getPageCount(five)).toBe(5);

    const one = await makePdf(1);
    expect(await getPageCount(one)).toBe(1);
  });

  it("throws on garbage bytes", async () => {
    await expect(
      getPageCount(Buffer.from("this is definitely not a pdf")),
    ).rejects.toThrow(/Unable to parse PDF/);
  });
});
