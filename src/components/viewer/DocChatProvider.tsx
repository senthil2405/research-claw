"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DocChatContext, type DocChatContextValue } from "./DocChatContext";
import { useChatStore, DEFAULT_WINDOW_SIZE } from "@/store/chatStore";
import { chatWindowPos } from "@/lib/selection";
import { windowTopBoundary, type WindowPlacement } from "./placement";
import { useHighlights } from "@/hooks/useHighlights";
import { useCreateHighlight } from "@/hooks/useCreateHighlight";
import { useDeleteHighlight } from "@/hooks/useDeleteHighlight";
import { useTextSelection } from "@/hooks/useTextSelection";
import { useViewerStore } from "@/store/viewerStore";
import type { ChatMessageDTO } from "@/lib/types";
import SelectionToolbar from "./SelectionToolbar";
import ChatWindow from "./ChatWindow";

export interface DocChatProviderProps {
  documentId: string;
  filename: string;
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
  filename,
  stageRef,
  children,
}: DocChatProviderProps) {
  const { highlights } = useHighlights(documentId);
  const createHighlight = useCreateHighlight(documentId);
  const deleteHighlight = useDeleteHighlight(documentId);
  const setSelection = useChatStore((s) => s.setSelection);
  const openWindowStore = useChatStore((s) => s.openWindow);
  const closeWindowStore = useChatStore((s) => s.closeWindow);
  const windows = useChatStore((s) => s.windows);
  const queryClient = useQueryClient();

  // Tracks a highlight created by startChatNoSelection that has no messages yet.
  // If the user navigates to another chat before sending any message, this empty
  // highlight is auto-deleted so it doesn't linger in the sidebar.
  const pendingEmptyId = useRef<string | null>(null);

  const cleanupPendingEmpty = useCallback((exceptId?: string) => {
    const id = pendingEmptyId.current;
    if (!id || id === exceptId) return;
    pendingEmptyId.current = null;
    const msgs = queryClient.getQueryData<ChatMessageDTO[]>(["messages", documentId, id]);
    if (!msgs || msgs.length === 0) {
      closeWindowStore(id);
      deleteHighlight.mutate(id);
    }
  }, [queryClient, documentId, closeWindowStore, deleteHighlight]);

  // Publish text selections into the chat store.
  useTextSelection(stageRef);

  // When the PDF zoom changes, the text moves to new viewport coordinates so
  // the captured selection bounds are stale. Clear the selection so the toolbar
  // doesn't render at the wrong position. (Same behavior as native PDF viewers.)
  const scale = useViewerStore((s) => s.scale);
  useEffect(() => {
    setSelection(null);
  }, [scale, setSelection]);

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

  // Create an unanchored chat at page 1 (the document title area) when no text
  // is selected. The highlight uses empty rects so it leaves no visible mark on
  // the PDF, and clicking its row in the right panel scrolls back to page 1.
  const startChatNoSelection = useCallback(() => {
    if (createHighlight.isPending) return;
    cleanupPendingEmpty();
    const topBoundary = windowTopBoundary();
    createHighlight.mutate(
      { pageNumber: 1, rects: [], selectedText: "" },
      {
        onSuccess: (h) => {
          pendingEmptyId.current = h.id;
          openWindowStore(h.id, { x: 80, y: topBoundary + 20 });
        },
      },
    );
  }, [createHighlight, openWindowStore, cleanupPendingEmpty]);

  // Cmd/Ctrl + Enter → start chat from selection (if any) or open an unanchored window.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      e.preventDefault();
      const sel = useChatStore.getState().activeSelection;
      if (sel) {
        startChatFromSelection();
      } else {
        startChatNoSelection();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [startChatFromSelection, startChatNoSelection]);

  const openWindow = useCallback(
    (id: string, placement?: WindowPlacement) => {
      cleanupPendingEmpty(id);
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
    [openWindowStore, cleanupPendingEmpty],
  );

  const value = useMemo<DocChatContextValue>(
    () => ({ documentId, filename, highlights, startChatFromSelection, startChatNoSelection, openWindow }),
    [documentId, filename, highlights, startChatFromSelection, startChatNoSelection, openWindow],
  );

  return (
    <DocChatContext.Provider value={value}>
      {children}
      <SelectionToolbar />
      {windows.filter((w) => w.mode !== "panel").map((w) => {
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
