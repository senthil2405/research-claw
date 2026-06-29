"use client";

import { useChatStore } from "@/store/chatStore";
import { useDocChatOptional } from "./DocChatContext";
import styles from "./SelectionToolbar.module.css";

/** Small gap (px) between the selection and the button — kept close to the
 * highlighted text so it's easy to tap. */
const PAD = 4;
/** Approximate pill height (32px button + 4px padding each side). */
const TOOLBAR_HEIGHT = 40;

export default function SelectionToolbar() {
  const activeSelection = useChatStore((s) => s.activeSelection);
  const docChat = useDocChatOptional();

  // Nothing selected, or no chat provider mounted → render nothing.
  if (!activeSelection || !docChat) return null;

  const { bounds, pageBounds } = activeSelection;
  // Place the button next to the selection (thumb-friendly on mobile), on the
  // side with more room: left-half text → button to the RIGHT of the selection,
  // right-half text → button to the LEFT.
  const selCenterX = (bounds.left + bounds.right) / 2;
  const inLeftHalf = selCenterX < pageBounds.left + pageBounds.width / 2;
  const left = inLeftHalf ? bounds.right + PAD : bounds.left - PAD;

  // Default below the selection; if it's near the bottom of the viewport (no
  // room for the pill below), flip it above so it stays on-screen and reachable.
  const viewportH =
    typeof window !== "undefined" ? window.innerHeight : 800;
  const placeAbove = bounds.bottom + PAD + TOOLBAR_HEIGHT > viewportH;
  const top = placeAbove ? bounds.top - PAD : bounds.bottom + PAD;

  // Anchor corner: left edge for left-half (else shift left by own width);
  // top edge when below (else shift up by own height).
  const transform = `translate(${inLeftHalf ? "0" : "-100%"}, ${
    placeAbove ? "-100%" : "0"
  })`;

  return (
    <div
      className={styles.toolbar}
      style={{ left, top, transform }}
      // Don't let interacting with the toolbar collapse the text selection.
      onMouseDown={(e) => e.preventDefault()}
      role="toolbar"
    >
      <button
        type="button"
        className={styles.button}
        aria-label="Ask Claude about this"
        title="Ask Claude (⌘↵ / Ctrl+Enter)"
        onClick={() => docChat.startChatFromSelection()}
      >
        <svg
          width="18"
          height="18"
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
    </div>
  );
}
