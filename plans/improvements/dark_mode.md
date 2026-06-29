# Dark Mode

## Goal

Add a persistent dark / light mode toggle to Research Claw so users can read papers
comfortably in low-light environments.

## Approach

**CSS variables only** — every existing component already uses `var(--bg-app)`,
`var(--text-primary)`, etc., so a single `html.dark { ... }` block in `theme.css` is
enough to recolour the entire app with no per-component changes.  PDF page backgrounds
stay white (`--pdf-page-bg: #ffffff`) because the document content itself is light.

**State** — `darkMode: boolean` + `toggleDarkMode` + `setDarkMode` added to
`src/store/uiStore.ts` (same zustand store that owns `sidebarCollapsed`).

**Hydration without flash** — An inline `<script>` in `<head>` (added to
`src/app/layout.tsx`) runs before React hydrates and applies the `dark` class to
`<html>` immediately if `localStorage.getItem('rc-dark-mode') === 'true'`.  The store
starts at `false`; `AppShell` reads localStorage on mount (`useEffect`) and calls
`setDarkMode(true)` if needed.  A second `useEffect` on `[darkMode]` keeps
`document.documentElement.classList` in sync and persists every change.

**Toggle placement** — two locations so it's always reachable:
- **Sidebar header** (expanded): sun/moon button between the brand name and the collapse
  button, grouped in a new `.headerEnd` wrapper.
- **Sidebar mini-rail** (collapsed): third icon below Expand and New Chat.
- **PDF toolbar**: between Go-to-top and the Chat History toggle (item 10 of 11).

## Files changed

| File | Change |
|---|---|
| `src/styles/theme.css` | Added `html.dark { ... }` block with warm dark palette; layout/typography tokens moved to a shared `:root, html.dark` block |
| `src/app/layout.tsx` | Inline `<script>` in `<head>` to prevent flash-of-wrong-theme |
| `src/store/uiStore.ts` | `darkMode`, `toggleDarkMode`, `setDarkMode` added to `UiState` |
| `src/components/layout/AppShell.tsx` | Two `useEffect` hooks: hydrate from localStorage on mount; sync class + persist on change |
| `src/components/viewer/icons/index.tsx` | `MoonIcon` and `SunIcon` added |
| `src/components/sidebar/Sidebar.module.css` | `.headerEnd` wrapper, `.iconSmall` button class; `.collapse` refactored into shared selector with `.iconSmall` |
| `src/components/sidebar/Sidebar.tsx` | Dark toggle button in expanded header and mini-rail |
| `src/components/viewer/PdfToolbar.tsx` | Dark toggle button between go-to-top and chat panel |

## Dark palette

| Token | Light | Dark |
|---|---|---|
| `--bg-app` | `#f5f4ee` | `#1b1a18` |
| `--bg-surface` | `#faf9f5` | `#232220` |
| `--bg-sidebar` | `#f0eee6` | `#1f1e1c` |
| `--bg-hover` | `#ebe9e0` | `#2d2b27` |
| `--accent` | `#d97757` | `#e08560` |
| `--text-primary` | `#141413` | `#f0ede6` |
| `--text-secondary` | `#44423d` | `#c4beb3` |
| `--text-muted` | `#6e6e68` | `#7f796f` |
| `--border` | `#e8e6dc` | `#2e2c28` |
| `--pdf-stage-bg` | `#e8e6de` | `#111110` |
| `--pdf-page-bg` | `#ffffff` | `#ffffff` ← stays white |
