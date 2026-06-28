"use client";

import { useMemo } from "react";
import { useViewerStore } from "@/store/viewerStore";
import { useChatStore } from "@/store/chatStore";
import { useDocChatOptional } from "./DocChatContext";
import { placementFromElement } from "./placement";
import type { HighlightDTO } from "@/lib/types";
import styles from "./ChatHistoryPanel.module.css";

/**
 * Right-hand collapsible panel listing every chat (highlight) created in the
 * PDF — mirrors the left thumbnail rail. Clicking an entry scrolls to that
 * page and opens the chat window; hovering previews (highlights) the section.
 * Renders nothing when closed or when no chat provider is mounted.
 */
export function ChatHistoryPanel() {
  const open = useViewerStore((s) => s.chatsPanelOpen);
  const requestScroll = useViewerStore((s) => s.requestScroll);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const setHovered = useChatStore((s) => s.setHovered);
  const docChat = useDocChatOptional();

  const sorted = useMemo(() => {
    const list = docChat?.highlights ?? [];
    return [...list].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0);
    });
  }, [docChat?.highlights]);

  if (!open || !docChat) return null;

  const goTo = (h: HighlightDTO) => {
    setCurrentPage(h.pageNumber);
    requestScroll(h.pageNumber);
    setHovered(h.id);
    // The target page scrolls into view asynchronously; once its highlight is in
    // the DOM, open the window beside it. Retry across a few frames, then fall
    // back to the default position if the page never rendered the highlight.
    let tries = 0;
    const tryOpen = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-highlight-id="${h.id}"]`,
      );
      if (el) {
        docChat.openWindow(h.id, placementFromElement(el));
      } else if (tries++ < 30) {
        requestAnimationFrame(tryOpen);
      } else {
        docChat.openWindow(h.id);
      }
    };
    requestAnimationFrame(tryOpen);
  };

  return (
    <aside className={styles.panel} aria-label="Chats in this PDF">
      <div className={styles.header}>
        Chats
        <span className={styles.count}>{sorted.length}</span>
      </div>
      {sorted.length === 0 ? (
        <p className={styles.empty}>
          No chats yet. Highlight text in the PDF and ask Claude to start one.
        </p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={styles.item}
                onClick={() => goTo(h)}
                onMouseEnter={() => setHovered(h.id)}
                onMouseLeave={() => setHovered(null)}
                title={h.selectedText}
              >
                <span className={styles.page}>p.{h.pageNumber}</span>
                <span className={styles.snippet}>
                  {h.selectedText.replace(/\s+/g, " ").trim() || "(highlight)"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export default ChatHistoryPanel;
