"use client";

import { useEffect, useRef, useState } from "react";
import HighlightLayer from "./HighlightLayer";
import { useChatStore } from "@/store/chatStore";
import { useDocChatOptional } from "./DocChatContext";
import { normRectsToStyle } from "@/lib/selection";
import { placementFromElement } from "./placement";
import styles from "./PageChatOverlay.module.css";

export interface PageChatOverlayProps {
  pageNumber: number;
}

/**
 * Per-page chat overlay rendered inside each PdfPage. It measures its own box
 * (which equals the rendered page size) and renders the persisted highlight
 * boxes plus a small "reopen" chip near any highlight whose chat window is
 * currently minimized. Hovering a chip emphasizes the highlight (the
 * "hover shows which text the window is about" behavior). No-ops when no
 * DocChatProvider is mounted, so PdfPage stays usable without chat.
 */
export default function PageChatOverlay({ pageNumber }: PageChatOverlayProps) {
  const docChat = useDocChatOptional();
  const windows = useChatStore((s) => s.windows);
  const setHovered = useChatStore((s) => s.setHovered);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  if (!docChat) return null;

  const pageHighlights = docChat.highlights.filter(
    (h) => h.pageNumber === pageNumber,
  );
  const minimizedIds = new Set(
    windows.filter((w) => w.minimized).map((w) => w.highlightId),
  );

  return (
    <div ref={ref} className={styles.overlay}>
      <HighlightLayer
        pageNumber={pageNumber}
        pageWidth={size.w}
        pageHeight={size.h}
      />
      {size.w > 0 &&
        pageHighlights.map((h) => {
          if (!minimizedIds.has(h.id)) return null;
          const first = h.rects[0];
          if (!first) return null;
          const { left, top, width } = normRectsToStyle(first, size.w, size.h);
          return (
            <button
              key={h.id}
              type="button"
              className={styles.chip}
              style={{ left: left + width, top }}
              title={h.selectedText}
              aria-label="Reopen chat for this highlight"
              onMouseEnter={() => setHovered(h.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) =>
                docChat.openWindow(h.id, placementFromElement(e.currentTarget))
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </button>
          );
        })}
    </div>
  );
}
