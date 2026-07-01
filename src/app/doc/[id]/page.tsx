"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { DocViewer } from "@/components/viewer/DocViewer";
import { documentFileUrl, fetchDocument } from "@/api/documents";
import styles from "./page.module.css";

export default function DocPage() {
  const params = useParams();
  const id = String(params.id);

  // Used only for the toolbar title; the file URL is derivable immediately so
  // the viewer never waits on this request.
  const { data: doc, isError } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDocument(id),
    retry: false,
  });

  const src = documentFileUrl(id);

  return (
    <AppShell sidebar={<Sidebar />}>
      {isError ? (
        <div className={styles.missing}>
          <h1 className={styles.missingTitle}>Document not found</h1>
          <p className={styles.missingHint}>
            This document doesn’t exist or you don’t have access to it.
          </p>
          <Link href="/" className={styles.missingLink}>
            Back to upload
          </Link>
        </div>
      ) : (
        <DocViewer src={src} documentId={id} filename={doc?.filename} paperTitle={doc?.title ?? undefined} />
      )}
    </AppShell>
  );
}
