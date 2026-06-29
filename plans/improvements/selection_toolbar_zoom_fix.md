Fix: SelectionToolbar position drift on PDF zoom

When the user selects text and then changes the PDF zoom level (via pinch-to-zoom
or the toolbar buttons), the "Ask Claude about this" floating button (SelectionToolbar)
renders at the wrong viewport position.

**Root cause**

`useTextSelection` captures `activeSelection.bounds` using `getBoundingClientRect()`
at mouse-up time — these are viewport-space coordinates at the zoom level active
during the selection. Changing zoom causes the PDF pages to re-render at a new
`renderWidth`, which shifts the visual position of all text in the viewport.
The stored bounds are now stale, but the toolbar uses them directly for its
`position: fixed` coordinates, so it appears at the original (wrong) location.

**Fix**

In `DocChatProvider.tsx`, subscribe to `viewerStore.scale` and call
`setSelection(null)` whenever it changes. The `SelectionToolbar` returns `null`
when `activeSelection` is falsy, so it unmounts immediately on any zoom change.
The user simply re-selects text after zooming to re-invoke the button — the
same behavior as native PDF viewers (Chrome, macOS Preview, Firefox).

**Files changed**

- `src/components/viewer/DocChatProvider.tsx`
  - Added `useEffect` import
  - Imported `useViewerStore` from `@/store/viewerStore`
  - Added effect: `useEffect(() => { setSelection(null); }, [scale, setSelection])`

**What does NOT change**

- Open `ChatWindow` components are unaffected — they use `position: fixed` with
  stored `{x, y}` and are not repositioned on zoom (they stay where the user
  dragged them, which is the expected behavior for floating windows).
- Toolbar zoom buttons, pinch-to-zoom, and touch pinch all trigger this path
  identically since they all mutate `viewerStore.scale`.
- No store shape changes, no new API routes, no DB migrations.

**Tests**

- TypeScript: `npx tsc --noEmit` — clean
- Unit: `npx vitest run` — 23 files, 151 tests, all pass
