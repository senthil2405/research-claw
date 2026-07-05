import type {
  ChatMessage,
  ChatSession,
  Highlight,
} from "@prisma/client";

import { prisma } from "@/server/db";
import { withSessionLock } from "@/server/claude";
import {
  llmModel,
  runLlmTurn,
  streamLlmTurn,
  type LlmMessage,
} from "@/server/llm";
import { billableTokens, recordUsage } from "@/server/services/usage";
import { getOwnedDocument } from "@/server/services/documents";
import { logLlmTurn } from "@/server/logger";
import type { OwnerRef } from "@/server/owner";
import {
  MAX_REPLAY_CHARS,
  MAX_TOKENS_PER_DOCUMENT,
  MAX_TOKENS_PER_WINDOW,
} from "@/lib/constants";
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

/**
 * Thrown when a per-window or per-document token cap is reached. Routes map it
 * to a 402 so the client shows the budget banner.
 */
export class ChatLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatLimitError";
  }
}

/**
 * Enforce the per-window (highlight) and per-PDF (session) token caps. Read
 * inside the per-document lock so the counters are fresh. Blocks the NEXT turn
 * once a cap is reached (the turn that crosses it is allowed to finish).
 */
async function assertUnderCaps(
  highlightId: string,
  sessionTokensUsed: number,
): Promise<void> {
  if (sessionTokensUsed >= MAX_TOKENS_PER_DOCUMENT) {
    throw new ChatLimitError(
      `This PDF has reached its ${MAX_TOKENS_PER_DOCUMENT.toLocaleString()}-token chat limit.`,
    );
  }
  const hl = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: { tokensUsed: true },
  });
  if ((hl?.tokensUsed ?? 0) >= MAX_TOKENS_PER_WINDOW) {
    throw new ChatLimitError(
      `This chat has reached its ${MAX_TOKENS_PER_WINDOW.toLocaleString()}-token limit. Start a new highlight to continue.`,
    );
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

/**
 * Rebuild the conversation to send to the LLM. OpenRouter has no session
 * resume, so we replay the WHOLE document's history (all windows share one
 * session, like the old Claude CLI) ordered by the global `seq`, then append the
 * new user message. Ordering by seq keeps the prefix append-only so Gemini's
 * automatic implicit prefix cache hits — the repeated history bills at the
 * cached rate and we meter only the uncached remainder (services/usage.ts).
 * Prior user turns are re-wrapped with their own passage (highlightText) so each
 * question stays tied to the passage it was about across windows. `capHistory`
 * bounds a cold-cache turn so it can't bill a runaway prompt.
 */
async function buildThreadMessages(
  sessionId: string,
  newUserMessage: string,
): Promise<LlmMessage[]> {
  const prior = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { seq: "asc" },
    select: { role: true, content: true, highlightText: true },
  });
  const messages: LlmMessage[] = prior.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", content: m.content }
      : { role: "user", content: buildUserMessage(m.highlightText ?? "", m.content) },
  );
  messages.push({ role: "user", content: newUserMessage });
  return capHistory(messages);
}

/**
 * Keep the most-recent messages within MAX_REPLAY_CHARS (the current message is
 * always kept), then drop any leading assistant turns so the replay starts on a
 * user (or system, added later) message.
 */
function capHistory(messages: LlmMessage[]): LlmMessage[] {
  let total = 0;
  const kept: LlmMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    total += messages[i].content.length;
    if (total > MAX_REPLAY_CHARS && kept.length > 0) break;
    kept.push(messages[i]);
  }
  kept.reverse();
  while (kept.length > 1 && kept[0].role === "assistant") kept.shift();
  return kept;
}

// ---- Stream a message -----------------------------------------------------

/**
 * Same contract as sendMessage, but pipes the assistant's reply through
 * `onToken` as it streams from the CLI. Persistence is byte-for-byte identical
 * to sendMessage (relies on --resume for history, so the DB writes and FK
 * relationships are unchanged) — only the turn call differs.
 */
export async function streamMessage(
  owner: OwnerRef,
  documentId: string,
  highlightId: string,
  question: string,
  onToken: (delta: string) => void,
): Promise<SendMessageResponse> {
  const doc = await requireOwnedDocument(owner, documentId);
  const highlight = await requireHighlight(documentId, highlightId);

  const paperTitle = doc.title ?? null;
  const systemPrompt = buildSystemPrompt(paperTitle ?? doc.filename.replace(/\.pdf$/i, ""));
  const userMessage = buildUserMessage(highlight.selectedText, question, paperTitle);

  return withSessionLock(documentId, async () => {
    const session = await getOrCreateSession(documentId);
    await assertUnderCaps(highlightId, session.tokensUsed);
    const messages = await buildThreadMessages(session.id, userMessage);

    const turnResult = await streamLlmTurn(
      { system: systemPrompt, messages },
      onToken,
    );

    logLlmTurn({
      documentId,
      highlightId,
      mock: turnResult.mock,
      model: llmModel(),
      inputTokens: turnResult.promptTokens,
      outputTokens: turnResult.completionTokens,
      cachedTokens: turnResult.cachedTokens,
      costCredits: turnResult.costCredits,
      durationMs: turnResult.durationMs,
      ok: true,
    });

    const turnEffective = billableTokens(turnResult);
    await recordUsage(owner, {
      documentId,
      model: llmModel(),
      promptTokens: turnResult.promptTokens,
      cachedTokens: turnResult.cachedTokens,
      completionTokens: turnResult.completionTokens,
      costCredits: turnResult.costCredits,
    });

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
          inputTokens: turnResult.promptTokens,
          outputTokens: turnResult.completionTokens,
          durationMs: turnResult.durationMs,
        },
      }),
      prisma.chatSession.update({
        where: { id: session.id },
        data: {
          seqCounter: session.seqCounter + 2,
          tokensUsed: { increment: turnEffective },
        },
      }),
      prisma.highlight.update({
        where: { id: highlightId },
        data: { tokensUsed: { increment: turnEffective } },
      }),
    ]);

    return {
      userMessage: toChatMessageDTO(userRow),
      assistantMessage: toChatMessageDTO(assistantRow),
    };
  });
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

  // The entire critical section — session read, user turn, and the DB
  // transaction that writes messages + advances the seq counter — runs inside
  // the per-document lock so seqCounter and turnIndex reads are always fresh.
  return withSessionLock(documentId, async () => {
    const session = await getOrCreateSession(documentId);
    await assertUnderCaps(highlightId, session.tokensUsed);
    const messages = await buildThreadMessages(session.id, userMessage);

    const turnResult = await runLlmTurn({ system: systemPrompt, messages });

    logLlmTurn({
      documentId,
      highlightId,
      mock: turnResult.mock,
      model: llmModel(),
      inputTokens: turnResult.promptTokens,
      outputTokens: turnResult.completionTokens,
      cachedTokens: turnResult.cachedTokens,
      costCredits: turnResult.costCredits,
      durationMs: turnResult.durationMs,
      ok: true,
    });

    const turnEffective = billableTokens(turnResult);
    await recordUsage(owner, {
      documentId,
      model: llmModel(),
      promptTokens: turnResult.promptTokens,
      cachedTokens: turnResult.cachedTokens,
      completionTokens: turnResult.completionTokens,
      costCredits: turnResult.costCredits,
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
          inputTokens: turnResult.promptTokens,
          outputTokens: turnResult.completionTokens,
          durationMs: turnResult.durationMs,
        },
      }),
      prisma.chatSession.update({
        where: { id: session.id },
        data: {
          seqCounter: session.seqCounter + 2,
          tokensUsed: { increment: turnEffective },
        },
      }),
      prisma.highlight.update({
        where: { id: highlightId },
        data: { tokensUsed: { increment: turnEffective } },
      }),
    ]);

    return {
      userMessage: toChatMessageDTO(userRow),
      assistantMessage: toChatMessageDTO(assistantRow),
    };
  });
}
