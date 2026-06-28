import { createReadStream as fsCreateReadStream } from "node:fs";
import { mkdir, rename, stat as fsStat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";

import {
  assertSafeStoredName,
  type FileStat,
  type FileStore,
  type SaveResult,
} from "./store";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./storage/uploads";

/** Resolve the absolute base upload directory (handles relative or absolute UPLOAD_DIR). */
function baseDir(): string {
  return path.isAbsolute(UPLOAD_DIR)
    ? UPLOAD_DIR
    : path.join(process.cwd(), UPLOAD_DIR);
}

/** Resolve the absolute path for a validated storedName. */
function absPathFor(storedName: string): string {
  assertSafeStoredName(storedName);
  return path.join(baseDir(), storedName);
}

export class LocalFileStore implements FileStore {
  async save(storedName: string, data: Buffer): Promise<SaveResult> {
    const dir = baseDir();
    const absPath = absPathFor(storedName);
    const tmpPath = `${absPath}.tmp-${randomBytes(8).toString("hex")}`;

    await mkdir(dir, { recursive: true });

    try {
      await writeFile(tmpPath, data);
      await rename(tmpPath, absPath);
    } catch (err) {
      // Best-effort cleanup of the temp file; ignore if it never existed.
      await unlink(tmpPath).catch(() => {});
      throw err;
    }

    return { sizeBytes: data.length };
  }

  async stat(storedName: string): Promise<FileStat> {
    const absPath = absPathFor(storedName);
    const s = await fsStat(absPath);
    return { size: s.size };
  }

  createReadStream(
    storedName: string,
    range?: { start: number; end: number },
  ): Readable {
    const absPath = absPathFor(storedName);
    return fsCreateReadStream(
      absPath,
      range ? { start: range.start, end: range.end } : undefined,
    );
  }

  async delete(storedName: string): Promise<void> {
    const absPath = absPathFor(storedName);
    try {
      await unlink(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }
}

export const localFileStore = new LocalFileStore();
