"use client";

/**
 * PdfToolbar — a top toolbar styled after Chrome's built-in PDF viewer, recolored
 * to the warm Claude palette.
 *
 * It coordinates with the rest of the viewer purely through `useViewerStore`
 * (never importing PdfViewer / ThumbnailRail directly). The composing route
 * renders this as a sibling above the viewer.
 */
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useViewerStore } from "@/store/viewerStore";
import { useUiStore } from "@/store/uiStore";
import { useDocChatOptional } from "./DocChatContext";
import styles from "./PdfToolbar.module.css";
import {
  ArrowUpIcon,
  ChatPanelIcon,
  DownloadIcon,
  FitPageIcon,
  FitWidthIcon,
  MoonIcon,
  PrintIcon,
  RotateIcon,
  SunIcon,
  ThumbnailsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons";

const SCALE_MIN = 0.25;
const SCALE_MAX = 5;

export interface PdfToolbarProps {
  /** PDF URL — an object/blob URL or a same-origin path like `/api/documents/:id/file`. */
  src: string;
  /** Optional file name; used for the title and the download attribute. */
  filename?: string;
}

export default function PdfToolbar({ src, filename }: PdfToolbarProps) {
  const numPages = useViewerStore((s) => s.numPages);
  const currentPage = useViewerStore((s) => s.currentPage);
  const scale = useViewerStore((s) => s.scale);
  const fitMode = useViewerStore((s) => s.fitMode);
  const thumbsOpen = useViewerStore((s) => s.thumbsOpen);

  const toggleThumbs = useViewerStore((s) => s.toggleThumbs);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const setScale = useViewerStore((s) => s.setScale);
  const zoomIn = useViewerStore((s) => s.zoomIn);
  const zoomOut = useViewerStore((s) => s.zoomOut);
  const setFitMode = useViewerStore((s) => s.setFitMode);
  const rotateCw = useViewerStore((s) => s.rotateCw);
  const requestScroll = useViewerStore((s) => s.requestScroll);
  const chatsPanelOpen = useViewerStore((s) => s.chatsPanelOpen);
  const toggleChatsPanel = useViewerStore((s) => s.toggleChatsPanel);
  const darkMode = useUiStore((s) => s.darkMode);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const docChat = useDocChatOptional();
  const chatCount = docChat?.highlights.length ?? 0;
  const setCurrentPageStore = useViewerStore((s) => s.setCurrentPage);

  // Local, editable mirror of the page box. Kept in sync with the store unless
  // the user is mid-edit. Synced during render (React's "adjust state on prop
  // change" pattern) rather than in an effect.
  const [pageInput, setPageInput] = useState<string>(String(currentPage));
  const [editing, setEditing] = useState(false);
  const [syncedPage, setSyncedPage] = useState(currentPage);

  if (!editing && currentPage !== syncedPage) {
    setSyncedPage(currentPage);
    setPageInput(String(currentPage));
  }

  const hasDoc = numPages > 0;
  const zoomPct = Math.round(scale * 100);
  const title = filename ?? "document.pdf";

  // ---- Page box ----
  const commitPage = useCallback(() => {
    setEditing(false);
    const parsed = Number.parseInt(pageInput, 10);
    if (
      Number.isFinite(parsed) &&
      parsed >= 1 &&
      (numPages === 0 || parsed <= numPages)
    ) {
      setCurrentPage(parsed);
      requestScroll(parsed);
    } else {
      // Reject out-of-range / invalid input: snap back to the current page.
      setPageInput(String(currentPage));
    }
  }, [pageInput, numPages, currentPage, setCurrentPage, requestScroll]);

  const onPageChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditing(true);
    setPageInput(e.target.value.replace(/[^\d]/g, ""));
  };

  const onPageKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitPage();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
      setPageInput(String(currentPage));
      e.currentTarget.blur();
    }
  };

  // ---- Fit toggle ----
  const fitIsWidth = fitMode === "width";
  const toggleFit = () => setFitMode(fitIsWidth ? "page" : "width");

  // ---- Download ----
  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = src;
    a.download = filename ?? "document.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [src, filename]);

  // ---- Print (hidden iframe) ----
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const printPendingRef = useRef(false);

  const triggerPrint = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const win = frame.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      // Some environments block programmatic printing; fail silently.
    }
  }, []);

  const handlePrint = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    // If the iframe already points at this src and is loaded, print directly.
    if (frame.getAttribute("src") === src && !printPendingRef.current) {
      triggerPrint();
      return;
    }
    printPendingRef.current = true;
    if (frame.getAttribute("src") === src) {
      // Force a reload so the onLoad handler fires reliably.
      frame.setAttribute("src", "");
    }
    frame.setAttribute("src", src);
  }, [src, triggerPrint]);

  const onIframeLoad = useCallback(() => {
    if (!printPendingRef.current) return;
    printPendingRef.current = false;
    // Defer slightly so the embedded PDF plugin is ready.
    window.setTimeout(triggerPrint, 100);
  }, [triggerPrint]);

  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="PDF controls"
      data-pdf-toolbar
    >
      {/* 1. Thumbnails / sidebar toggle */}
      <button
        type="button"
        className={`${styles.iconButton} ${thumbsOpen ? styles.active : ""}`}
        aria-label="Toggle thumbnails"
        aria-pressed={thumbsOpen}
        title="Thumbnails"
        onClick={toggleThumbs}
      >
        <ThumbnailsIcon />
      </button>

      <span className={styles.divider} aria-hidden="true" />

      {/* 2. Document title */}
      <span className={styles.title} title={title}>
        {title}
      </span>

      {/* 3. Page indicator */}
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.pageGroup}>
        <input
          className={styles.pageInput}
          type="text"
          inputMode="numeric"
          aria-label="Page number"
          title="Page number"
          value={pageInput}
          disabled={!hasDoc}
          onChange={onPageChange}
          onKeyDown={onPageKeyDown}
          onFocus={(e) => {
            setEditing(true);
            e.currentTarget.select();
          }}
          onBlur={commitPage}
        />
        <span className={styles.pageTotal}>/ {numPages}</span>
      </div>

      {/* 4. Zoom group */}
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.group}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Zoom out"
          title="Zoom out (⌘− / Ctrl+−)"
          disabled={scale <= SCALE_MIN}
          onClick={zoomOut}
        >
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          className={styles.zoomValue}
          aria-label={`Zoom ${zoomPct} percent, click to reset to 80%`}
          title="Reset zoom to 80%"
          onClick={() => setScale(0.8)}
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          {zoomPct}%
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Zoom in"
          title="Zoom in (⌘= / Ctrl+=)"
          disabled={scale >= SCALE_MAX}
          onClick={zoomIn}
        >
          <ZoomInIcon />
        </button>
      </div>

      {/* 5. Fit toggle */}
      <span className={styles.divider} aria-hidden="true" />
      <button
        type="button"
        className={`${styles.iconButton} ${
          fitMode !== "custom" ? styles.active : ""
        }`}
        aria-label={fitIsWidth ? "Fit to page" : "Fit to width"}
        aria-pressed={fitMode !== "custom"}
        title={fitIsWidth ? "Fit to page" : "Fit to width"}
        onClick={toggleFit}
      >
        {fitIsWidth ? <FitPageIcon /> : <FitWidthIcon />}
      </button>

      {/* 6. Rotate */}
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Rotate clockwise"
        title="Rotate clockwise"
        onClick={rotateCw}
      >
        <RotateIcon />
      </button>

      <span className={styles.divider} aria-hidden="true" />

      {/* 7. Download */}
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Download"
        title="Download"
        onClick={handleDownload}
      >
        <DownloadIcon />
      </button>

      {/* 8. Print */}
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Print"
        title="Print"
        onClick={handlePrint}
      >
        <PrintIcon />
      </button>

      <span className={styles.divider} aria-hidden="true" />

      {/* 9. Jump to top */}
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Go to top"
        title="Go to top (⌘↑ / Ctrl+↑)"
        disabled={!hasDoc}
        onClick={() => {
          setCurrentPageStore(1);
          requestScroll(1);
        }}
      >
        <ArrowUpIcon />
      </button>

      {/* 10. Dark / light mode toggle */}
      <button
        type="button"
        className={styles.iconButton}
        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        title={darkMode ? "Light mode" : "Dark mode"}
        onClick={toggleDarkMode}
      >
        {darkMode ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* 11. Chat history panel toggle (right) */}
      <div className={styles.chatPanelWrap}>
        <button
          type="button"
          className={`${styles.iconButton} ${chatsPanelOpen ? styles.active : ""}`}
          aria-label="Toggle chat history"
          aria-pressed={chatsPanelOpen}
          title="Chats in this PDF (⌘/ / Ctrl+/)"
          onClick={toggleChatsPanel}
        >
          <ChatPanelIcon />
        </button>
        {chatCount > 0 && (
          <span className={styles.chatBadge} aria-label={`${chatCount} chats`}>
            {chatCount > 99 ? "99+" : chatCount}
          </span>
        )}
      </div>

      {/* Hidden iframe used for printing. */}
      <iframe
        ref={iframeRef}
        className={styles.printFrame}
        title="Print frame"
        aria-hidden="true"
        tabIndex={-1}
        onLoad={onIframeLoad}
      />
    </div>
  );
}
