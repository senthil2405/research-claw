import type { Readable } from "node:stream";

export interface SaveResult {
  sizeBytes: number;
}

export interface FileStat {
  size: number;
}

export interface FileStore {
  /** Write a buffer to storage under storedName. Atomic: write to a temp file then rename. */
  save(storedName: string, data: Buffer): Promise<SaveResult>;
  /** Stat the stored file (throws if missing). */
  stat(storedName: string): Promise<FileStat>;
  /** Create a Node Readable stream for the whole file or a byte range [start,end] inclusive. */
  createReadStream(
    storedName: string,
    range?: { start: number; end: number },
  ): Readable;
  /** Delete the file; resolve even if already missing (idempotent). */
  delete(storedName: string): Promise<void>;
}

/**
 * Validate that `storedName` is a single safe path segment with no separators,
 * traversal, NUL bytes, or absolute-path markers. Throws on anything suspicious.
 */
export function assertSafeStoredName(storedName: string): void {
  if (typeof storedName !== "string" || storedName.length === 0) {
    throw new Error("Invalid storedName: must be a non-empty string");
  }
  if (storedName.length > 255) {
    throw new Error("Invalid storedName: too long");
  }
  // Reject path separators (both POSIX and Windows), parent refs, NUL, and
  // leading dots that could resolve oddly.
  if (
    storedName.includes("/") ||
    storedName.includes("\\") ||
    storedName.includes("\0") ||
    storedName === "." ||
    storedName === ".." ||
    storedName.includes("..")
  ) {
    throw new Error("Invalid storedName: path traversal is not allowed");
  }
}
