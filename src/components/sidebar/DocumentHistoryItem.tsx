"use client";

import { useParams, useRouter } from "next/navigation";
import { useDeleteDocument } from "@/hooks/useDeleteDocument";
import type { DocumentMeta } from "@/lib/types";
import styles from "./DocumentHistoryItem.module.css";

/** Compact relative-time string ("today", "3d ago", "Mar 4"). */
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return days + "d ago";
  if (days < 30) return Math.floor(days / 7) + "w ago";
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * A single document row in the history list. Click to open; hover reveals a
 * delete control. Highlights when its id matches the current /doc/[id] route.
 */
export function DocumentHistoryItem({ doc }: { doc: DocumentMeta }) {
  const router = useRouter();
  const params = useParams();
  const deleteDoc = useDeleteDocument();

  const rawId = params?.id;
  const activeId = Array.isArray(rawId) ? rawId[0] : rawId;
  const isActive = activeId === doc.id;

  const meta = [
    doc.pageCount != null ? `${doc.pageCount} pp` : null,
    relativeDate(doc.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleteDoc.isPending) return;
    deleteDoc.mutate(doc.id, {
      onSuccess: () => {
        if (isActive) router.push("/");
      },
    });
  }

  return (
    <li
      className={`${styles.item} ${isActive ? styles.active : ""}`}
      onClick={() => router.push("/doc/" + doc.id)}
      role="link"
      tabIndex={0}
      aria-current={isActive ? "page" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push("/doc/" + doc.id);
        }
      }}
    >
      <span className={styles.text}>
        <span className={styles.filename}>{doc.filename}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>

      <button
        type="button"
        className={styles.deleteButton}
        onClick={handleDelete}
        disabled={deleteDoc.isPending}
        aria-label={`Delete ${doc.filename}`}
        title="Delete"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </li>
  );
}
