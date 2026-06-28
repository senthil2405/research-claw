"use client";

import { useChatStore } from "@/store/chatStore";
import { normRectsToStyle } from "@/lib/selection";
import { useDocChatOptional } from "./DocChatContext";
import { placementFromElement } from "./placement";
import styles from "./HighlightLayer.module.css";

export interface HighlightLayerProps {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
}

export default function HighlightLayer({
  pageNumber,
  pageWidth,
  pageHeight,
}: HighlightLayerProps) {
  const docChat = useDocChatOptional();
  const hoveredHighlightId = useChatStore((s) => s.hoveredHighlightId);

  // No provider → no persisted highlights to render.
  if (!docChat) return null;

  const pageHighlights = docChat.highlights.filter(
    (h) => h.pageNumber === pageNumber,
  );
  if (pageHighlights.length === 0) return null;

  return (
    // NOTE: not aria-hidden — the children are real interactive buttons (each
    // highlight reopens its chat), so they must stay in the accessibility tree.
    <div className={styles.layer}>
      {pageHighlights.map((h) => {
        const active = h.id === hoveredHighlightId;
        return h.rects.map((rect, i) => {
          const { left, top, width, height } = normRectsToStyle(
            rect,
            pageWidth,
            pageHeight,
          );
          return (
            <button
              key={`${h.id}:${i}`}
              type="button"
              data-highlight-id={h.id}
              className={`${styles.box} ${active ? styles.boxActive : ""}`}
              style={{ left, top, width, height }}
              title={h.selectedText}
              aria-label="Open chat for this highlight"
              onClick={(e) =>
                docChat.openWindow(h.id, placementFromElement(e.currentTarget))
              }
            />
          );
        });
      })}
    </div>
  );
}
