"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import PdfToolbar from "./PdfToolbar";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { DocChatProvider } from "./DocChatProvider";
import { useViewerStore } from "@/store/viewerStore";
import { useChatStore } from "@/store/chatStore";
import { useUiStore } from "@/store/uiStore";
import styles from "./DocViewer.module.css";

const SCALE_MIN = 0.25;
const SCALE_MAX = 5;

// react-pdf relies on browser-only APIs (DOMMatrix, canvas, the pdf.js worker),
// so the viewer and thumbnail rail must never render during SSR.
const PdfViewer = dynamic(
  () => import("./PdfViewer").then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => <div className={styles.viewerFallback} aria-hidden="true" />,
  },
);

const ThumbnailRail = dynamic(
  () => import("./ThumbnailRail").then((m) => m.ThumbnailRail),
  { ssr: false },
);

export interface DocViewerProps {
  /** Same-origin PDF URL (e.g. `/api/documents/:id/file`). */
  src: string;
  /** Document id — scopes highlights + chat. */
  documentId: string;
  /** Optional display name shown in the toolbar. */
  filename?: string;
}

/**
 * Composes the viewer chrome: a pinned toolbar above a row holding the
 * (optional) thumbnail rail and the scrolling page viewer. Wraps everything in
 * the DocChatProvider so text selection, highlights, and chat windows work.
 * Resets the shared viewer + chat stores whenever the document changes.
 */
export function DocViewer({ src, documentId, filename }: DocViewerProps) {
  const resetViewer = useViewerStore((s) => s.reset);
  const resetChat = useChatStore((s) => s.reset);
  const collapseSidebar = useUiStore((s) => s.setSidebarCollapsed);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetViewer();
    resetChat();
    collapseSidebar(true);
  }, [src, resetViewer, resetChat, collapseSidebar]);

  // Global keyboard shortcuts (zoom, go-to-top).
  // We use getState() so these handlers never go stale between renders.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const { scale, setScale } = useViewerStore.getState();
        setScale(Math.min(SCALE_MAX, parseFloat((scale + 0.1).toFixed(2))));
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        const { scale, setScale } = useViewerStore.getState();
        setScale(Math.max(SCALE_MIN, parseFloat((scale - 0.1).toFixed(2))));
        return;
      }
      if (e.key === "ArrowUp") {
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        const { setCurrentPage, requestScroll } = useViewerStore.getState();
        setCurrentPage(1);
        requestScroll(1);
      }
      if (e.key === "/") {
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        useViewerStore.getState().toggleChatsPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <DocChatProvider documentId={documentId} stageRef={viewerRef}>
      <div className={styles.root}>
        <PdfToolbar src={src} filename={filename} />
        <div className={styles.body}>
          <ThumbnailRail src={src} />
          <div className={styles.viewer} ref={viewerRef}>
            <PdfViewer src={src} />
          </div>
          <ChatHistoryPanel />
        </div>
      </div>
    </DocChatProvider>
  );
}

export default DocViewer;
