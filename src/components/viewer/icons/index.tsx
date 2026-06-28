/**
 * Inline SVG icon set for the PDF toolbar.
 *
 * Lucide-style line icons: 24x24 viewBox, `currentColor` stroke, no fill, so
 * they inherit color from their button and recolor on hover/active for free.
 * No icon font or external dependency.
 */
import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  /** Pixel size of the (square) icon. Defaults to 18. */
  size?: number;
  className?: string;
}

const baseProps = (size: number, className?: string): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true,
  focusable: false,
});

/** Sidebar / thumbnails panel toggle. */
export function ThumbnailsIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );
}

/** Zoom in (magnifier + plus). */
export function ZoomInIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

/** Zoom out (magnifier + minus). */
export function ZoomOutIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

/** Fit to width (horizontal double arrow inside a frame). */
export function FitWidthIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="9 9 6 12 9 15" />
      <polyline points="15 9 18 12 15 15" />
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  );
}

/** Fit to page (inward corners). */
export function FitPageIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <polyline points="8 4 4 4 4 8" />
      <polyline points="16 4 20 4 20 8" />
      <polyline points="8 20 4 20 4 16" />
      <polyline points="16 20 20 20 20 16" />
    </svg>
  );
}

/** Rotate clockwise. */
export function RotateIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <polyline points="21 5 21 11 15 11" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L21 8" />
    </svg>
  );
}

/** Download. */
export function DownloadIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Print. */
export function PrintIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </svg>
  );
}

/** Chat-history panel toggle (right side panel with a speech bubble). */
export function ChatPanelIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
      <path d="M6 9h6" />
      <path d="M6 13h4" />
    </svg>
  );
}

/** Up arrow (jump to top). */
export function ArrowUpIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <line x1="12" y1="19" x2="12" y2="6" />
      <polyline points="6 12 12 6 18 12" />
    </svg>
  );
}
