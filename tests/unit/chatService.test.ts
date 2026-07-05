/**
 * @vitest-environment node
 *
 * Integration test for the chat service against the dev sqlite DB with the
 * MOCK Claude backend (DATABASE_URL + CLAUDE_FORCE_MOCK are set in
 * vitest.config.ts). Exercises the real prisma/file-store/pdf-extraction path:
 * create doc -> highlight(s) -> sendMessage, asserting seq/turnIndex ordering,
 * that multiple windows share one session, and that cross-owner access throws.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

// The chat service transitively imports owner.ts -> auth.ts (next-auth), which
// can't be resolved under Vitest. The functions under test take an OwnerRef
// param and never call auth, so stub the auth module to break that import chain
// while keeping prisma / file-store / pdf extraction real.
vi.mock("@/server/auth", () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { prisma } from "@/server/db";
import { createDocument, deleteDocument } from "@/server/services/documents";
import {
  ChatLimitError,
  NotFoundError,
  createHighlight,
  listHighlights,
  listMessages,
  sendMessage,
} from "@/server/services/chat";
import {
  MAX_TOKENS_PER_DOCUMENT,
  MAX_TOKENS_PER_WINDOW,
} from "@/lib/constants";
import type { OwnerRef } from "@/server/owner";

const owner: OwnerRef = { anonId: `vitest-anon-${Date.now()}` };
const stranger: OwnerRef = { anonId: `vitest-stranger-${Date.now()}` };

let documentId = "";

async function makePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Integration test paper body text", {
    x: 50,
    y: 700,
    size: 18,
    font,
  });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

beforeAll(async () => {
  const buf = await makePdf();
  const meta = await createDocument(owner, {
    buffer: buf,
    filename: "vitest-chat.pdf",
    sizeBytes: buf.length,
  });
  documentId = meta.id;
});

afterAll(async () => {
  if (documentId) {
    // Cascades to highlights / session / messages, and removes the stored file.
    await deleteDocument(owner, documentId).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("chat service (mock Claude, dev DB)", () => {
  it("two windows share one session; seq is global, turnIndex is per-window", async () => {
    const win1 = await createHighlight(owner, documentId, {
      pageNumber: 1,
      rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.03 }],
      selectedText: "passage one",
    });
    const win2 = await createHighlight(owner, documentId, {
      pageNumber: 1,
      rects: [{ x: 0.1, y: 0.2, w: 0.2, h: 0.03 }],
      selectedText: "passage two",
    });

    // ---- Window 1: two turns ----
    const turn1 = await sendMessage(owner, documentId, win1.id, "First question?");
    expect(turn1.userMessage.role).toBe("user");
    expect(turn1.userMessage.content).toBe("First question?");
    expect(turn1.userMessage.highlightText).toBe("passage one");
    expect(turn1.assistantMessage.role).toBe("assistant");
    expect(turn1.assistantMessage.content).toContain("Mock LLM");
    // First turn: user seq 0, assistant seq 1.
    expect(turn1.userMessage.seq).toBe(0);
    expect(turn1.assistantMessage.seq).toBe(1);
    expect(turn1.userMessage.turnIndex).toBe(0);
    expect(turn1.assistantMessage.turnIndex).toBe(1);

    const turn2 = await sendMessage(owner, documentId, win1.id, "Second question?");
    expect(turn2.userMessage.seq).toBe(2);
    expect(turn2.assistantMessage.seq).toBe(3);
    expect(turn2.userMessage.turnIndex).toBe(2);
    expect(turn2.assistantMessage.turnIndex).toBe(3);

    // Window 1 has exactly 4 messages ordered by turnIndex 0..3.
    const win1Msgs = await listMessages(owner, documentId, win1.id);
    expect(win1Msgs.map((m) => m.turnIndex)).toEqual([0, 1, 2, 3]);
    expect(win1Msgs.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);

    // ---- Window 2: one turn — must continue the SAME session's global seq ----
    const turn3 = await sendMessage(owner, documentId, win2.id, "Window two?");
    expect(turn3.userMessage.seq).toBe(4); // global seq continues, proving shared session
    expect(turn3.assistantMessage.seq).toBe(5);
    expect(turn3.userMessage.turnIndex).toBe(0); // per-window turnIndex restarts
    expect(turn3.assistantMessage.turnIndex).toBe(1);

    // The document has a single ChatSession row.
    const sessions = await prisma.chatSession.findMany({ where: { documentId } });
    expect(sessions).toHaveLength(1);

    // Full session listing (no highlight filter) ordered by global seq 0..5.
    const all = await listMessages(owner, documentId);
    expect(all.map((m) => m.seq)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("rejects cross-owner access with NotFoundError (404 semantics)", async () => {
    await expect(listHighlights(stranger, documentId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      createHighlight(stranger, documentId, {
        pageNumber: 1,
        rects: [],
        selectedText: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      sendMessage(stranger, documentId, "nonexistent-highlight", "hi"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for a highlight that is not part of the document", async () => {
    await expect(
      sendMessage(owner, documentId, "definitely-not-a-real-highlight", "hi"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  // Cap tests run last: the doc-cap test maxes out this document's session.
  it("blocks a window that has hit its per-window token cap", async () => {
    const win = await createHighlight(owner, documentId, {
      pageNumber: 1,
      rects: [],
      selectedText: "window cap",
    });
    await prisma.highlight.update({
      where: { id: win.id },
      data: { tokensUsed: MAX_TOKENS_PER_WINDOW },
    });
    await expect(
      sendMessage(owner, documentId, win.id, "one more?"),
    ).rejects.toBeInstanceOf(ChatLimitError);
  });

  it("blocks the whole PDF once the per-document cap is reached", async () => {
    const win = await createHighlight(owner, documentId, {
      pageNumber: 1,
      rects: [],
      selectedText: "doc cap",
    });
    // Seed a turn so the ChatSession exists, then max it out.
    await sendMessage(owner, documentId, win.id, "seed");
    await prisma.chatSession.update({
      where: { documentId },
      data: { tokensUsed: MAX_TOKENS_PER_DOCUMENT },
    });
    await expect(
      sendMessage(owner, documentId, win.id, "again?"),
    ).rejects.toBeInstanceOf(ChatLimitError);
  });
});
