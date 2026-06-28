import { create } from "zustand";

/** App-chrome UI state shared across routes (module-level, survives nav). */
export interface UiState {
  /** Whether the left app sidebar (Research Claw) is collapsed/hidden. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (b: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (b) => set({ sidebarCollapsed: b }),
}));
