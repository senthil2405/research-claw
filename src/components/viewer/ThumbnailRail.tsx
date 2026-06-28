"use client";

// Side-effect import: configures the pdf.js worker exactly once. MUST come
// before any react-pdf usage.
import "@/pdfWorker";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, type DocumentProps } from "react-pdf";
import { useViewerStore } from "@/store/viewerStore";
import styles from "./ThumbnailRail.module.css";

export interface ThumbnailRailProps {
  /**
   * The same PDF source the main viewer renders. Either a URL string (object
   * URL or API route) or a File/Blob. react-pdf caches the loaded document by
   * `file`, so rendering a second <Document> for the same src is cheap.
   */
  src: string | File | Blob;
}

// Derive callback parameter types from react-pdf so we never import pdfjs-dist
// directly.
type OnLoadSuccess = NonNullable<DocumentProps["onLoadSuccess"]>;
type PdfDocumentProxy = Parameters<OnLoadSuccess>[0];

// Geometry of a single thumbnail (CSS px). Height is an estimate used by the
// placeholder so the rail's scroll height is stable before pages render.
const THUMB_WIDTH = 140;
const DEFAULT_ASPECT = 1.294; // US-Letter ≈ 11 / 8.5
const PLACEHOLDER_HEIGHT = Math.round(THUMB_WIDTH * DEFAULT_ASPECT);

interface ThumbnailProps {
  pageNumber: number;
  isActive: boolean;
  onSelect: (page: number) => void;
  /** Scrolls this thumbnail into view when it becomes active. */
  registerActiveRef: (el: HTMLButtonElement | null) => void;
}

/**
 * A single lazily-rendered thumbnail. The heavy <Page> canvas only mounts once
 * the button scrolls near the rail's viewport (IntersectionObserver). Until
 * then a fixed-size placeholder keeps layout stable.
 */
function Thumbnail({
  pageNumber,
  isActive,
  onSelect,
  registerActiveRef,
}: ThumbnailProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el || visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      // Pre-render a little before/after the viewport for smoother scrolling.
      { root: null, rootMargin: "300px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  // Keep the parent's handle on the active thumbnail current.
  useEffect(() => {
    if (isActive) registerActiveRef(buttonRef.current);
    return () => {
      if (isActive) registerActiveRef(null);
    };
  }, [isActive, registerActiveRef]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${styles.thumb} ${isActive ? styles.thumbActive : ""}`}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={isActive ? "true" : undefined}
      onClick={() => onSelect(pageNumber)}
    >
      <span className={styles.thumbCanvas}>
        {visible ? (
          <Page
            pageNumber={pageNumber}
            width={THUMB_WIDTH}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={
              <span
                className={styles.placeholder}
                style={{ width: THUMB_WIDTH, height: PLACEHOLDER_HEIGHT }}
              />
            }
            error={
              <span
                className={styles.placeholder}
                style={{ width: THUMB_WIDTH, height: PLACEHOLDER_HEIGHT }}
              />
            }
          />
        ) : (
          <span
            className={styles.placeholder}
            style={{ width: THUMB_WIDTH, height: PLACEHOLDER_HEIGHT }}
          />
        )}
      </span>
      <span className={styles.label}>{pageNumber}</span>
    </button>
  );
}

export function ThumbnailRail({ src }: ThumbnailRailProps) {
  const thumbsOpen = useViewerStore((s) => s.thumbsOpen);
  const currentPage = useViewerStore((s) => s.currentPage);
  const storeNumPages = useViewerStore((s) => s.numPages);
  const requestScroll = useViewerStore((s) => s.requestScroll);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const setThumbsOpen = useViewerStore((s) => s.setThumbsOpen);

  // Page count from our own Document load; fall back to the store's count
  // (set by the main viewer) until our Document resolves.
  const [localNumPages, setLocalNumPages] = useState(0);
  const numPages = localNumPages || storeNumPages;

  // Memoize so react-pdf's `===` change-detection stays stable across renders
  // that don't actually change `src`.
  const file = useMemo(() => src, [src]);

  // Reset our local page count when the source changes. Done during render
  // (React's "adjust state on prop change" pattern) rather than in an effect.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setLocalNumPages(0);
  }

  const handleLoadSuccess = useCallback((pdf: PdfDocumentProxy) => {
    setLocalNumPages(pdf.numPages);
  }, []);

  const handleSelect = useCallback(
    (page: number) => {
      setCurrentPage(page);
      requestScroll(page);
    },
    [setCurrentPage, requestScroll],
  );

  // Scroll the active thumbnail into view whenever currentPage changes. The
  // active <Thumbnail> registers its element here via registerActiveRef.
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const registerActiveRef = useCallback((el: HTMLButtonElement | null) => {
    activeRef.current = el;
  }, []);

  useEffect(() => {
    if (!thumbsOpen) return;
    // Defer to let the active thumbnail mount/register first.
    const id = requestAnimationFrame(() => {
      activeRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [currentPage, thumbsOpen, numPages]);

  // When the rail is closed, render nothing (collapsed). The parent may also
  // skip mounting us entirely — both paths are handled.
  if (!thumbsOpen) return null;

  const pages = numPages > 0 ? Array.from({ length: numPages }, (_, i) => i + 1) : [];

  return (
    <aside className={styles.rail} aria-label="Page thumbnails">
      <div className={styles.railHeader}>
        <button
          type="button"
          className={styles.railBack}
          aria-label="Collapse pages panel"
          title="Collapse"
          onClick={() => setThumbsOpen(false)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className={styles.railTitle}>Pages</span>
      </div>
      <div className={styles.railBody}>
        <Document
          file={file}
          onLoadSuccess={handleLoadSuccess}
          loading={<div className={styles.state}>Loading…</div>}
          error={<div className={styles.state}>Unavailable</div>}
          className={styles.document}
        >
          <div className={styles.list}>
            {pages.map((n) => (
              <Thumbnail
                key={n}
                pageNumber={n}
                isActive={n === currentPage}
                onSelect={handleSelect}
                registerActiveRef={registerActiveRef}
              />
            ))}
          </div>
        </Document>
      </div>
    </aside>
  );
}

export default ThumbnailRail;
