import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const FIXTURE_PATH = resolve(__dirname, "fixtures/sample.pdf");
export const FIXTURE_PAGES = 5;

/** Generate a small, multi-page PDF fixture before the suite runs. */
async function buildFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= FIXTURE_PAGES; i++) {
    const page = doc.addPage([612, 792]); // US Letter
    page.drawText(`Research Claw test PDF`, {
      x: 60,
      y: 700,
      size: 28,
      font,
      color: rgb(0.2, 0.12, 0.06),
    });
    page.drawText(`Page ${i} of ${FIXTURE_PAGES}`, {
      x: 60,
      y: 650,
      size: 18,
      font,
      color: rgb(0.4, 0.25, 0.12),
    });
  }
  const bytes = await doc.save();
  await mkdir(dirname(FIXTURE_PATH), { recursive: true });
  await writeFile(FIXTURE_PATH, bytes);
}

export default async function globalSetup() {
  await buildFixture();
}
