import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

// Drives the Claude Code CLI directly (instead of the Agent SDK) so each
// logged-in user authorizes their OWN Anthropic account via the official
// `claude auth login` browser flow, and chat runs `claude -p` against that
// user's stored session. Per-user credentials live in a per-user
// CLAUDE_CONFIG_DIR; the interactive login process is held in memory between
// the "start" and "submit code" requests (single-instance only).

const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || "claude";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";
const AUTH_ROOT = process.env.CLAUDE_AUTH_DIR || "./storage/claude-auth";

/** Per-user Claude config dir (holds that user's logged-in session). */
export function userConfigDir(userId: string): string {
  return path.join(process.cwd(), AUTH_ROOT, userId);
}

// ---- Interactive login registry (start → capture URL → submit code) --------

interface PendingLogin {
  child: ChildProcessWithoutNullStreams;
  url: string;
  buffer: string;
  createdAt: number;
}
const pending = new Map<string, PendingLogin>();
const LOGIN_TTL_MS = 5 * 60_000;

function cleanupStale() {
  const now = Date.now();
  for (const [userId, p] of pending) {
    if (now - p.createdAt > LOGIN_TTL_MS) {
      try {
        p.child.kill();
      } catch {
        /* ignore */
      }
      pending.delete(userId);
    }
  }
}

const URL_RE = /(https?:\/\/[^\s]+)/;

/**
 * Start `claude auth login` for a user and resolve with the authorization URL
 * the user must open. The child process is kept alive awaiting the pasted code.
 */
export async function startLogin(
  userId: string,
  options?: { console?: boolean },
): Promise<{ url: string }> {
  cleanupStale();
  // Abandon any previous in-flight attempt for this user.
  const existing = pending.get(userId);
  if (existing) {
    try {
      existing.child.kill();
    } catch {
      /* ignore */
    }
    pending.delete(userId);
  }

  const configDir = userConfigDir(userId);
  await mkdir(configDir, { recursive: true });

  const args = ["auth", "login", options?.console ? "--console" : "--claudeai"];
  const child = spawn(CLAUDE_BIN, args, {
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      // Best-effort: stop the CLI from popping a browser on the server.
      BROWSER: "true",
    },
  }) as ChildProcessWithoutNullStreams;

  const entry: PendingLogin = {
    child,
    url: "",
    buffer: "",
    createdAt: Date.now(),
  };
  pending.set(userId, entry);

  return new Promise<{ url: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!entry.url) {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        pending.delete(userId);
        reject(new Error("Timed out waiting for the Claude login URL"));
      }
    }, 20_000);

    const onData = (chunk: Buffer) => {
      entry.buffer += chunk.toString();
      const m = entry.buffer.match(URL_RE);
      if (m && !entry.url) {
        entry.url = m[1].replace(/[)\].,]+$/, "");
        clearTimeout(timer);
        resolve({ url: entry.url });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => {
      clearTimeout(timer);
      pending.delete(userId);
      reject(err);
    });
    child.on("exit", () => {
      if (!entry.url) {
        clearTimeout(timer);
        pending.delete(userId);
        reject(new Error("Claude login exited before printing a URL"));
      }
    });
  });
}

/**
 * Submit the verification code the user obtained after authorizing in the
 * browser. Writes it to the waiting login process's stdin and resolves once the
 * process exits successfully.
 */
export async function submitLoginCode(
  userId: string,
  code: string,
): Promise<{ connected: boolean }> {
  const entry = pending.get(userId);
  if (!entry) {
    throw new Error("No pending login — start the authorization again.");
  }
  return new Promise<{ connected: boolean }>((resolve, reject) => {
    let out = entry.buffer;
    const onData = (c: Buffer) => {
      out += c.toString();
    };
    entry.child.stdout.on("data", onData);
    entry.child.stderr.on("data", onData);
    entry.child.on("exit", (codeNum) => {
      pending.delete(userId);
      invalidateAuthStatus(userId);
      if (codeNum === 0) {
        resolve({ connected: true });
      } else {
        reject(
          new Error(
            /invalid|error|expired/i.test(out)
              ? "That code was rejected. Please try authorizing again."
              : `Login failed (exit ${codeNum}).`,
          ),
        );
      }
    });
    entry.child.on("error", (err) => {
      pending.delete(userId);
      reject(err);
    });
    entry.child.stdin.write(`${code.trim()}\n`);
  });
}

export interface CliAuthStatus {
  connected: boolean;
  email?: string;
}

// The real OAuth credential is stored persistently (macOS Keychain / on disk),
// so `claude auth status` reports the truth across server restarts. We cache it
// briefly to avoid spawning a process on every chat turn / status poll.
const statusCache = new Map<string, { status: CliAuthStatus; ts: number }>();
const STATUS_TTL_MS = 60_000;

/** Drop a cached auth status so the next read re-checks the CLI. */
export function invalidateAuthStatus(userId: string): void {
  statusCache.delete(userId);
}

/** Run `claude auth status` for a user's config dir (cached). */
export async function getAuthStatus(
  userId: string,
  opts?: { force?: boolean },
): Promise<CliAuthStatus> {
  // In forced-mock mode never consult the real CLI/keychain (keeps tests and
  // mock runs independent of the machine's global `claude` login).
  if (process.env.CLAUDE_FORCE_MOCK === "true") return { connected: false };
  const cached = statusCache.get(userId);
  if (!opts?.force && cached && Date.now() - cached.ts < STATUS_TTL_MS) {
    return cached.status;
  }
  const configDir = userConfigDir(userId);
  const status = await new Promise<CliAuthStatus>((resolve) => {
    const child = spawn(CLAUDE_BIN, ["auth", "status"], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("error", () => resolve({ connected: false }));
    child.on("exit", () => {
      // `claude auth status` prints JSON: {"loggedIn": true, "email": ...}.
      try {
        const j = JSON.parse(out.trim());
        resolve({ connected: j.loggedIn === true, email: j.email });
      } catch {
        // Fallback if the format ever changes.
        resolve({ connected: /"?loggedIn"?\s*:\s*true/i.test(out) });
      }
    });
  });
  statusCache.set(userId, { status, ts: Date.now() });
  return status;
}

/** Log a user out and remove their stored session. */
export async function logoutUser(userId: string): Promise<void> {
  const configDir = userConfigDir(userId);
  await new Promise<void>((resolve) => {
    const child = spawn(CLAUDE_BIN, ["auth", "logout"], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    });
    child.on("error", () => resolve());
    child.on("exit", () => resolve());
  });
  await rm(configDir, { recursive: true, force: true }).catch(() => {});
  invalidateAuthStatus(userId);
}

// ---- Chat via the CLI ------------------------------------------------------

export interface CliChatInput {
  systemPrompt: string;
  userMessage: string;
  /** Existing Claude session id to resume, or null for a new session. */
  resumeSessionId: string | null;
  /** A new session id to assign when starting fresh (we generate a uuid). */
  newSessionId: string;
  /** Auth: a per-user config dir (account), or an API key (shared fallback). */
  auth: { configDir: string } | { apiKey: string };
}

export interface CliChatResult {
  text: string;
  sessionId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
}

/** Run one chat turn through `claude -p`, returning the reply + session id. */
export async function runCliChat(input: CliChatInput): Promise<CliChatResult> {
  const args = ["-p", "--output-format", "json", "--model", MODEL];
  if (input.resumeSessionId) {
    // Resuming: history already holds the system prompt + PDF from turn 1.
    args.push("--resume", input.resumeSessionId);
  } else {
    // New session: inject the system prompt (which carries the full PDF text).
    args.push(
      "--append-system-prompt",
      input.systemPrompt,
      "--session-id",
      input.newSessionId,
    );
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if ("configDir" in input.auth) {
    env.CLAUDE_CONFIG_DIR = input.auth.configDir;
    delete env.ANTHROPIC_API_KEY;
  } else {
    env.ANTHROPIC_API_KEY = input.auth.apiKey;
  }

  const startMs = Date.now();

  return new Promise<CliChatResult>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error("Claude timed out"));
    }, 180_000);

    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (err += c.toString()));
    child.stdin.write(input.userMessage);
    child.stdin.end();
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.trim() || `claude exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(out);
        const text: string =
          parsed.result ?? parsed.text ?? parsed.output ?? "";
        const sessionId: string | null =
          parsed.session_id ?? input.resumeSessionId ?? input.newSessionId;
        // Token counts: Claude CLI outputs these at the top level or under `usage`.
        const inputTokens: number | null =
          parsed.total_input_tokens ??
          parsed.usage?.input_tokens ??
          null;
        const outputTokens: number | null =
          parsed.total_output_tokens ??
          parsed.usage?.output_tokens ??
          null;
        const durationMs: number | null =
          parsed.duration_ms ?? parsed.duration_api_ms ?? (Date.now() - startMs);
        if (!text) {
          reject(new Error("Claude returned an empty response"));
          return;
        }
        resolve({ text, sessionId, inputTokens, outputTokens, durationMs });
      } catch {
        reject(new Error("Could not parse Claude CLI output"));
      }
    });
  });
}
