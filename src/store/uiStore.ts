import { create } from "zustand";

/** App-chrome UI state shared across routes (module-level, survives nav). */
export interface UiState {
  /** Whether the left app sidebar (Research Claw) is collapsed/hidden. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (b: boolean) => void;

  /** Whether the app is in dark mode. Persisted to localStorage as `rc-dark-mode`. */
  darkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (b: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (b) => set({ sidebarCollapsed: b }),

  // Initialise to true (dark by default); AppShell checks localStorage on mount
  // and switches to light only if the user has explicitly saved that preference.
  darkMode: true,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setDarkMode: (b) => set({ darkMode: b }),
}));
