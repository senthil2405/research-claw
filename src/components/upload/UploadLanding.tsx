"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useUploadDocument } from "@/hooks/useUploadDocument";
import { DropzonePdf } from "./DropzonePdf";
import styles from "./UploadLanding.module.css";

/**
 * The empty/landing main view. Centers a serif headline above a PDF dropzone.
 * On a successful upload it navigates to the new document's viewer route.
 */
export function UploadLanding() {
  const upload = useUploadDocument();
  const router = useRouter();
  const [filename, setFilename] = useState<string | null>(null);

  const { mutate, isPending, isError, error, progress } = upload;

  const handleAccepted = useCallback(
    (file: File) => {
      setFilename(file.name);
      mutate(file, {
        onSuccess: (meta) => {
          router.push("/doc/" + meta.id);
        },
      });
    },
    [mutate, router],
  );

  return (
    <div className={styles.root}>
      <div className={styles.column}>
        <h1 className={styles.headline}>Drop a paper to start reading</h1>
        <p className={styles.tagline}>
          Upload a PDF and Research Claw opens it in the reader.
        </p>

        <DropzonePdf onAccepted={handleAccepted} disabled={isPending} />

        {isPending ? (
          <div className={styles.progress} aria-live="polite">
            <div className={styles.progressHead}>
              <span className={styles.progressName} title={filename ?? undefined}>
                {filename ?? "Uploading…"}
              </span>
              <span className={styles.progressPct}>{progress}%</span>
            </div>
            <div
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className={styles.fill}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {isError ? (
          <p className={styles.error} role="alert">
            {error?.message ?? "Upload failed. Please try again."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default UploadLanding;
