import { randomUUID } from "node:crypto";
import type { OwnerRef } from "@/server/owner";
import { prisma } from "@/server/db";
import { getAuthStatus, runCliChat, userConfigDir } from "@/server/claudeCli";

// Chat backend. Each logged-in user authorizes their OWN Anthropic account via
// the Claude Code CLI (`claude auth login`); chat then runs `claude -p` against
// that user's session. Resolution order:
//   1. account  -- the user completed `claude auth login` (their config dir)
//   2. sharedKey -- an owner ANTHROPIC_API_KEY in env (optional fallback)
//   3. mock      -- neither available

export type ClaudeAuthMode = "account" | "sharedKey" | "mock";

export type ClaudeAuth =
  | { mode: "account"; configDir: string }
  | { mode: "sharedKey"; apiKey: string }
  | { mode: "mock" };

export interface ClaudeTurnInput {
  documentId: string;
  systemPrompt: string;
  userMessage: string;
  resumeSessionId: string | null;
  auth: ClaudeAuth;
}

export interface ClaudeTurnResult {
  text: string;
  sessionId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  mock: boolean;
}

/** Decide which credential backs a given owner's chat. */
export async function resolveClaudeAuth(owner: OwnerRef): Promise<ClaudeAuth> {
  if (process.env.CLAUDE_FORCE_MOCK === "true") return { mode: "mock" };

  if ("userId" in owner) {
    const user = await prisma.user.findUnique({
      where: { id: owner.userId },
      select: { claudeAuthorized: true },
    });
    if (user?.claudeAuthorized) {
      return { mode: "account", configDir: userConfigDir(owner.userId) };
    }
    // The DB flag may be unset (fresh DB, lost app session) while the CLI still
    // holds a valid, persistent login. Trust the live status and re-sync the
    // flag so we never prompt for a needless re-auth.
    const status = await getAuthStatus(owner.userId);
    if (status.connected) {
      void prisma.user
        .update({
          where: { id: owner.userId },
          data: { claudeAuthorized: true, claudeAuthorizedAt: new Date() },
        })
        .catch(() => {});
      return { mode: "account", configDir: userConfigDir(owner.userId) };
    }
  }
  const shared = process.env.ANTHROPIC_API_KEY?.trim();
  if (shared) return { mode: "sharedKey", apiKey: shared };

  return { mode: "mock" };
}

// ---- Per-document serialization (the CLI session is single-flight) ---------
const locks = new Map<string, Promise<unknown>>();

export async function withSessionLock<T>(
  documentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(documentId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(
    documentId,
    prev.then(() => next),
  );
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
  }
}

function mockReply(input: ClaudeTurnInput): ClaudeTurnResult {
  const q = input.userMessage.slice(0, 400);
  const text =
    '**(Mock Claude -- click "Authorize Claude" to sign in with your account)**\n\n' +
    "Here's a formatted sample so you can see rendering. The classifier is " +
    "**f = σ ∘ g**, built from two pieces:\n\n" +
    "- **g** : ℝ^d → ℝ^k -- the raw network, outputting *K* unbounded logits.\n" +
    "- **σ** -- the softmax, which turns logits into probabilities:\n\n" +
    "$$\\sigma_i(z) = \\frac{e^{z_i}}{\\sum_{j=1}^{k} e^{z_j}}$$\n\n" +
    "Inline math like $\\sigma_i(z) \\in (0,1)$ renders too, and so does `code`.\n\n" +
    `You asked: "${q}"`;
  return {
    text,
    sessionId: input.resumeSessionId ?? `mock-${input.documentId}`,
    inputTokens: null,
    outputTokens: null,
    durationMs: null,
    mock: true,
  };
}

/** Run a single chat turn (CLI for real auth, canned for mock). */
export async function runClaudeTurn(
  input: ClaudeTurnInput,
): Promise<ClaudeTurnResult> {
  if (input.auth.mode === "mock") {
    await new Promise((r) => setTimeout(r, 250));
    return mockReply(input);
  }

  const auth =
    input.auth.mode === "account"
      ? { configDir: input.auth.configDir }
      : { apiKey: input.auth.apiKey };

  const run = (resume: string | null) =>
    runCliChat({
      systemPrompt: input.systemPrompt,
      userMessage: input.userMessage,
      resumeSessionId: resume,
      newSessionId: randomUUID(),
      auth,
    });

  let result;
  try {
    result = await run(input.resumeSessionId);
  } catch (err) {
    // A stored session that can't be resumed (e.g. auth changed) → start fresh.
    if (input.resumeSessionId) {
      result = await run(null);
    } else {
      throw err;
    }
  }

  return {
    text: result.text,
    sessionId: result.sessionId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: result.durationMs,
    mock: false,
  };
}
