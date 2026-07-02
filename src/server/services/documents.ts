import { randomUUID } from "node:crypto";

import type { Document } from "@prisma/client";

import { prisma } from "@/server/db";
import { fileStore } from "@/server/files";
import { logWarn } from "@/server/logger";
import { getPageCount, getPdfTitle } from "@/server/pdf";
import { ownerWhere, type OwnerRef } from "@/server/owner";
import type { DocumentMeta } from "@/lib/types";

/**
 * Map a Prisma Document row to the public API shape. Never exposes the
 * storedName, owner ids, or any filesystem detail.
 */
export function toDocumentMeta(doc: Document): DocumentMeta {
  return {
    id: doc.id,
    filename: doc.filename,
    sizeBytes: doc.sizeBytes,
    pageCount: doc.pageCount ?? null,
    title: doc.title ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface CreateDocumentInput {
  buffer: Buffer;
  filename: string;
  sizeBytes: number;
}

/**
 * Persist a validated PDF upload: parse its page count, write the bytes to the
 * file store, then create the DB row. Guarantees no orphan files — if the DB
 * write fails the stored file is removed (best-effort) before rethrowing.
 *
 * Rethrows if `getPageCount` fails so the route can map it to a 415.
 */
export async function createDocument(
  owner: OwnerRef,
  input: CreateDocumentInput,
): Promise<DocumentMeta> {
  // getPageCount throws on invalid PDF — let the caller map to 415.
  // getPdfTitle never throws (returns null on failure) so run in parallel.
  const [pageCount, title] = await Promise.all([
    getPageCount(input.buffer),
    getPdfTitle(input.buffer),
  ]);

  const storedName = `${randomUUID()}.pdf`;
  await fileStore.save(storedName, input.buffer);

  try {
    const doc = await prisma.document.create({
      data: {
        ...ownerWhere(owner),
        filename: input.filename,
        storedName,
        sizeBytes: input.sizeBytes,
        pageCount,
        title,
      },
    });
    return toDocumentMeta(doc);
  } catch (err) {
    // Avoid leaving an orphan file when the DB write fails.
    await fileStore
      .delete(storedName)
      .catch((e) =>
        logWarn("orphan file cleanup failed after DB write error", {
          storedName,
          err: String(e),
        }),
      );
    throw err;
  }
}

/** List an owner's documents, newest first. */
export async function listDocuments(owner: OwnerRef): Promise<DocumentMeta[]> {
  const docs = await prisma.document.findMany({
    where: ownerWhere(owner),
    orderBy: { createdAt: "desc" },
  });
  return docs.map(toDocumentMeta);
}

/**
 * Fetch a single document scoped to the owner. Returns the FULL Prisma row
 * (callers need storedName for streaming/deletion) or null if not owned.
 */
export async function getOwnedDocument(
  owner: OwnerRef,
  id: string,
): Promise<Document | null> {
  return prisma.document.findFirst({
    where: { id, ...ownerWhere(owner) },
  });
}

/**
 * Delete an owned document and its stored file. Returns false if the document
 * does not exist or is not owned by `owner`.
 */
export async function deleteDocument(
  owner: OwnerRef,
  id: string,
): Promise<boolean> {
  const doc = await getOwnedDocument(owner, id);
  if (!doc) return false;

  // Best-effort file removal; the row is the source of truth.
  await fileStore
    .delete(doc.storedName)
    .catch((e) =>
      logWarn("file removal failed during document delete", {
        storedName: doc.storedName,
        err: String(e),
      }),
    );
  await prisma.document.delete({ where: { id: doc.id } });
  return true;
}
