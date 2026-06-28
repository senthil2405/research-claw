import type {
  ChatMessage,
  ChatSession,
  Highlight,
} from "@prisma/client";

import { prisma } from "@/server/db";
import { localFileStore } from "@/server/files/localStore";
import { extractPdfText } from "@/server/pdf";
import { resolveClaudeAuth, runClaudeTurn, withSessionLock } from "@/server/claude";
import { getOwnedDocument } from "@/server/services/documents";
import type { OwnerRef } from "@/server/owner";
import type {
  ChatMessageDTO,
  CreateHighlightInput,
  HighlightDTO,
  NormRect,
  SendMessageResponse,
} from "@/lib/types";

/**
 * Thrown when an ownership/existence check fails (document not owned, or a
 * highlight that doesn't belong to the document). Routes catch this and map it
 * to a 404 so cross-owner access is indistinguishable from "not found".
 */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Max characters of extracted PDF text injected into the system prompt. */
const MAX_PDF_TEXT_CHARS = 120_000;

/**
 * Process-level cache of extracted PDF text, keyed by documentId. Extraction is
 * expensive (parses every page) and the bytes are immutable for a given
 * document, so we reuse the result for the life of the server process.
 */
const pdfTextCache = new Map<string, string>();

// ---- DTO mappers ----------------------------------------------------------

export function toHighlightDTO(row: Highlight): HighlightDTO {
  let rects: NormRect[] = [];
  try {
    const parsed = JSON.parse(row.rects);
    if (Array.isArray(parsed)) rects = parsed as NormRect[];
  } catch {
    // Corrupt/empty JSON → treat as no rects rather than crashing the read path.
    rects = [];
  }
  return {
    id: row.id,
    documentId: row.documentId,
    pageNumber: row.pageNumber,
    rects,
    selectedText: row.selectedText,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toChatMessageDTO(row: ChatMessage): ChatMessageDTO {
  return {
    id: row.id,
    highlightId: row.highlightId,
    role: row.role as "user" | "assistant",
    content: row.content,
    highlightText: row.highlightText ?? null,
    turnIndex: row.turnIndex,
    seq: row.seq,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---- Ownership helpers ----------------------------------------------------

/** Verify ownership and return the full document row, or throw NotFoundError. */
async function requireOwnedDocument(owner: OwnerRef, documentId: string) {
  const doc = await getOwnedDocument(owner, documentId);
  if (!doc) throw new NotFoundError("Document not found");
  return doc;
}

/** Verify a highlight exists and belongs to the document, or throw. */
async function requireHighlight(
  documentId: string,
  highlightId: string,
): Promise<Highlight> {
  const highlight = await prisma.highlight.findFirst({
    where: { id: highlightId, documentId },
  });
  if (!highlight) throw new NotFoundError("Highlight not found");
  return highlight;
}

// ---- Highlights -----------------------------------------------------------

export async function listHighlights(
  owner: OwnerRef,
  documentId: string,
): Promise<HighlightDTO[]> {
  await requireOwnedDocument(owner, documentId);
  const rows = await prisma.highlight.findMany({
    where: { documentId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toHighlightDTO);
}

export async function createHighlight(
  owner: OwnerRef,
  documentId: string,
  input: CreateHighlightInput,
): Promise<HighlightDTO> {
  await requireOwnedDocument(owner, documentId);
  const row = await prisma.highlight.create({
    data: {
      documentId,
      pageNumber: input.pageNumber,
      rects: JSON.stringify(input.rects),
      selectedText: input.selectedText,
    },
  });
  return toHighlightDTO(row);
}

export async function deleteHighlight(
  owner: OwnerRef,
  documentId: string,
  highlightId: string,
): Promise<boolean> {
  await requireOwnedDocument(owner, documentId);
  const result = await prisma.highlight.deleteMany({
    where: { id: highlightId, documentId },
  });
  return result.count > 0;
}

// ---- Messages -------------------------------------------------------------

export async function listMessages(
  owner: OwnerRef,
  documentId: string,
  highlightId?: string,
): Promise<ChatMessageDTO[]> {
  await requireOwnedDocument(owner, documentId);

  if (highlightId) {
    const rows = await prisma.chatMessage.findMany({
      where: { highlightId, highlight: { documentId } },
      orderBy: { turnIndex: "asc" },
    });
    return rows.map(toChatMessageDTO);
  }

  const rows = await prisma.chatMessage.findMany({
    where: { session: { documentId } },
    orderBy: { seq: "asc" },
  });
  return rows.map(toChatMessageDTO);
}

// ---- Session + PDF text helpers -------------------------------------------

/** Get-or-create the single ChatSession for a document. */
async function getOrCreateSession(documentId: string): Promise<ChatSession> {
  return prisma.chatSession.upsert({
    where: { documentId },
    update: {},
    create: { documentId },
  });
}

/** Read the PDF bytes for a stored document into a Buffer. */
async function readPdfBuffer(storedName: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = localFileStore.createReadStream(storedName);
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Extract (and cache) the full text of a document's PDF. */
async function getPdfText(
  documentId: string,
  storedName: string,
): Promise<string> {
  const cached = pdfTextCache.get(documentId);
  if (cached !== undefined) return cached;

  const buf = await readPdfBuffer(storedName);
  // pdfjs (used by extractPdfText) rejects a Node Buffer — it requires a plain
  // Uint8Array. Copy into one so the bytes aren't tied to Buffer's pool.
  const text = await extractPdfText(new Uint8Array(buf));
  pdfTextCache.set(documentId, text);
  return text;
}

function buildSystemPrompt(filename: string, pdfText: string): string {
  let injected = pdfText;
  if (injected.length > MAX_PDF_TEXT_CHARS) {
    injected = injected.slice(0, MAX_PDF_TEXT_CHARS) + "\n[truncated]";
  }
  return (
    "You are a research assistant helping a user understand a specific " +
    "academic paper. Answer their questions clearly and concisely, grounded " +
    "in the paper. When they reference a highlighted passage, focus on it but " +
    "use the whole paper as context.\n\n" +
    `=== PAPER: ${filename} ===\n${injected}\n=== END PAPER ===`
  );
}

function buildUserMessage(selectedText: string, question: string): string {
  const passage = selectedText.trim();
  if (!passage) return question;
  return `Regarding this passage from the paper:\n\n"""${passage}"""\n\n${question}`;
}

// ---- Send a message -------------------------------------------------------

export async function sendMessage(
  owner: OwnerRef,
  documentId: string,
  highlightId: string,
  question: string,
): Promise<SendMessageResponse> {
  const doc = await requireOwnedDocument(owner, documentId);
  const highlight = await requireHighlight(documentId, highlightId);

  const session = await getOrCreateSession(documentId);

  const pdfText = await getPdfText(documentId, doc.storedName);
  const systemPrompt = buildSystemPrompt(doc.filename, pdfText);
  const userMessage = buildUserMessage(highlight.selectedText, question);

  const auth = await resolveClaudeAuth(owner);
  const result = await withSessionLock(documentId, () =>
    runClaudeTurn({
      documentId,
      systemPrompt,
      userMessage,
      resumeSessionId: session.claudeSessionId,
      auth,
    }),
  );

  // turnIndex is per-window; seq is global within the session.
  const turnIndex = await prisma.chatMessage.count({ where: { highlightId } });
  const userSeq = session.seqCounter;
  const assistantSeq = userSeq + 1;

  const [userRow, assistantRow] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        highlightId,
        role: "user",
        content: question,
        highlightText: highlight.selectedText,
        turnIndex,
        seq: userSeq,
      },
    }),
    prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        highlightId,
        role: "assistant",
        content: result.text,
        highlightText: null,
        turnIndex: turnIndex + 1,
        seq: assistantSeq,
      },
    }),
    prisma.chatSession.update({
      where: { id: session.id },
      data: {
        claudeSessionId: result.sessionId,
        seqCounter: session.seqCounter + 2,
      },
    }),
  ]);

  return {
    userMessage: toChatMessageDTO(userRow),
    assistantMessage: toChatMessageDTO(assistantRow),
  };
}
