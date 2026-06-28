"use client";

// Side-effect import: configures the pdf.js worker exactly once. MUST come
// before any react-pdf usage.
import "@/pdfWorker";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, type DocumentProps } from "react-pdf";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useViewerStore } from "@/store/viewerStore";
import PdfPage from "./PdfPage";
import styles from "./PdfViewer.module.css";

export interface PdfViewerProps {
  /**
   * What to render. Either a URL string (an object URL or an API route like
   * `/api/documents/:id/file`) or a File/Blob.
   */
  src: string | File | Blob;
}

// Derive callback parameter types from react-pdf so we never import pdfjs-dist
// directly (keeps the import surface to react-pdf / react-virtual / zustand).
type OnLoadSuccess = NonNullable<DocumentProps["onLoadSuccess"]>;
type PdfDocumentProxy = Parameters<OnLoadSuccess>[0];

// Geometry constants (Chrome-viewer-like spacing, warm palette via CSS vars).
const GAP = 16; // vertical gap between pages
const STAGE_PADDING_X = 48; // horizontal breathing room when fitting width
const STAGE_PADDING_Y = 48; // vertical room used for 'page' fit calc
const MAX_FIT_WIDTH = 1000; // never auto-fit wider than this
const MIN_WIDTH = 120;
// Default page aspect ratio (height / width). US-Letter ≈ 11/8.5 ≈ 1.294.
const DEFAULT_ASPECT = 1.294;
const CURRENT_PAGE_DEBOUNCE = 80;

export function PdfViewer({ src }: PdfViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // ---- Store wiring ----
  const numPages = useViewerStore((s) => s.numPages);
  const scale = useViewerStore((s) => s.scale);
  const rotation = useViewerStore((s) => s.rotation);
  const fitMode = useViewerStore((s) => s.fitMode);
  const scrollRequest = useViewerStore((s) => s.scrollRequest);

  const setNumPages = useViewerStore((s) => s.setNumPages);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const consumeScroll = useViewerStore((s) => s.consumeScroll);

  // ---- Local state ----
  const [container, setContainer] = useState({ width: 0, height: 0 });
  // First-page aspect ratio (height / width); null until the document loads.
  const [firstAspect, setFirstAspect] = useState<number | null>(null);
  const [listOffset, setListOffset] = useState(0);
  const [loadError, setLoadError] = useState<Error | null>(null);
  // Bumped to force the <Document> to remount and retry after an error.
  const [reloadKey, setReloadKey] = useState(0);

  // Memoize the file so react-pdf's `===` change-detection stays stable across
  // re-renders that don't actually change `src`.
  const file = useMemo(() => src, [src]);

  const aspect = firstAspect ?? DEFAULT_ASPECT;

  // ---- Container measurement ----
  // react-pdf's <Document> only mounts its children (the stage element) AFTER
  // the PDF finishes loading; while loading it renders its own message instead.
  // So the stage ref is null on first mount. Re-run this effect once the
  // document has loaded (numPages > 0) so the ResizeObserver actually attaches
  // to the now-present stage and `container` gets a real measurement.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () =>
      setContainer({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [numPages]);

  // ---- Computed render width ----
  const renderWidth = useMemo(() => {
    if (container.width <= 0) return 0;
    const widthFit = Math.min(
      MAX_FIT_WIDTH,
      Math.max(MIN_WIDTH, container.width - STAGE_PADDING_X),
    );
    if (fitMode === "custom") {
      return Math.round(widthFit * scale);
    }
    if (fitMode === "page") {
      if (container.height <= 0) return Math.round(widthFit);
      // Width that makes one page's height fit the visible area.
      const heightFitWidth = (container.height - STAGE_PADDING_Y) / aspect;
      return Math.round(Math.max(MIN_WIDTH, Math.min(widthFit, heightFitWidth)));
    }
    // 'width'
    return Math.round(widthFit);
  }, [container.width, container.height, fitMode, scale, aspect]);

  // Effective slot height for size estimation. A 90°/270° rotation swaps the
  // page's bounding box (rendered height becomes the unrotated width).
  const isQuarterTurned = rotation % 180 !== 0;
  const estimatedPageHeight = isQuarterTurned
    ? renderWidth
    : renderWidth * aspect;

  // ---- Virtualizer ----
  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => stageRef.current,
    estimateSize: () => Math.max(1, Math.round(estimatedPageHeight + GAP)),
    overscan: 2,
    scrollMargin: listOffset,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Record the list element's offset within the scroll container so the
  // virtualizer can account for the stage's top padding.
  useLayoutEffect(() => {
    if (listRef.current) {
      const next = listRef.current.offsetTop;
      setListOffset((prev) => (prev !== next ? next : prev));
    }
  }, [numPages, renderWidth]);

  // When the render width or rotation changes, previously measured page heights
  // are stale — drop the measurement cache so the virtualizer re-estimates.
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderWidth, rotation]);

  // ---- Current-page tracking (debounced) ----
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeCurrentPage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || numPages <= 0) return;
    const scrollTop = stage.scrollTop;
    const items = virtualizer.getVirtualItems();
    for (const item of items) {
      // `item.start` is relative to the scroll container (includes scrollMargin).
      if (item.start + item.size > scrollTop + 8) {
        setCurrentPage(item.index + 1);
        return;
      }
    }
  }, [numPages, virtualizer, setCurrentPage]);

  const handleVisible = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(computeCurrentPage, CURRENT_PAGE_DEBOUNCE);
  }, [computeCurrentPage]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // ---- Honor scroll requests from the store ----
  // Direct jump to the target page's offset (instant — no animated walk).
  // Pages are uniform height for typical PDFs, so (page-1) * slot is exact; a
  // couple of silent snaps to the target's real measured offset afterward
  // correct sub-pixel / mixed-size cases without any visible scrolling-through.
  // consumeScroll() runs at the END (clearing it mid-flight would re-run this
  // effect and cancel the snap via cleanup).
  useEffect(() => {
    if (!scrollRequest || numPages <= 0) return;
    const page = Math.min(numPages, Math.max(1, scrollRequest.page));
    const stage = stageRef.current;
    if (!stage) {
      consumeScroll();
      return;
    }

    const PAD = 24; // matches the stage's top padding
    const slot = Math.max(1, estimatedPageHeight + GAP);
    // Instant direct jump.
    stage.scrollTop = Math.max(0, (page - 1) * slot);

    let cancelled = false;
    let tries = 0;
    const snap = () => {
      if (cancelled) return;
      const st = stageRef.current;
      if (!st) return;
      const el = st.querySelector<HTMLElement>(`[data-page-number="${page}"]`);
      if (el) {
        const offset =
          el.getBoundingClientRect().top -
          st.getBoundingClientRect().top +
          st.scrollTop -
          PAD;
        const target = Math.max(0, offset);
        if (Math.abs(st.scrollTop - target) > 2) st.scrollTop = target;
      } else {
        // Target not rendered (e.g. mixed page sizes) — re-jump by estimate.
        st.scrollTop = Math.max(0, (page - 1) * slot);
      }
      tries += 1;
      if (tries < 4) setTimeout(snap, 70);
      else consumeScroll();
    };
    const t = setTimeout(snap, 60);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest]);

  // ---- Reset on document (src) change ----
  useEffect(() => {
    setNumPages(0);
    setFirstAspect(null);
    setLoadError(null);
    stageRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // ---- Document callbacks ----
  const handleLoadSuccess = useCallback(
    (pdf: PdfDocumentProxy) => {
      setLoadError(null);
      setNumPages(pdf.numPages);
      // Probe the first page to get a real aspect ratio for sizing & 'page' fit.
      pdf
        .getPage(1)
        .then((page) => {
          const viewport = page.getViewport({ scale: 1 });
          if (viewport.width > 0) {
            setFirstAspect(viewport.height / viewport.width);
          }
        })
        .catch(() => {
          /* keep the default aspect ratio */
        });
    },
    [setNumPages],
  );

  const handleLoadError = useCallback((error: Error) => {
    setLoadError(error);
    setNumPages(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(() => {
    setLoadError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const loadingNode = (
    <div className={styles.state}>
      <div className={styles.spinner} aria-hidden />
      <span>Loading document…</span>
    </div>
  );

  const errorNode = (
    <div className={styles.state} role="alert">
      <span className={styles.errorTitle}>Couldn’t load this PDF</span>
      <span className={styles.errorHint}>
        The file may be missing, corrupted, or still uploading.
      </span>
      <button type="button" className={styles.retryButton} onClick={handleRetry}>
        Try again
      </button>
    </div>
  );

  const virtualItems = virtualizer.getVirtualItems();
  const showPages = numPages > 0 && renderWidth > 0 && !loadError;

  return (
    <div className={styles.viewer}>
      <Document
        key={reloadKey}
        file={file}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        loading={loadingNode}
        error={errorNode}
        className={styles.document}
      >
        <div ref={stageRef} className={styles.stage}>
          <div ref={listRef} className={styles.column} style={{ width: "100%" }}>
            {showPages ? (
              <div
                style={{
                  position: "relative",
                  height: virtualizer.getTotalSize(),
                  width: "100%",
                }}
              >
                {virtualItems.map((item) => (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    className={styles.pageSlot}
                    style={{
                      transform: `translateY(${
                        item.start - virtualizer.options.scrollMargin
                      }px)`,
                      paddingBottom: GAP,
                    }}
                  >
                    <PdfPage
                      pageNumber={item.index + 1}
                      width={renderWidth}
                      rotation={rotation}
                      onVisible={handleVisible}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Document>
    </div>
  );
}

export default PdfViewer;
