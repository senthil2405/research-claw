"use client";

import { useDocuments } from "@/hooks/useDocuments";
import { useAuth } from "@/hooks/useAuth";
import { DocumentHistoryItem } from "./DocumentHistoryItem";
import styles from "./DocumentHistoryList.module.css";

const SKELETON_ROWS = 5;

/**
 * Scrollable "Recents" list of the user's uploaded PDFs.
 * Handles loading, logged-out, and empty states distinctly.
 */
export function DocumentHistoryList() {
  const { documents, isLoading } = useDocuments();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  return (
    <nav className={styles.list} aria-label="Document history">
      <div className={styles.sectionLabel}>Recents</div>

      {isLoading || authLoading ? (
        <ul className={styles.items}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <li key={i} className={styles.skeleton} aria-hidden="true" />
          ))}
        </ul>
      ) : documents.length === 0 ? (
        <p className={styles.empty}>
          {isAuthenticated
            ? "No documents yet — upload a PDF"
            : "Log in to save your history"}
        </p>
      ) : (
        <ul className={styles.items}>
          {documents.map((doc) => (
            <DocumentHistoryItem key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </nav>
  );
}
