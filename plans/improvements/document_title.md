Improvement: Show PDF title in document history sidebar rows

Each row in the document history list currently shows filename + page count +
date. Add a second line showing the paper's human-readable title (read from the
PDF's Info Dictionary `/Title` field) so users can tell at a glance what a file
is about without relying on a meaningful filename.

**Behaviour**
- Title is extracted at upload time from pdf-lib's PDFDocument.getTitle().
- If the PDF has no title metadata (common for scanned docs or plain PDFs) the
  field is null and the title line is simply omitted from the UI — the row looks
  exactly as it does today.
- The title is stored on the Document row so it is never re-parsed on every
  request.

**Data flow**
  Upload → server/pdf.ts (getPdfTitle) → services/documents.ts (createDocument)
  → Document.title column → toDocumentMeta → DocumentMeta.title
  → DocumentHistoryItem (title line)

**Files changed**
- prisma/schema.prisma              (add title String? to Document)
- prisma/migrations/<ts>_add_document_title/migration.sql
- src/server/pdf.ts                 (add getPdfTitle)
- src/server/services/documents.ts  (call getPdfTitle, store + expose title)
- src/lib/types.ts                  (add title: string | null to DocumentMeta)
- src/components/sidebar/DocumentHistoryItem.tsx  (render title line)
- src/components/sidebar/DocumentHistoryItem.module.css (.docTitle style)

**Tests**
- tests/unit/pdf.test.ts                          (getPdfTitle unit tests)
- src/components/sidebar/__tests__/DocumentHistoryItem.test.tsx (new file)
- Existing E2E tests continue to pass (sample.pdf has no title → row renders as before)
