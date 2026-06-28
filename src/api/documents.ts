// Document data access: list/get/delete via the JSON wrapper, plus an
// XHR-based upload so we can surface upload progress.

import { apiDelete, apiGet } from "@/lib/apiClient";
import type {
  ApiError,
  DocumentListResponse,
  DocumentMeta,
} from "@/lib/types";

/** List the current user's documents. */
export async function fetchDocuments(): Promise<DocumentMeta[]> {
  return apiGet<DocumentListResponse>("/api/documents").then((r) => r.documents);
}

/** Fetch a single document's metadata. */
export async function fetchDocument(id: string): Promise<DocumentMeta> {
  return apiGet<DocumentMeta>("/api/documents/" + id);
}

/** Same-origin URL of a document's PDF stream (cookies sent automatically). */
export function documentFileUrl(id: string): string {
  return "/api/documents/" + id + "/file";
}

/** Delete a document. */
export async function deleteDocument(id: string): Promise<void> {
  return apiDelete("/api/documents/" + id);
}

/**
 * Upload a PDF via XMLHttpRequest so we get real upload-progress events.
 * Resolves with the created DocumentMeta (201), rejects with the parsed
 * `error` message (or a generic message on network failure).
 */
export function uploadDocument(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DocumentMeta> {
  return new Promise<DocumentMeta>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable && e.total > 0) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as DocumentMeta);
        } catch {
          reject(new Error("Failed to parse upload response."));
        }
        return;
      }
      let message = xhr.statusText || "Upload failed.";
      try {
        const body = JSON.parse(xhr.responseText) as Partial<ApiError>;
        if (body && typeof body.error === "string" && body.error.length > 0) {
          message = body.error;
        }
      } catch {
        // Non-JSON error body; keep the status-text fallback.
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload aborted."));

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
