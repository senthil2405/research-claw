"use client";

import { useRouter } from "next/navigation";
import { NewChatButton } from "./NewChatButton";
import { DocumentHistoryList } from "./DocumentHistoryList";
import { UserMenu } from "./UserMenu";
import { useUiStore } from "@/store/uiStore";
import { MoonIcon, SunIcon } from "@/components/viewer/icons";
import styles from "./Sidebar.module.css";

function ClawGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

/**
 * The persistent left sidebar for Research Claw, modeled after claude.ai.
 * Self-contained: reads auth/document/UI state and navigation internally.
 * Collapses to a thin rail (expand + New chat) via the UI store.
 */
export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const darkMode = useUiStore((s) => s.darkMode);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const router = useRouter();

  if (collapsed) {
    return (
      <div className={styles.mini}>
        <button
          type="button"
          className={styles.miniButton}
          aria-label="Expand sidebar"
          title="Expand sidebar (⌘. / Ctrl+.)"
          onClick={() => setCollapsed(false)}
        >
          <ClawGlyph />
        </button>
        <button
          type="button"
          className={styles.miniButton}
          aria-label="New chat"
          title="New chat"
          onClick={() => router.push("/")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.miniButton}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          title={darkMode ? "Light mode" : "Dark mode"}
          onClick={toggleDarkMode}
        >
          {darkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <header className={styles.brand}>
        <span className={styles.brandGlyph} aria-hidden="true">
          <ClawGlyph />
        </span>
        <span className={styles.brandName}>Research Claw</span>
        <div className={styles.headerEnd}>
          <button
            type="button"
            className={styles.iconSmall}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Light mode" : "Dark mode"}
            onClick={toggleDarkMode}
          >
            {darkMode ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
          <button
            type="button"
            className={styles.collapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar (⌘. / Ctrl+.)"
            onClick={() => setCollapsed(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className={styles.actions}>
        <NewChatButton />
      </div>

      <DocumentHistoryList />

      <UserMenu />
    </div>
  );
}
