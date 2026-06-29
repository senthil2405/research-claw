"use client";

import { useEffect, type ReactNode } from "react";
import { useUiStore } from "@/store/uiStore";
import styles from "./AppShell.module.css";

/**
 * Top-level two-pane layout replicating claude.ai: a collapsible sidebar on the
 * left and a flexible main window on the right. The sidebar persists across
 * route changes; only the main pane swaps. When collapsed it shrinks to a thin
 * rail (the Sidebar renders a mini version with an expand control), giving the
 * PDF more room without overlapping the viewer toolbar.
 *
 * Also owns the dark-mode lifecycle: reads localStorage on mount and syncs the
 * `dark` class on <html> + persists on every toggle.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const darkMode = useUiStore((s) => s.darkMode);
  const setDarkMode = useUiStore((s) => s.setDarkMode);

  // Hydrate dark-mode preference from localStorage after mount (localStorage is
  // unavailable during SSR). Dark is the default; we only switch to light if the
  // user has explicitly saved that preference ('false'). null = new user = dark.
  useEffect(() => {
    try {
      if (localStorage.getItem("rc-dark-mode") === "false") {
        setDarkMode(false);
      }
    } catch (_) {
      // localStorage blocked (private browsing, permissions) — ignore.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep <html class="dark"> in sync with the store and persist every change.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem("rc-dark-mode", String(darkMode));
    } catch (_) {}
  }, [darkMode]);

  // Cmd/Ctrl + . toggles the sidebar from anywhere in the app.
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ""}`}>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
