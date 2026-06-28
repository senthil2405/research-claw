/**
 * Build the placement payload for opening a chat window next to an on-screen
 * element (a highlight box, a minimized chip, etc.): its viewport bounds plus
 * the rect of the PDF page it lives on. The page rect lets chatWindowPos decide
 * which quadrant the selection occupies. Falls back to the element itself if it
 * isn't inside a page (shouldn't happen in practice).
 */
export interface WindowPlacement {
  bounds: { top: number; bottom: number; left: number; right: number };
  page: { left: number; top: number; width: number; height: number };
}

export function placementFromElement(el: Element): WindowPlacement {
  const r = el.getBoundingClientRect();
  const pageEl = el.closest("[data-page-number]");
  const p = (pageEl ?? el).getBoundingClientRect();
  return {
    bounds: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
    page: { left: p.left, top: p.top, width: p.width, height: p.height },
  };
}

/** Small gap kept between the PDF toolbar and the top of a chat window. */
const TOOLBAR_GAP = 8;
/** Fallback toolbar height (matches --toolbar-height) when it can't be measured. */
const FALLBACK_TOOLBAR_HEIGHT = 48;

/**
 * The minimum viewport y a chat window's top may occupy: just below the PDF
 * toolbar, so its header (resize/minimize/close) is never hidden behind it.
 */
export function windowTopBoundary(): number {
  if (typeof document === "undefined") return FALLBACK_TOOLBAR_HEIGHT + TOOLBAR_GAP;
  const el = document.querySelector("[data-pdf-toolbar]");
  const bottom = el
    ? el.getBoundingClientRect().bottom
    : FALLBACK_TOOLBAR_HEIGHT;
  return Math.round(bottom + TOOLBAR_GAP);
}
