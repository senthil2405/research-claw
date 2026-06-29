Improvement: Pinch-to-zoom and horizontal pan on the PDF viewer

Add native gesture support to the PDF scroll stage so users can pinch-to-zoom
on trackpads and touch screens, and pan left/right when the page is wider than
the viewport (zoomed past fit-width).

**Gesture coverage**
- Trackpad pinch (macOS/Windows): browsers fire `wheel` events with `ctrlKey=true`
  and a proportional `deltaY`. Intercept with a non-passive listener and map to
  viewerStore.setScale so the toolbar stays in sync.
- Touch screen pinch: two-finger `touchstart`/`touchmove` — compute the ratio of
  current vs initial finger distance and apply it to the current scale.
- Horizontal pan: already works via the stage's `overflow: auto` once the column
  is given a `minWidth` that equals `renderWidth + padding`, forcing the scroll
  container to expand past the viewport when zoomed in.

**What does NOT change**
- All existing toolbar zoom controls continue to work identically.
- The scale is stored in viewerStore (as `fitMode: "custom"`) — same code path
  as the toolbar's Zoom In / Zoom Out buttons.
- Vertical scroll, page-jump, and the virtualizer are untouched.

**Files changed**
- src/components/viewer/PdfViewer.tsx (event listeners + column minWidth)

**Tests**
- E2E: e2e/app.spec.ts — dispatch ctrl+wheel over the PDF stage and assert the
  toolbar zoom percentage increases beyond 100%.
