import type {
  ChatMessage,
  ChatSession,
  Highlight,
} from "@prisma/client";

import { prisma } from "@/server/db";
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
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    durationMs: row.durationMs ?? null,
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

// ---- Session helper -------------------------------------------------------

/** Get-or-create the single ChatSession for a document. */
async function getOrCreateSession(documentId: string): Promise<ChatSession> {
  return prisma.chatSession.upsert({
    where: { documentId },
    update: {},
    create: { documentId },
  });
}

function buildSystemPrompt(filename: string): string {
  return `\
You are a question answering agent helping someone read and understand a research paper called "${filename}". 

When explaining unfamiliar concepts, technologies, or terminology in this document, follow these conventions:
0. Give answers in the same way you would write abd explain answers in a descriptive examination, be specific with the details and dont use any lingo terms like .. etc keep the answer descriptive, if you are refering to something name what are you referin to `
}

function buildUserMessage(selectedText: string, question: string, paperTitle?: string | null): string {
  const passage = selectedText.trim();
  const q = question.trim();
  if (!passage) {
    return paperTitle ? `The paper being discussed is "${paperTitle}".\n\n${q}` : q;
  }
  const passageBlock = `Regarding this passage from the paper:\n\n"""${passage}"""`;
  return q ? `${passageBlock}\n\n${q}` : passageBlock;
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

  const paperTitle = doc.title ?? null;
  const systemPrompt = buildSystemPrompt(paperTitle ?? doc.filename.replace(/\.pdf$/i, ""));
  const userMessage = buildUserMessage(highlight.selectedText, question, paperTitle);
  const auth = await resolveClaudeAuth(owner);

  // The entire critical section — session read, user turn, and the DB
  // transaction that writes messages + advances the seq counter — runs inside
  // the per-document lock so seqCounter and turnIndex reads are always fresh.
  return withSessionLock(documentId, async () => {
    const session = await getOrCreateSession(documentId);

    // The full PDF text is already in the system prompt, so Claude has context
    // from the very first message — no separate priming turn needed.
    const turnResult = await runClaudeTurn({
      documentId,
      systemPrompt,
      userMessage,
      resumeSessionId: session.claudeSessionId,
      auth,
    });

    // turnIndex and seqCounter are read inside the lock so no concurrent
    // request can interleave and produce duplicate values.
    const turnIndex = await prisma.chatMessage.count({ where: { highlightId } });
    const userSeq = session.seqCounter;

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
          content: turnResult.text,
          highlightText: null,
          turnIndex: turnIndex + 1,
          seq: userSeq + 1,
          inputTokens: turnResult.inputTokens,
          outputTokens: turnResult.outputTokens,
          durationMs: turnResult.durationMs,
        },
      }),
      prisma.chatSession.update({
        where: { id: session.id },
        data: {
          claudeSessionId: turnResult.sessionId,
          seqCounter: session.seqCounter + 2,
        },
      }),
    ]);

    return {
      userMessage: toChatMessageDTO(userRow),
      assistantMessage: toChatMessageDTO(assistantRow),
    };
  });
}
