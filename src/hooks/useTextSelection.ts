"use client";

import { useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { clientRectsToNormRects } from "@/lib/selection";

/**
 * Watches for text selections inside the PDF stage and publishes them to the
 * chat store as `activeSelection` (or clears it when the selection collapses).
 *
 * Anchors to the page element that contains the selection's *start* node; this
 * keeps multi-page selections simple — we normalize the rects against that one
 * page and ignore the geometry that bleeds onto later pages.
 */
export function useTextSelection(stageRef: React.RefObject<HTMLElement | null>) {
  const setSelection = useChatStore((s) => s.setSelection);

  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }

      const selectedText = sel.toString().trim();
      if (!selectedText) {
        setSelection(null);
        return;
      }

      const stage = stageRef.current;
      if (!stage) {
        setSelection(null);
        return;
      }

      // Resolve the start node to an element we can walk up from.
      const anchorNode = sel.anchorNode;
      const startEl =
        anchorNode && anchorNode.nodeType === Node.ELEMENT_NODE
          ? (anchorNode as Element)
          : anchorNode?.parentElement ?? null;

      if (!startEl || !stage.contains(startEl)) {
        // Selection lives outside the PDF stage — ignore it entirely.
        return;
      }

      const pageEl = startEl.closest<HTMLElement>("[data-page-number]");
      if (!pageEl || !stage.contains(pageEl)) {
        setSelection(null);
        return;
      }

      const pageNumber = Number(pageEl.dataset.pageNumber);
      if (!Number.isFinite(pageNumber)) {
        setSelection(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const clientRects = range.getClientRects();
      if (clientRects.length === 0) {
        setSelection(null);
        return;
      }

      const pageBox = pageEl.getBoundingClientRect();
      const rects = clientRectsToNormRects(clientRects, {
        left: pageBox.left,
        top: pageBox.top,
        width: pageBox.width,
        height: pageBox.height,
      });
      if (rects.length === 0) {
        setSelection(null);
        return;
      }

      // The selection toolbar anchors to the *first line* of the selection.
      // getClientRects() returns one rect per line in document order, so
      // clientRects[0] is the start of the highlighted text.
      const firstLine = clientRects[0];
      const anchor = {
        x: (firstLine.left + firstLine.right) / 2,
        y: firstLine.top,
      };

      // Full viewport bounding box of the selected text (top/bottom/left/right),
      // used to place the chat window by page quadrant. We skip container rects:
      // multi-line / cross-block selections include huge boxes spanning whole
      // text blocks or pages, which would blow the bounding box up to the full
      // page. A real text line is never taller than half the page.
      const maxLineHeight = pageBox.height * 0.5;
      let bTop = Infinity;
      let bBottom = -Infinity;
      let bLeft = Infinity;
      let bRight = -Infinity;
      for (let i = 0; i < clientRects.length; i++) {
        const r = clientRects[i];
        if (r.width <= 0 || r.height <= 0 || r.height > maxLineHeight) continue;
        if (r.top < bTop) bTop = r.top;
        if (r.bottom > bBottom) bBottom = r.bottom;
        if (r.left < bLeft) bLeft = r.left;
        if (r.right > bRight) bRight = r.right;
      }
      // Fall back to the first line if every rect was filtered out.
      const bounds =
        bLeft === Infinity
          ? {
              top: firstLine.top,
              bottom: firstLine.bottom,
              left: firstLine.left,
              right: firstLine.right,
            }
          : { top: bTop, bottom: bBottom, left: bLeft, right: bRight };

      const pageBounds = {
        left: pageBox.left,
        top: pageBox.top,
        width: pageBox.width,
        height: pageBox.height,
      };

      setSelection({
        pageNumber,
        rects,
        selectedText,
        anchor,
        bounds,
        pageBounds,
      });
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [stageRef, setSelection]);
}
