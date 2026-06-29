/**
 * @vitest-environment node
 *
 * Part C v2 — claudeCli drives the Claude Code CLI via child_process. These
 * tests mock the child_process boundary entirely (NO real `claude` is spawned):
 *   - startLogin parses the auth URL from a stdout chunk and holds the child.
 *   - submitLoginCode writes "<code>\n" to the held child's stdin and resolves
 *     on a clean exit; rejects when there is no pending login.
 *   - runCliChat parses {result, session_id} from JSON stdout; rejects non-zero.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake child registry, shared with the vi.mock factory.
const { spawnMock, spawned } = vi.hoisted(() => {
  return {
    spawnMock: vi.fn(),
    spawned: [] as FakeChild[],
  };
});

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: vi.fn(), end: vi.fn() };
  kill = vi.fn();
}

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// Avoid touching the real filesystem for config dirs.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
}));

import {
  startLogin,
  submitLoginCode,
  runCliChat,
} from "@/server/claudeCli";

function latest(): FakeChild {
  return spawned[spawned.length - 1];
}

/**
 * startLogin awaits mkdir() before it spawns, so the child is not created
 * synchronously. Flush microtasks until a new child appears.
 */
async function waitForChild(prevLen = spawned.length): Promise<FakeChild> {
  for (let i = 0; i < 100; i++) {
    if (spawned.length > prevLen) return latest();
    await Promise.resolve();
  }
  throw new Error("no child was spawned");
}

beforeEach(() => {
  spawnMock.mockReset();
  spawned.length = 0;
  spawnMock.mockImplementation(() => {
    const child = new FakeChild();
    spawned.push(child);
    return child;
  });
});

afterEach(() => {
  vi.clearAllTimers();
});

describe("startLogin", () => {
  it("resolves with the URL parsed from a stdout chunk", async () => {
    const p = startLogin("user-A");
    const child = await waitForChild();
    child.stdout.emit(
      "data",
      Buffer.from(
        "Please authenticate. To continue, visit: https://claude.com/cai/oauth/abc123?code=1\n",
      ),
    );
    await expect(p).resolves.toEqual({
      url: "https://claude.com/cai/oauth/abc123?code=1",
    });
    // It spawned `claude auth login ...`.
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["auth", "login"]));
  });
});

describe("submitLoginCode", () => {
  it("writes '<code>\\n' to the held child's stdin and resolves on exit 0", async () => {
    const start = startLogin("user-B");
    const child = await waitForChild();
    child.stdout.emit(
      "data",
      Buffer.from("visit: https://claude.com/cai/oauth/zzz\n"),
    );
    await start;

    const submit = submitLoginCode("user-B", "  my-code  ");
    // Code is trimmed and newline-terminated.
    expect(child.stdin.write).toHaveBeenCalledWith("my-code\n");
    child.emit("exit", 0);
    await expect(submit).resolves.toEqual({ connected: true });
  });

  it("rejects when there is no pending login", async () => {
    await expect(submitLoginCode("nobody", "x")).rejects.toThrow(
      /No pending login/i,
    );
  });

  it("rejects on a non-zero exit", async () => {
    const start = startLogin("user-C");
    const child = await waitForChild();
    child.stdout.emit(
      "data",
      Buffer.from("visit: https://claude.com/cai/oauth/qqq\n"),
    );
    await start;

    const submit = submitLoginCode("user-C", "bad");
    child.stderr.emit("data", Buffer.from("invalid code"));
    child.emit("exit", 1);
    await expect(submit).rejects.toThrow(/rejected|failed/i);
  });
});

describe("runCliChat", () => {
  it("parses {result, session_id} from JSON stdout", async () => {
    const p = runCliChat({
      systemPrompt: "system",
      userMessage: "hello",
      resumeSessionId: null,
      newSessionId: "new-session-1",
      auth: { configDir: "/tmp/cfg" },
    });
    const child = latest();
    // It pipes the user message into stdin and closes it.
    expect(child.stdin.write).toHaveBeenCalledWith("hello");
    expect(child.stdin.end).toHaveBeenCalled();

    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({ result: "Hi from Claude", session_id: "sess-xyz" }),
      ),
    );
    child.emit("exit", 0);

    await expect(p).resolves.toEqual({
      text: "Hi from Claude",
      sessionId: "sess-xyz",
      inputTokens: null,
      outputTokens: null,
      durationMs: expect.any(Number),
    });
    // It invoked `claude -p --output-format json ...`.
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toEqual(
      expect.arrayContaining(["-p", "--output-format", "json"]),
    );
  });

  it("rejects on a non-zero exit, surfacing stderr", async () => {
    const p = runCliChat({
      systemPrompt: "system",
      userMessage: "hello",
      resumeSessionId: null,
      newSessionId: "new-session-2",
      auth: { configDir: "/tmp/cfg" },
    });
    const child = latest();
    child.stderr.emit("data", Buffer.from("boom: not authorized"));
    child.emit("exit", 1);
    await expect(p).rejects.toThrow(/boom: not authorized/);
  });

  it("rejects when stdout is not valid JSON", async () => {
    const p = runCliChat({
      systemPrompt: "system",
      userMessage: "hello",
      resumeSessionId: null,
      newSessionId: "new-session-3",
      auth: { configDir: "/tmp/cfg" },
    });
    const child = latest();
    child.stdout.emit("data", Buffer.from("not json"));
    child.emit("exit", 0);
    await expect(p).rejects.toThrow(/parse/i);
  });
});
