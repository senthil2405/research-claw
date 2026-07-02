import type { FileStore } from "./store";
import { localFileStore } from "./localStore";
import { r2FileStore } from "./r2Store";

/**
 * The active file store, selected by the STORAGE_DRIVER env var:
 *   - "r2"    → Cloudflare R2 (production)
 *   - other   → local filesystem (dev/test; the default)
 *
 * Both implement the same FileStore interface, so call sites are agnostic.
 */
export const fileStore: FileStore =
  process.env.STORAGE_DRIVER === "r2" ? r2FileStore : localFileStore;
