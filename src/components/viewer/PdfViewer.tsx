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

const SCALE_MIN = 0.25;
const SCALE_MAX = 5;

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
  // `liveContainer` tracks the stage size on every ResizeObserver tick (no
  // debounce). It drives the container-resize CSS bridge so the PDF smoothly
  // tracks the sidebar animation without triggering a pdfjs re-render each frame.
  const [liveContainer, setLiveContainer] = useState({ width: 0, height: 0 });
  // First-page aspect ratio (height / width); null until the document loads.
  const [firstAspect, setFirstAspect] = useState<number | null>(null);
  const [listOffset, setListOffset] = useState(0);
  const [loadError, setLoadError] = useState<Error | null>(null);
  // Bumped to force the <Document> to remount and retry after an error.
  const [reloadKey, setReloadKey] = useState(0);

  // ---- Zoom flicker prevention ----
  // `renderScale` lags behind the store's `scale` by ~150 ms during rapid
  // changes (pinch / trackpad). `renderWidth` is computed from `renderScale`
  // so the canvas only repaints once per gesture rather than on every tick.
  // A CSS `scale()` transform on the column bridges the visual gap so users
  // see smooth, immediate zoom feedback without any blank-page flash.
  const [renderScale, setRenderScale] = useState(scale);
  const renderScaleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the previous renderScale so we know how much to shift scrollLeft.
  const prevRenderScaleRef = useRef(renderScale);
  // Incrementing this tells every PdfPage to capture its canvas snapshot NOW —
  // one rAF before renderScale changes so the canvas still has the old pixels.
  const [captureSignal, setCaptureSignal] = useState(0);
  // Debounce timer for container-resize events (sidebar slide animation fires
  // a ResizeObserver callback on every rAF; batching prevents per-frame renders).
  const containerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Previous estimated slot height — used to restore scroll position proportionally
  // when renderWidth changes (panel open/close, sidebar collapse) so the same
  // page stays in view even though raw pixel heights changed.
  const prevEstimatedSlotRef = useRef(0);

  // Memoize the file so react-pdf's `===` change-detection stays stable across
  // re-renders that don't actually change `src`.
  const file = useMemo(() => src, [src]);

  const aspect = firstAspect ?? DEFAULT_ASPECT;

  useEffect(() => {
    if (renderScaleTimer.current) clearTimeout(renderScaleTimer.current);
    renderScaleTimer.current = setTimeout(() => {
      // Signal pages to snapshot their canvas pixels NOW, while renderScale
      // hasn't changed yet and the canvas still holds the old frame.
      // One rAF later we commit the new renderScale — by then the snapshots
      // are in the DOM so the canvas clear (triggered by the width attr change)
      // is fully covered.
      setCaptureSignal((n) => n + 1);
      requestAnimationFrame(() => setRenderScale(scale));
    }, 150);
    return () => {
      if (renderScaleTimer.current) clearTimeout(renderScaleTimer.current);
    };
  }, [scale]);

  // After renderScale commits, shift scrollLeft so the point at the viewport
  // centre during the CSS zoom stays centred after the real layout commits.
  // Δ = container.width * (renderScale - prev) / 2  (derived from top-center origin).
  useEffect(() => {
    const prev = prevRenderScaleRef.current;
    prevRenderScaleRef.current = renderScale;
    if (fitMode !== "custom" || renderScale === prev || prev === 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const delta = (container.width * (renderScale - prev)) / 2;
    stage.scrollLeft = Math.max(0, stage.scrollLeft + delta);
  }, [renderScale, fitMode, container.width]);

  // ---- Container measurement ----
  // react-pdf's <Document> only mounts its children (the stage element) AFTER
  // the PDF finishes loading; while loading it renders its own message instead.
  // So the stage ref is null on first mount. Re-run this effect once the
  // document has loaded (numPages > 0) so the ResizeObserver actually attaches
  // to the now-present stage and `container` gets a real measurement.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // Measure immediately so renderWidth is non-zero before any page renders.
    // At this point no canvas exists yet, so no snapshot is needed.
    const initial = { width: el.clientWidth, height: el.clientHeight };
    setContainer(initial);
    setLiveContainer(initial);
    // ResizeObserver callbacks: update liveContainer immediately (drives the CSS
    // scale bridge so the PDF visually tracks the sidebar animation) while
    // debouncing the committed container (drives pdfjs re-renders so the canvas
    // only repaints once after the animation settles, not every rAF of the 260 ms
    // sidebar slide).
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setLiveContainer({ width: w, height: h });
      if (containerTimerRef.current) clearTimeout(containerTimerRef.current);
      containerTimerRef.current = setTimeout(() => {
        setCaptureSignal((n) => n + 1);
        requestAnimationFrame(() => setContainer({ width: w, height: h }));
      }, 50);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (containerTimerRef.current) clearTimeout(containerTimerRef.current);
    };
  }, [numPages]);

  // ---- Computed render width ----
  // Uses `renderScale` (debounced) rather than `scale` (live) so the canvas
  // only repaints once per gesture. The CSS zoom bridge below fills the gap.
  const renderWidth = useMemo(() => {
    if (container.width <= 0) return 0;
    // Fit modes get STAGE_PADDING_X breathing room on each side.
    const widthFit = Math.min(
      MAX_FIT_WIDTH,
      Math.max(MIN_WIDTH, container.width - STAGE_PADDING_X),
    );
    if (fitMode === "custom") {
      // In zoomed mode: use the full viewport width as the base so the page
      // fills edge-to-edge at scale=1. This aligns the CSS-transform anchor
      // (viewport center) with the post-commit layout, eliminating the
      // post-gesture nudge and the left-margin artifact.
      const base = Math.max(MIN_WIDTH, container.width);
      return Math.round(base * renderScale);
    }
    if (fitMode === "page") {
      if (container.height <= 0) return Math.round(widthFit);
      // Width that makes one page's height fit the visible area.
      const heightFitWidth = (container.height - STAGE_PADDING_Y) / aspect;
      return Math.round(Math.max(MIN_WIDTH, Math.min(widthFit, heightFitWidth)));
    }
    // 'width'
    return Math.round(widthFit);
  }, [container.width, container.height, fitMode, renderScale, aspect]);

  // CSS zoom multiplier applied to the column while `renderScale` hasn't
  // caught up to `scale` yet. Gives instant visual feedback with no blank.
  const cssZoom = fitMode === "custom" && renderScale > 0 ? scale / renderScale : 1;

  // Live render width (same formula as renderWidth but using liveContainer).
  // Drives the container-resize CSS bridge below.
  const liveRenderWidth = useMemo(() => {
    if (liveContainer.width <= 0) return 0;
    const widthFit = Math.min(MAX_FIT_WIDTH, Math.max(MIN_WIDTH, liveContainer.width - STAGE_PADDING_X));
    if (fitMode === "custom") return Math.round(Math.max(MIN_WIDTH, liveContainer.width) * renderScale);
    if (fitMode === "page") {
      if (liveContainer.height <= 0) return Math.round(widthFit);
      const heightFitWidth = (liveContainer.height - STAGE_PADDING_Y) / aspect;
      return Math.round(Math.max(MIN_WIDTH, Math.min(widthFit, heightFitWidth)));
    }
    return Math.round(widthFit);
  }, [liveContainer.width, liveContainer.height, fitMode, renderScale, aspect]);

  // Scale the column to visually match liveRenderWidth while the canvas hasn't
  // re-rendered yet. Resets to 1 once container commits (50 ms after the sidebar
  // animation ends). Combined with cssZoom so one transform covers both cases.
  const containerCssScale = renderWidth > 0 ? liveRenderWidth / renderWidth : 1;
  const columnScale = cssZoom * containerCssScale;

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
  // Also restore scrollTop proportionally so the same page stays in view:
  //   newScrollTop = oldScrollTop × (newSlot / oldSlot)
  // This keeps the visible page stable when a panel opens/closes or the sidebar
  // collapses, even though the physical pixel heights of all pages change.
  useEffect(() => {
    const stage = stageRef.current;
    const prevSlot = prevEstimatedSlotRef.current;
    const newSlot = Math.max(1, Math.round(estimatedPageHeight + GAP));
    prevEstimatedSlotRef.current = newSlot;

    if (stage && numPages > 0 && prevSlot > 0 && prevSlot !== newSlot) {
      const savedTop = stage.scrollTop;
      virtualizer.measure();
      stage.scrollTop = Math.round(savedTop * (newSlot / prevSlot));
    } else {
      virtualizer.measure();
    }
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

  // ---- Trackpad pinch-to-zoom (ctrl + wheel) ----
  // Browsers report trackpad pinch as wheel events with ctrlKey=true.
  // Must be non-passive so we can call preventDefault() and stop the browser
  // from zooming the entire page instead of just the PDF content.
  // Uses [numPages] as dep (same reason as the ResizeObserver above):
  // react-pdf renders its loading state INSTEAD of children while loading,
  // so stageRef.current is null on the first render; the effect must re-run
  // once numPages is set and the stage element actually exists in the DOM.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { scale, setScale } = useViewerStore.getState();
      // Exponential feel: small deltaY = smooth zoom, large = faster jump.
      const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * Math.exp(-e.deltaY / 150)));
      setScale(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [numPages]); // re-run once the stage mounts after PDF load

  // ---- Touch pinch-to-zoom (two-finger on touch screens) ----
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let lastDist = 0;

    const dist = (t: TouchList) =>
      Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) lastDist = dist(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastDist === 0) return;
      e.preventDefault();
      const d = dist(e.touches);
      const { scale, setScale } = useViewerStore.getState();
      const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * (d / lastDist)));
      lastDist = d;
      setScale(next);
    };
    const onTouchEnd = () => { lastDist = 0; };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [numPages]); // re-run once the stage mounts after PDF load

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
        <div ref={stageRef} className={styles.stage} data-pdf-stage>
          <div
            ref={listRef}
            className={styles.column}
            style={{
              width: "100%",
              // In fit modes: add STAGE_PADDING_X so the page has breathing room
              // and a horizontal scrollbar appears if it overflows.
              // In custom/zoom mode: page fills edge-to-edge (no left-margin
              // artifact) and aligns with the CSS-zoom anchor (viewport center),
              // so the post-gesture snap is eliminated.
              minWidth:
                renderWidth > 0
                  ? fitMode === "custom"
                    ? renderWidth
                    : renderWidth + STAGE_PADDING_X
                  : undefined,
              // Visual-only scale while pdfjs hasn't re-rendered yet (covers both
              // zoom gestures and sidebar resize). Resets to 1 once renderScale
              // and container both commit.
              transform: columnScale !== 1 ? `scale(${columnScale})` : undefined,
              transformOrigin: "top center",
            }}
          >
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
                      captureSignal={captureSignal}
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
