"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Page } from "react-pdf";
// Required for correct text-layer positioning + selectable text.
import "react-pdf/dist/Page/TextLayer.css";
import PageChatOverlay from "./PageChatOverlay";
import styles from "./PdfPage.module.css";

export interface PdfPageProps {
  /** 1-based page number. */
  pageNumber: number;
  /** Render width in CSS pixels. */
  width: number;
  /** Rotation in degrees, one of {0, 90, 180, 270}. */
  rotation: number;
  /** Called when this page becomes prominently visible in the viewport. */
  onVisible: (page: number) => void;
  /** Lets the parent keep a handle on each page element (e.g. for measuring). */
  registerRef?: (page: number, el: HTMLDivElement | null) => void;
  /**
   * Incremented by PdfViewer one rAF before renderScale changes. Fires
   * snapshot capture while the canvas still holds the previous frame's pixels.
   */
  captureSignal?: number;
}

// Report visibility at several granularities so the parent can pick the
// topmost prominently-visible page even as pages scroll past.
const THRESHOLDS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const VISIBLE_RATIO = 0.5;

export default function PdfPage({
  pageNumber,
  width,
  rotation,
  onVisible,
  registerRef,
  captureSignal,
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ---- Canvas snapshot — prevents the blank flash when width changes ----
  // The root problem: changing the canvas `width` attribute (which react-pdf does
  // when renderWidth changes) clears the canvas synchronously during React's DOM
  // commit — before any useLayoutEffect fires. Capturing the snapshot on [width]
  // therefore always captures a blank canvas.
  //
  // Fix: PdfViewer sends a captureSignal one rAF BEFORE it commits the new
  // renderScale. At that moment the canvas still has the old frame's pixels.
  // We capture, hide the canvas, and show the snapshot as an overlay. When
  // pdfjs finishes re-rendering, onRenderSuccess fades the fresh canvas back in.
  const [snapshot, setSnapshot] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!captureSignal) return;
    const canvas = containerRef.current?.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) return;
    try {
      setSnapshot(canvas.toDataURL());
      canvas.style.transition = "none";
      canvas.style.opacity = "0";
    } catch {
      // toDataURL can fail for tainted canvases — skip silently.
    }
  }, [captureSignal]);

  const handleRenderSuccess = useCallback(() => {
    const canvas = containerRef.current?.querySelector<HTMLCanvasElement>("canvas");
    if (canvas) {
      canvas.style.transition = "opacity 80ms ease";
      canvas.style.opacity = "1";
    }
    setSnapshot(null);
  }, []);

  // Keep the latest callback without re-creating the observer each render.
  const onVisibleRef = useRef(onVisible);
  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
            onVisibleRef.current(pageNumber);
          }
        }
      },
      { threshold: THRESHOLDS },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber]);

  // Register / unregister the element handle with the parent.
  useEffect(() => {
    if (!registerRef) return;
    registerRef(pageNumber, containerRef.current);
    return () => registerRef(pageNumber, null);
  }, [pageNumber, registerRef]);

  return (
    <div
      ref={containerRef}
      className={styles.page}
      data-page-number={pageNumber}
    >
      <Page
        pageNumber={pageNumber}
        width={width}
        rotate={rotation}
        renderTextLayer={true}
        renderAnnotationLayer={false}
        onRenderSuccess={handleRenderSuccess}
        loading={
          <div className={styles.pagePlaceholder}>Loading page {pageNumber}…</div>
        }
      />
      {snapshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshot}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      )}
      <PageChatOverlay pageNumber={pageNumber} />
    </div>
  );
}
