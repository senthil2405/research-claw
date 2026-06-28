import { create } from "zustand";
import type { NormRect } from "@/lib/types";

/** A live text selection awaiting an action (transient; not persisted). */
export interface ActiveSelection {
  pageNumber: number;
  rects: NormRect[];
  selectedText: string;
  /** Viewport coords for placing the selection toolbar (above the selection). */
  anchor: { x: number; y: number };
  /** Viewport bounding box of the selected text (all lines). */
  bounds: { top: number; bottom: number; left: number; right: number };
  /** Viewport rect of the page the selection is on (for quadrant placement). */
  pageBounds: { left: number; top: number; width: number; height: number };
}

/** UI state for one open chat window (the persisted data lives server-side). */
export interface OpenWindow {
  highlightId: string;
  x: number;
  y: number;
  /** Window size in px (resizable). */
  width: number;
  height: number;
  minimized: boolean;
  /** Stacking order; higher = on top. */
  z: number;
}

/** Default chat window size. */
export const DEFAULT_WINDOW_SIZE = { width: 360, height: 460 };

export interface ChatState {
  activeSelection: ActiveSelection | null;
  windows: OpenWindow[];
  hoveredHighlightId: string | null;
  topZ: number;

  setSelection: (sel: ActiveSelection | null) => void;
  /** Open (or focus/un-minimize) a window for a highlight. */
  openWindow: (highlightId: string, pos?: { x: number; y: number }) => void;
  closeWindow: (highlightId: string) => void;
  minimizeWindow: (highlightId: string) => void;
  focusWindow: (highlightId: string) => void;
  moveWindow: (highlightId: string, x: number, y: number) => void;
  /** Update any of a window's geometry (used by resize). */
  setWindowRect: (
    highlightId: string,
    rect: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  setHovered: (highlightId: string | null) => void;
  /** Reset all chat UI state (call on document change). */
  reset: () => void;
}

const DEFAULT_POS = { x: 120, y: 120 };

export const useChatStore = create<ChatState>((set, get) => ({
  activeSelection: null,
  windows: [],
  hoveredHighlightId: null,
  topZ: 1,

  setSelection: (sel) => set({ activeSelection: sel }),

  openWindow: (highlightId, pos) =>
    set((s) => {
      const z = s.topZ + 1;
      const existing = s.windows.find((w) => w.highlightId === highlightId);
      if (existing) {
        return {
          topZ: z,
          windows: s.windows.map((w) =>
            w.highlightId === highlightId ? { ...w, minimized: false, z } : w,
          ),
        };
      }
      // Cascade new windows so they don't perfectly overlap.
      const offset = s.windows.length * 28;
      return {
        topZ: z,
        windows: [
          ...s.windows,
          {
            highlightId,
            x: (pos?.x ?? DEFAULT_POS.x) + offset,
            y: (pos?.y ?? DEFAULT_POS.y) + offset,
            width: DEFAULT_WINDOW_SIZE.width,
            height: DEFAULT_WINDOW_SIZE.height,
            minimized: false,
            z,
          },
        ],
      };
    }),

  closeWindow: (highlightId) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.highlightId !== highlightId),
    })),

  minimizeWindow: (highlightId) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.highlightId === highlightId ? { ...w, minimized: true } : w,
      ),
    })),

  focusWindow: (highlightId) => {
    const z = get().topZ + 1;
    set((s) => ({
      topZ: z,
      windows: s.windows.map((w) =>
        w.highlightId === highlightId ? { ...w, z } : w,
      ),
    }));
  },

  setWindowRect: (highlightId, rect) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.highlightId === highlightId ? { ...w, ...rect } : w,
      ),
    })),

  moveWindow: (highlightId, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.highlightId === highlightId ? { ...w, x, y } : w,
      ),
    })),

  setHovered: (highlightId) => set({ hoveredHighlightId: highlightId }),

  reset: () =>
    set({ activeSelection: null, windows: [], hoveredHighlightId: null, topZ: 1 }),
}));
