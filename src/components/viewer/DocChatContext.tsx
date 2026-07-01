"use client";

import { createContext, useContext } from "react";
import type { HighlightDTO } from "@/lib/types";
import type { WindowPlacement } from "./placement";

export interface DocChatContextValue {
  documentId: string;
  filename: string;
  highlights: HighlightDTO[];
  /** Create a highlight from the current chatStore.activeSelection and open its window. */
  startChatFromSelection: () => void;
  /** Create an unanchored chat window (no selected text) pointing to page 1. */
  startChatNoSelection: () => void;
  /**
   * Open (or focus/un-minimize) the chat window for a highlight. Pass the
   * highlight's on-screen placement (its bounds + page rect) so the window opens
   * next to the text by page quadrant rather than at a fixed corner.
   */
  openWindow: (highlightId: string, placement?: WindowPlacement) => void;
}

export const DocChatContext = createContext<DocChatContextValue | null>(null);

/** Returns the context, or null when no provider is mounted (chat disabled). */
export function useDocChatOptional(): DocChatContextValue | null {
  return useContext(DocChatContext);
}
