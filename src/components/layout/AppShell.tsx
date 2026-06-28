"use client";

import type { ReactNode } from "react";
import { useUiStore } from "@/store/uiStore";
import styles from "./AppShell.module.css";

/**
 * Top-level two-pane layout replicating claude.ai: a collapsible sidebar on the
 * left and a flexible main window on the right. The sidebar persists across
 * route changes; only the main pane swaps. When collapsed it shrinks to a thin
 * rail (the Sidebar renders a mini version with an expand control), giving the
 * PDF more room without overlapping the viewer toolbar.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ""}`}>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
