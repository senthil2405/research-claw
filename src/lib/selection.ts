// Pure geometry helpers for PDF text selection. No React, no DOM globals —
// everything operates on plain rects/objects passed in, so these are
// straightforward to unit-test.

import type { NormRect } from "@/lib/types";

/** Clamp a value to the [0, 1] range. */
function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Convert absolute client rects of a selection into page-normalized rects
 * (0..1 of the page width/height). Coordinates are made relative to the page
 * element, clamped to [0,1], and zero-area rects are dropped.
 */
export function clientRectsToNormRects(
  rects: DOMRectList | DOMRect[],
  pageRect: { left: number; top: number; width: number; height: number },
): NormRect[] {
  const { left, top, width, height } = pageRect;
  if (width <= 0 || height <= 0) return [];

  const out: NormRect[] = [];
  // DOMRectList isn't a real array; index into it manually so both inputs work.
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!r || r.width <= 0 || r.height <= 0) continue;

    const x = clamp01((r.left - left) / width);
    const y = clamp01((r.top - top) / height);
    // Clamp the far edge too, then derive w/h so the box stays within [0,1].
    const right = clamp01((r.left + r.width - left) / width);
    const bottom = clamp01((r.top + r.height - top) / height);

    const w = right - x;
    const h = bottom - y;
    if (w <= 0 || h <= 0) continue;

    out.push({ x, y, w, h });
  }
  return out;
}

/**
 * Convert a normalized rect back to pixel offsets for rendering within a page
 * element of the given pixel dimensions.
 */
export function normRectsToStyle(
  rect: NormRect,
  pageWidth: number,
  pageHeight: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x * pageWidth,
    top: rect.y * pageHeight,
    width: rect.w * pageWidth,
    height: rect.h * pageHeight,
  };
}

/**
 * Position the chat window next to the highlighted text, placed on whichever
 * sides of the selection have the most room — decided by which quadrant of the
 * page the selection occupies:
 *   - selection in the LEFT half  → window to the RIGHT of the selection
 *   - selection in the RIGHT half → window to the LEFT of the selection
 *   - selection in the TOP half   → window BELOW the selection's bottom line
 *   - selection in the BOTTOM half → window ABOVE the selection's top line
 * So a top-left selection gets a window at its bottom-right corner, etc. The
 * result is clamped to stay within the viewport, and never placed above `minTop`
 * (the bottom of the PDF toolbar) so the window header stays reachable.
 * All coords are viewport px.
 */
export function chatWindowPos(
  sel: { top: number; bottom: number; left: number; right: number },
  page: { left: number; top: number; width: number; height: number },
  win: { width: number; height: number },
  viewport: { width: number; height: number },
  minTop = 0,
  gap = 12,
): { x: number; y: number } {
  const { width: vw, height: vh } = viewport;
  const { width: w, height: h } = win;

  const selCenterX = (sel.left + sel.right) / 2;
  const selCenterY = (sel.top + sel.bottom) / 2;
  const pageCenterX = page.left + page.width / 2;
  const pageCenterY = page.top + page.height / 2;

  const inLeftHalf = selCenterX < pageCenterX;
  const inTopHalf = selCenterY < pageCenterY;

  // Horizontal: open toward the page center (the roomier side).
  let x = inLeftHalf ? sel.right + gap : sel.left - gap - w;
  // Vertical: top half → below the last line; bottom half → above the first.
  let y = inTopHalf ? sel.bottom + gap : sel.top - gap - h;

  x = Math.min(Math.max(0, x), Math.max(0, vw - w));
  // Keep the top below the toolbar; if the window is taller than the available
  // space, prefer pinning the top (header reachable) over fitting the bottom.
  const maxY = Math.max(minTop, vh - h);
  y = Math.min(Math.max(minTop, y), maxY);
  return { x: Math.round(x), y: Math.round(y) };
}

