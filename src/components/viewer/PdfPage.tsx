"use client";

import { useEffect, useRef } from "react";
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
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
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
        loading={
          <div className={styles.pagePlaceholder}>Loading page {pageNumber}…</div>
        }
      />
      <PageChatOverlay pageNumber={pageNumber} />
    </div>
  );
}
