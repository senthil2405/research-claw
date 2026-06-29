import { create } from "zustand";

/**
 * Shared viewer-state contract for the PDF viewer.
 *
 * This store is the single source of truth that the core viewer (Wave 1) and
 * the toolbar / thumbnail rail (Wave 2) all read from and write to. Components
 * never talk to each other directly — they coordinate purely through this store.
 *
 * Conventions:
 *  - Page numbers are 1-based (page 1 is the first page).
 *  - `rotation` is always one of {0, 90, 180, 270} (degrees, clockwise).
 *  - `scale` is a multiplier where 1 = 100%.
 */
export interface ViewerState {
  // ---- State ----
  /** Total number of pages in the loaded document. 0 until a document loads. */
  numPages: number;
  /** Currently focused / topmost-visible page (1-based). Defaults to 1. */
  currentPage: number;
  /** Zoom multiplier where 1 = 100%. Clamped to [0.25, 5]. */
  scale: number;
  /** Page rotation in degrees, one of {0, 90, 180, 270}. */
  rotation: number;
  /** How the viewer sizes pages. 'custom' means an explicit scale is in use. */
  fitMode: "width" | "page" | "custom";
  /** Whether the thumbnail rail is open. */
  thumbsOpen: boolean;
  /** Whether the right-hand chat-history panel is open. */
  chatsPanelOpen: boolean;
  /**
   * A pending request to scroll a given page into view. The `nonce` makes every
   * request unique so the viewer can react even when the same page is requested
   * twice in a row. `null` when there is no pending request.
   */
  scrollRequest: { page: number; nonce: number } | null;

  // ---- Actions ----
  setNumPages: (n: number) => void;
  setCurrentPage: (n: number) => void;
  /** Sets an explicit scale (clamped to [0.25, 5]) and switches to 'custom' fit. */
  setScale: (s: number) => void;
  /** Increases zoom by ~0.1, clamped, switching to 'custom' fit. */
  zoomIn: () => void;
  /** Decreases zoom by ~0.1, clamped, switching to 'custom' fit. */
  zoomOut: () => void;
  setFitMode: (m: ViewerState["fitMode"]) => void;
  /** Rotates 90° clockwise: rotation = (rotation + 90) % 360. */
  rotateCw: () => void;
  setRotation: (r: number) => void;
  toggleThumbs: () => void;
  setThumbsOpen: (b: boolean) => void;
  toggleChatsPanel: () => void;
  setChatsPanelOpen: (b: boolean) => void;
  /** Requests the viewer scroll `page` into view (bumps the nonce). */
  requestScroll: (page: number) => void;
  /** Clears a consumed scroll request. Call after honoring `scrollRequest`. */
  consumeScroll: () => void;
  /** Restores every value to its default. Call when switching documents. */
  reset: () => void;
}

const SCALE_MIN = 0.25;
const SCALE_MAX = 5;
const SCALE_STEP = 0.1;

const clampScale = (s: number): number =>
  Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));

/** Normalize an arbitrary degree value into {0, 90, 180, 270}. */
const normalizeRotation = (r: number): number => {
  const mod = ((Math.round(r / 90) * 90) % 360 + 360) % 360;
  return mod;
};

const DEFAULTS: Pick<
  ViewerState,
  | "numPages"
  | "currentPage"
  | "scale"
  | "rotation"
  | "fitMode"
  | "thumbsOpen"
  | "chatsPanelOpen"
  | "scrollRequest"
> = {
  numPages: 0,
  currentPage: 1,
  scale: 0.8,
  rotation: 0,
  fitMode: "custom",
  thumbsOpen: false,
  chatsPanelOpen: true,
  scrollRequest: null,
};

export const useViewerStore = create<ViewerState>()((set, get) => ({
  ...DEFAULTS,

  setNumPages: (n) =>
    set({ numPages: Math.max(0, Math.floor(n)) }),

  setCurrentPage: (n) => {
    const { numPages, currentPage } = get();
    const max = numPages > 0 ? numPages : Number.MAX_SAFE_INTEGER;
    const next = Math.min(max, Math.max(1, Math.floor(n)));
    if (next !== currentPage) set({ currentPage: next });
  },

  setScale: (s) => set({ scale: clampScale(s), fitMode: "custom" }),

  zoomIn: () =>
    set((state) => ({
      scale: clampScale(state.scale + SCALE_STEP),
      fitMode: "custom",
    })),

  zoomOut: () =>
    set((state) => ({
      scale: clampScale(state.scale - SCALE_STEP),
      fitMode: "custom",
    })),

  setFitMode: (m) => set({ fitMode: m }),

  rotateCw: () =>
    set((state) => ({ rotation: (state.rotation + 90) % 360 })),

  setRotation: (r) => set({ rotation: normalizeRotation(r) }),

  toggleThumbs: () => set((state) => ({ thumbsOpen: !state.thumbsOpen })),

  setThumbsOpen: (b) => set({ thumbsOpen: b }),

  toggleChatsPanel: () =>
    set((state) => ({ chatsPanelOpen: !state.chatsPanelOpen })),

  setChatsPanelOpen: (b) => set({ chatsPanelOpen: b }),

  requestScroll: (page) =>
    set((state) => ({
      scrollRequest: {
        page: Math.max(1, Math.floor(page)),
        nonce: (state.scrollRequest?.nonce ?? 0) + 1,
      },
    })),

  consumeScroll: () => set({ scrollRequest: null }),

  reset: () => set({ ...DEFAULTS }),
}));
