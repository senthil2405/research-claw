# Changelog

All notable changes to Research Claw are recorded here.
Each entry documents what changed, why, how it was built, and what tests gate it.

---

## [Unreleased] — 2026-06-29

### Feature: Dark mode with persistent toggle

**Plan:** `plans/improvements/dark_mode.md`

**What changed**

| File | Change |
|---|---|
| `src/styles/theme.css` | Added `html.dark { ... }` block with warm dark palette; layout/typography tokens moved to a shared `:root, html.dark` block so they apply in both modes |
| `src/app/layout.tsx` | Inline blocking `<script>` in `<head>` reads `localStorage` and applies `dark` class to `<html>` before React hydrates — prevents any flash of the wrong theme |
| `src/store/uiStore.ts` | Added `darkMode: boolean`, `toggleDarkMode()`, `setDarkMode(b)` to `UiState` |
| `src/components/layout/AppShell.tsx` | Two `useEffect` hooks: (1) hydrate `darkMode` from `localStorage` on mount; (2) sync `html.dark` class and persist on every change |
| `src/components/viewer/icons/index.tsx` | Added `MoonIcon` (crescent) and `SunIcon` (sun + rays) |
| `src/components/sidebar/Sidebar.module.css` | New `.headerEnd` flex wrapper for right-side header buttons; shared `.collapse` / `.iconSmall` selector |
| `src/components/sidebar/Sidebar.tsx` | Dark toggle in expanded sidebar header (between brand and collapse) and in collapsed mini-rail |
| `src/components/viewer/PdfToolbar.tsx` | Dark toggle between Go-to-top and the Chat History panel toggle |

**How it works**

The entire app uses CSS custom properties (`var(--bg-app)`, `var(--text-primary)`,
etc.) for every colour.  Adding `html.dark { ... }` in `theme.css` is enough to
recolour all components simultaneously — no per-component changes needed.

PDF page backgrounds stay white (`--pdf-page-bg: #ffffff`) in both modes: the document
content itself is light and inverting it would make it unreadable.

State lives in `uiStore.darkMode` (same store as `sidebarCollapsed`). The preference is
persisted to `localStorage` under the key `rc-dark-mode`. A tiny blocking `<script>` in
the page `<head>` applies the class before React hydrates so there is no visible flash
when loading with a saved dark preference.

**Dark palette (warm, matches Research Claw's terracotta identity)**

| Token | Light | Dark |
|---|---|---|
| `--bg-app` | `#f5f4ee` | `#1b1a18` |
| `--bg-surface` | `#faf9f5` | `#232220` |
| `--bg-sidebar` | `#f0eee6` | `#1f1e1c` |
| `--accent` | `#d97757` | `#e08560` (lifted for dark bg) |
| `--text-primary` | `#141413` | `#f0ede6` |
| `--pdf-stage-bg` | `#e8e6de` | `#111110` |
| `--pdf-page-bg` | `#ffffff` | `#ffffff` ← unchanged |

**Sanity tests**

- TypeScript: `npx tsc --noEmit` — clean
- Lint: 0 errors (pre-existing warnings only)
- Unit: `npx vitest run` — 23 files, 151 tests, all pass
- E2E: `npx playwright test` — 10/10 pass

---

## [Unreleased] — 2026-06-28

### Project setup

**Git initialisation + initial commit**

- Patched `.gitignore` to exclude root-level `dev.db`, `/tmp`, `/*.pdf`
  (sample paper PDFs at root), and added `!.env.example` so the env template
  is tracked despite the `/.env*` rule.
- Staged and committed 168 source files as the baseline snapshot.
  Excluded: `node_modules`, `.next`, `storage/`, `prisma/dev.db`, `test-results`.
- The test fixture PDF (`e2e/fixtures/sample.pdf`, 2 KB) is intentionally tracked
  because E2E tests depend on it.

---

### Feature: Chat count badge on the toolbar chat-history toggle

**Plan:** `plans/improvements/chat_badge.md`

**What changed**

| File | Change |
|---|---|
| `src/components/viewer/PdfToolbar.tsx` | Imported `useDocChatOptional`; derived `chatCount = highlights.length`; wrapped the chat-panel button in a `chatPanelWrap` div; rendered a `chatBadge` span (hidden at 0, capped at `99+`) |
| `src/components/viewer/PdfToolbar.module.css` | Added `.chatPanelWrap` (`position: relative`) and `.chatBadge` (`position: absolute`, top-right, accent colour pill) |

**How it works**

`PdfToolbar` is mounted inside `DocChatProvider` (see `DocViewer.tsx`), so it
can call `useDocChatOptional()` to read the live `highlights` array without any
prop drilling or new state. The badge re-renders automatically whenever a
highlight is created or deleted.

**Sanity tests**

- *Unit* — `src/components/viewer/__tests__/PdfToolbar.test.tsx` (new file, 5 tests):
  - No badge when `highlights = []`
  - Badge shows `"1"` with `aria-label="1 chats"` for one highlight
  - Badge shows correct count for multiple highlights
  - Badge shows `"99+"` for 100+ highlights
  - Badge updates on rerender when highlight list changes
  - **Result: 5/5 pass**
- *E2E* — assertion added to `e2e/chathistory.spec.ts`: after creating a chat
  and closing its window, `[aria-label="1 chats"]` must be visible in the toolbar.

---

### Feature: Date-grouped document history in the left sidebar

**Plan:** `plans/improvements/sidebar_date_groups.md`

**What changed**

| File | Change |
|---|---|
| `src/components/sidebar/DocumentHistoryList.tsx` | Replaced the flat "Recents" list with time-period groups. Exported pure helpers `getDateBucket` and `groupDocsByDate`. Renders a `.groupLabel` heading above each non-empty bucket. |
| `src/components/sidebar/DocumentHistoryList.module.css` | Added `.groupLabel` (11 px, uppercase, muted — same visual language as the old `.sectionLabel`). Removed the now-unused `.sectionLabel` from the rendered output (class kept in CSS for potential reuse). |

**Buckets (relative to midnight local time)**

| Label | Range |
|---|---|
| Today | 0 days ago |
| Yesterday | 1 day ago |
| This week | 2–6 days ago |
| This month | 7–29 days ago |
| Older | 30+ days ago |

Empty buckets are omitted entirely. The existing `DocumentHistoryItem` is
reused unchanged inside each group.

**Sanity tests**

- *Unit* — `src/components/sidebar/__tests__/DocumentHistoryList.test.tsx` (rewritten, 14 tests):
  - `getDateBucket`: today, yesterday, this-week (2/3/6 days), this-month (7/15/29 days), older (30 days)
  - `groupDocsByDate`: single Today group, omits empty buckets, Today-before-Older ordering, empty input
  - Component: filenames under correct label, multiple group labels for mixed dates, authenticated/logged-out empty states, skeleton while loading
  - **Result: 14/14 pass**
- *E2E* — new test added to `e2e/sidebar.spec.ts`: upload a PDF → sidebar shows
  `"Today"` group label within 15 s.

---

### Feature: PDF title in document history sidebar rows

**Plan:** `plans/improvements/document_title.md`

**What changed**

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `title String?` field to `Document` model |
| `prisma/migrations/20260628155916_add_document_title/migration.sql` | `ALTER TABLE "Document" ADD COLUMN "title" TEXT` |
| `src/server/pdf.ts` | Added `getPdfTitle(buf)` — reads `/Title` from PDF Info Dictionary via `pdf-lib`; returns `null` (never throws) when absent or on parse error |
| `src/server/services/documents.ts` | `createDocument` now runs `getPdfTitle` in parallel with `getPageCount` via `Promise.all`; stores result in `title` column; `toDocumentMeta` exposes it |
| `src/lib/types.ts` | Added `title: string \| null` to `DocumentMeta` |
| `src/components/sidebar/DocumentHistoryItem.tsx` | Renders a `<span className={styles.docTitle}>` between filename and meta when `doc.title` is non-null |
| `src/components/sidebar/DocumentHistoryItem.module.css` | Added `.docTitle` (11.5 px, `text-secondary`, ellipsis-truncated) |

**How it works**

At upload time `createDocument` calls both `getPageCount` (throws on invalid PDF
→ maps to 415) and `getPdfTitle` (silent null on failure) in parallel. The title
is stored once on the `Document` row and returned in every subsequent
`listDocuments` / `getOwnedDocument` response. PDFs with no `/Title` metadata
(scanned docs, most test fixtures) simply show `null` and the title line is
omitted — the row looks identical to its pre-feature appearance.

**Sanity tests**

- *Unit* — `tests/unit/pdf.test.ts` (4 new tests added):
  - Returns correct title when set via `PDFDocument.setTitle`
  - Returns `null` when no title is set
  - Returns `null` for whitespace-only title
  - Returns `null` for garbage bytes without throwing
- *Unit* — `src/components/sidebar/__tests__/DocumentHistoryItem.test.tsx` (new file, 4 tests):
  - Renders the filename
  - Renders the title line when `doc.title` is non-null
  - Omits the title line when `doc.title` is null
  - Renders page count in the meta line
  - **Result: 13/13 pass across both files**
- *E2E* — No new E2E test needed; `sample.pdf` (the E2E fixture) has no PDF
  title metadata so the row renders identically to before, meaning all existing
  E2E tests continue to pass unmodified.

---

### Feature: Chat-panel icon changed to speech-bubble

**What changed**

| File | Change |
|---|---|
| `src/components/viewer/icons/index.tsx` | Replaced `ChatPanelIcon` path (panel-with-lines) with a MessageSquare speech-bubble path (`M21 15a2 2 0 0 1-2 2H7l-4 4V5…`) |

**How it works**

The icon is a single `<path>` SVG inside the existing `ChatPanelIcon` export;
no other files needed to change. The badge and aria-label from the chat-badge
feature are unaffected.

---

### Feature: Pinch-to-zoom on the PDF viewer

**Plan:** `plans/improvements/pinch_zoom.md`

**What changed**

| File | Change |
|---|---|
| `src/components/viewer/PdfViewer.tsx` | Added `SCALE_MIN = 0.25` / `SCALE_MAX = 5` constants; `data-pdf-stage` attribute on the stage div; `minWidth: renderWidth + STAGE_PADDING_X` on the column div for horizontal scroll; two new `useEffect` blocks for trackpad pinch (`ctrl+wheel`) and touch pinch |

**How it works**

Trackpad pinch fires `wheel` events with `ctrlKey=true`. A non-passive listener
intercepts them, calls `preventDefault()` (stops the browser from zooming the
whole page), and updates `viewerStore.setScale` with an exponential feel
(`scale * Math.exp(-deltaY / 300)`). Touch pinch computes the ratio of current
vs initial two-finger distance and applies it to the current scale.

Both effects use `[numPages]` as dependency (not `[]`) — this matches the
existing `ResizeObserver` pattern because `stageRef.current` is `null` while
react-pdf renders its loading state instead of the stage element.

When zoomed past fit-width, the column's `minWidth` forces the stage's
`overflow: auto` to produce a horizontal scrollbar so the user can pan left/right.

**Sanity tests**

- *E2E* — `e2e/pinchzoom.spec.ts` (new file): dispatches `ctrl+wheel` (`deltaY: -120`) over `[data-pdf-stage]`, asserts toolbar zoom rises above 100%; then dispatches `deltaY: 400` and asserts zoom drops below 100%.
- TypeScript: clean

---

### Bug fix: SelectionToolbar position drift on PDF zoom

**Plan:** `plans/improvements/selection_toolbar_zoom_fix.md`

**What changed**

| File | Change |
|---|---|
| `src/components/viewer/DocChatProvider.tsx` | Added `useEffect` + `useViewerStore` import; effect calls `setSelection(null)` whenever `viewerStore.scale` changes |

**Root cause**

`useTextSelection` captures `activeSelection.bounds` via `getBoundingClientRect()`
at mouse-up time (viewport coordinates at the current zoom). When pinch-to-zoom or
toolbar zoom changes the scale, the PDF re-renders at a new `renderWidth` and all
text shifts to new viewport positions. The stored bounds become stale, so the
`position: fixed` SelectionToolbar renders at the old (now wrong) screen location.

**How it works**

`DocChatProvider` subscribes to `viewerStore.scale`. On any change it clears
`activeSelection`, which causes `SelectionToolbar` to unmount immediately.
Users re-select text after zooming — the standard behavior in native PDF viewers.
Open `ChatWindow` components are unaffected (they use stored `{x, y}` and stay
where the user placed them).

**Sanity tests**

- TypeScript: `npx tsc --noEmit` — clean
- Unit: `npx vitest run` — 23 files, 151 tests, all pass
