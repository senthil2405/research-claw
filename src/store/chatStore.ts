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
  /** Whether the window is docked as a full-height right panel or floating. */
  mode: "panel" | "floating";
  // Floating geometry (only meaningful in floating mode).
  x: number;
  y: number;
  /** Floating window size in px (resizable). */
  width: number;
  height: number;
  /** Panel width in px (adjustable via left-edge drag). */
  panelWidth: number;
  /** Only meaningful in floating mode — hides the window and shows a chip. */
  minimized: boolean;
  /** Stacking order; higher = on top (floating only). */
  z: number;
}

/** Default chat window size (floating). */
export const DEFAULT_WINDOW_SIZE = { width: 360, height: 460 };
/** Fallback panel width (used during SSR or when window is unavailable). */
export const DEFAULT_PANEL_WIDTH = 420;

/** Compute the initial panel width as ~1/3 of the viewport, clamped to [280, 900]. */
function defaultPanelWidth(): number {
  if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
  return Math.min(900, Math.max(280, Math.round(window.innerWidth / 3)));
}

export interface ChatState {
  activeSelection: ActiveSelection | null;
  windows: OpenWindow[];
  hoveredHighlightId: string | null;
  topZ: number;

  setSelection: (sel: ActiveSelection | null) => void;
  /** Open (or focus/un-minimize) a window for a highlight. New windows default to panel mode. */
  openWindow: (highlightId: string, pos?: { x: number; y: number }) => void;
  closeWindow: (highlightId: string) => void;
  /**
   * For panel windows: converts to floating (detaches). For floating windows:
   * hides + shows a chip (existing behavior).
   */
  minimizeWindow: (highlightId: string) => void;
  focusWindow: (highlightId: string) => void;
  moveWindow: (highlightId: string, x: number, y: number) => void;
  /** Update any of a floating window's geometry (used by resize). */
  setWindowRect: (
    highlightId: string,
    rect: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  /** Switch a window between panel and floating mode. */
  setWindowMode: (
    highlightId: string,
    mode: "panel" | "floating",
    pos?: { x: number; y: number },
  ) => void;
  /** Resize the right panel (used by left-edge drag). */
  setPanelWidth: (highlightId: string, width: number) => void;
  setHovered: (highlightId: string | null) => void;
  /** Reset all chat UI state (call on document change). */
  reset: () => void;
}

const DEFAULT_POS = { x: 120, y: 120 };
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 900;

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
        // Un-minimize and focus; keep existing mode.
        return {
          topZ: z,
          windows: s.windows.map((w) =>
            w.highlightId === highlightId ? { ...w, minimized: false, z } : w,
          ),
        };
      }
      // New window: default to panel mode.
      // If a panel is already open, replace it (remove it) so the new chat
      // takes over the panel slot. Floating windows are left untouched.
      const existingPanel = s.windows.find((w) => w.mode === "panel");
      const withoutPanel = existingPanel
        ? s.windows.filter((w) => w.highlightId !== existingPanel.highlightId)
        : s.windows;
      const panelWidth = existingPanel?.panelWidth ?? defaultPanelWidth();
      return {
        topZ: z,
        windows: [
          ...withoutPanel,
          {
            highlightId,
            mode: "panel",
            x: pos?.x ?? DEFAULT_POS.x,
            y: pos?.y ?? DEFAULT_POS.y,
            width: DEFAULT_WINDOW_SIZE.width,
            height: DEFAULT_WINDOW_SIZE.height,
            panelWidth,
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
    set((s) => {
      const win = s.windows.find((w) => w.highlightId === highlightId);
      if (!win) return s;
      if (win.mode === "panel") {
        // Panel minimize = convert to floating near the right edge.
        const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
        return {
          windows: s.windows.map((w) =>
            w.highlightId === highlightId
              ? {
                  ...w,
                  mode: "floating" as const,
                  x: Math.max(0, vw - (w.width + 40)),
                  y: 120,
                  minimized: false,
                }
              : w,
          ),
        };
      }
      // Floating minimize = hide (chip on highlight).
      return {
        windows: s.windows.map((w) =>
          w.highlightId === highlightId ? { ...w, minimized: true } : w,
        ),
      };
    }),

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

  setWindowMode: (highlightId, mode, pos) =>
    set((s) => {
      const z = s.topZ + 1;
      if (mode === "panel") {
        // Convert to panel: enforce single-panel invariant first.
        const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
        const updated = s.windows.map((w) => {
          if (w.highlightId === highlightId) return w;
          if (w.mode === "panel")
            return {
              ...w,
              mode: "floating" as const,
              x: Math.max(0, vw - (w.panelWidth + 40)),
              y: 120,
            };
          return w;
        });
        return {
          topZ: z,
          windows: updated.map((w) =>
            w.highlightId === highlightId
              ? { ...w, mode: "panel" as const, minimized: false, z }
              : w,
          ),
        };
      }
      // Convert to floating.
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const target = s.windows.find((w) => w.highlightId === highlightId);
      const floatX =
        pos?.x ?? (target ? Math.max(0, vw - target.width - 40) : DEFAULT_POS.x);
      const floatY = pos?.y ?? 120;
      return {
        topZ: z,
        windows: s.windows.map((w) =>
          w.highlightId === highlightId
            ? {
                ...w,
                mode: "floating" as const,
                x: floatX,
                y: floatY,
                minimized: false,
                z,
              }
            : w,
        ),
      };
    }),

  setPanelWidth: (highlightId, width) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.highlightId === highlightId
          ? {
              ...w,
              panelWidth: Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width)),
            }
          : w,
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
