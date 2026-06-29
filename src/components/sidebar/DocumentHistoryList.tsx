"use client";

import { useDocuments } from "@/hooks/useDocuments";
import { useAuth } from "@/hooks/useAuth";
import { DocumentHistoryItem } from "./DocumentHistoryItem";
import type { DocumentMeta } from "@/lib/types";
import styles from "./DocumentHistoryList.module.css";

const SKELETON_ROWS = 5;

type DateBucket = "Today" | "Yesterday" | "This week" | "This month" | "Older";
const BUCKET_ORDER: DateBucket[] = [
  "Today",
  "Yesterday",
  "This week",
  "This month",
  "Older",
];

export function getDateBucket(isoDate: string): DateBucket {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const thenStart = (() => {
    const d = new Date(isoDate);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const diffDays = Math.round((todayStart - thenStart) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return "Older";
}

export function groupDocsByDate(
  docs: DocumentMeta[],
): { label: DateBucket; docs: DocumentMeta[] }[] {
  const map = new Map<DateBucket, DocumentMeta[]>(
    BUCKET_ORDER.map((b) => [b, []]),
  );
  for (const doc of docs) {
    map.get(getDateBucket(doc.createdAt))!.push(doc);
  }
  return BUCKET_ORDER.filter((b) => map.get(b)!.length > 0).map((b) => ({
    label: b,
    docs: map.get(b)!,
  }));
}

/**
 * Scrollable document history grouped by upload date (Today / Yesterday /
 * This week / This month / Older). Handles loading, logged-out, and empty
 * states distinctly.
 */
export function DocumentHistoryList() {
  const { documents, isLoading } = useDocuments();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const groups = groupDocsByDate(documents ?? []);

  return (
    <nav className={styles.list} aria-label="Document history">
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
        groups.map((group) => (
          <div key={group.label}>
            <div className={styles.groupLabel}>{group.label}</div>
            <ul className={styles.items}>
              {group.docs.map((doc) => (
                <DocumentHistoryItem key={doc.id} doc={doc} />
              ))}
            </ul>
          </div>
        ))
      )}
    </nav>
  );
}
