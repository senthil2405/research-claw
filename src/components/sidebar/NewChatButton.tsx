"use client";

import { useRouter } from "next/navigation";
import styles from "./NewChatButton.module.css";

/**
 * Prominent "New chat" action. Navigates home, where a fresh upload flow lives.
 */
export function NewChatButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => router.push("/")}
    >
      <span className={styles.icon} aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </span>
      <span className={styles.label}>New chat</span>
    </button>
  );
}
