"use client";

import { useCallback, useState } from "react";
import {
  useDropzone,
  type FileRejection,
  type DropzoneOptions,
} from "react-dropzone";
import styles from "./DropzonePdf.module.css";

const MAX_SIZE = 26214400; // 25 MB

export interface DropzonePdfProps {
  /** Called with the single accepted PDF file. */
  onAccepted: (file: File) => void;
  /** Disables interaction (e.g. while an upload is in flight). */
  disabled?: boolean;
}

/** Human-readable message for the first rejection's first error. */
function rejectionMessage(rejection: FileRejection | undefined): string | null {
  const err = rejection?.errors[0];
  if (!err) return null;
  switch (err.code) {
    case "file-invalid-type":
      return "That file isn’t a PDF. Please choose a PDF.";
    case "file-too-large":
      return "That PDF is larger than 25 MB.";
    case "too-many-files":
      return "Please drop just one PDF at a time.";
    default:
      return err.message || "That file can’t be uploaded.";
  }
}

/**
 * A react-dropzone drop target restricted to a single PDF up to 25 MB.
 * Purely presentational + selection — the parent owns the upload.
 */
export function DropzonePdf({ onAccepted, disabled }: DropzonePdfProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback<NonNullable<DropzoneOptions["onDrop"]>>(
    (accepted, rejections) => {
      if (rejections.length > 0) {
        setError(rejectionMessage(rejections[0]));
        return;
      }
      if (accepted.length > 0) {
        setError(null);
        onAccepted(accepted[0]);
      }
    },
    [onAccepted],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      accept: { "application/pdf": [".pdf"] },
      maxFiles: 1,
      multiple: false,
      maxSize: MAX_SIZE,
      disabled,
      onDrop,
    });

  const zoneClass = [
    styles.zone,
    isDragActive ? styles.dragActive : "",
    isDragReject ? styles.dragReject : "",
    disabled ? styles.disabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.wrap}>
      <div {...getRootProps({ className: zoneClass })}>
        <input {...getInputProps()} className={styles.input} />
        <span className={styles.icon} aria-hidden="true">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
            <polyline points="9 13 12 10 15 13" />
            <line x1="12" y1="10" x2="12" y2="20" />
          </svg>
        </span>
        <p className={styles.primary}>
          {isDragReject
            ? "Only a single PDF is allowed"
            : isDragActive
              ? "Drop the PDF to upload"
              : "Drag a PDF here, or click to upload"}
        </p>
        <p className={styles.sub}>PDF up to 25 MB</p>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DropzonePdf;
