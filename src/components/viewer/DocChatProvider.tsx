"use client";

import { useCallback, useMemo, type ReactNode, type RefObject } from "react";
import { DocChatContext, type DocChatContextValue } from "./DocChatContext";
import { useChatStore, DEFAULT_WINDOW_SIZE } from "@/store/chatStore";
import { chatWindowPos } from "@/lib/selection";
import { windowTopBoundary, type WindowPlacement } from "./placement";
import { useHighlights } from "@/hooks/useHighlights";
import { useCreateHighlight } from "@/hooks/useCreateHighlight";
import { useTextSelection } from "@/hooks/useTextSelection";
import SelectionToolbar from "./SelectionToolbar";
import ChatWindow from "./ChatWindow";

export interface DocChatProviderProps {
  documentId: string;
  /** The scroll-stage element that contains the PDF pages (for selection). */
  stageRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Wires the selection → highlight → chat-window flow together: provides the
 * DocChatContext, runs the text-selection watcher over the stage, and renders
 * the selection toolbar plus one ChatWindow per open window.
 */
export function DocChatProvider({
  documentId,
  stageRef,
  children,
}: DocChatProviderProps) {
  const { highlights } = useHighlights(documentId);
  const createHighlight = useCreateHighlight(documentId);
  const setSelection = useChatStore((s) => s.setSelection);
  const openWindowStore = useChatStore((s) => s.openWindow);
  const windows = useChatStore((s) => s.windows);

  // Publish text selections into the chat store.
  useTextSelection(stageRef);

  const startChatFromSelection = useCallback(() => {
    const sel = useChatStore.getState().activeSelection;
    if (!sel || createHighlight.isPending) return;
    // Capture the selection's geometry now (the DOM selection is cleared on
    // success) so the window opens next to the text by page quadrant.
    const pos = chatWindowPos(
      sel.bounds,
      sel.pageBounds,
      DEFAULT_WINDOW_SIZE,
      { width: window.innerWidth, height: window.innerHeight },
      windowTopBoundary(),
    );
    createHighlight.mutate(
      {
        pageNumber: sel.pageNumber,
        rects: sel.rects,
        selectedText: sel.selectedText,
      },
      {
        onSuccess: (h) => {
          openWindowStore(h.id, pos);
          setSelection(null);
          window.getSelection()?.removeAllRanges();
        },
      },
    );
  }, [createHighlight, openWindowStore, setSelection]);

  const openWindow = useCallback(
    (id: string, placement?: WindowPlacement) => {
      if (!placement) {
        openWindowStore(id);
        return;
      }
      const pos = chatWindowPos(
        placement.bounds,
        placement.page,
        DEFAULT_WINDOW_SIZE,
        { width: window.innerWidth, height: window.innerHeight },
        windowTopBoundary(),
      );
      openWindowStore(id, pos);
    },
    [openWindowStore],
  );

  const value = useMemo<DocChatContextValue>(
    () => ({ documentId, highlights, startChatFromSelection, openWindow }),
    [documentId, highlights, startChatFromSelection, openWindow],
  );

  return (
    <DocChatContext.Provider value={value}>
      {children}
      <SelectionToolbar />
      {windows.map((w) => {
        const h = highlights.find((x) => x.id === w.highlightId);
        return (
          <ChatWindow
            key={w.highlightId}
            highlightId={w.highlightId}
            selectedText={h?.selectedText ?? ""}
          />
        );
      })}
    </DocChatContext.Provider>
  );
}

export default DocChatProvider;
