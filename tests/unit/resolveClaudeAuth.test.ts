/**
 * @vitest-environment node
 *
 * Part C v2 — resolveClaudeAuth returns a discriminated union and resolves in
 * this order:
 *   account (user.claudeAuthorized) > sharedKey (ANTHROPIC_API_KEY) > mock,
 * with CLAUDE_FORCE_MOCK=true overriding everything.
 *
 * prisma is mocked (no DB access) and claudeCli.userConfigDir is stubbed so the
 * account branch is deterministic; env is saved/restored around each case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerRef } from "@/server/owner";

const findUnique = vi.fn<
  (args: unknown) => Promise<{ claudeAuthorized: boolean } | null>
>();
const update = vi.fn(async (_args?: unknown) => ({}));
vi.mock("@/server/db", () => ({
  prisma: {
    user: {
      findUnique: (args: unknown) => findUnique(args),
      update: (args: unknown) => update(args),
    },
  },
}));

// getAuthStatus is the live CLI/keychain check; default to "not connected" so
// the legacy resolution order is exercised. Cases override it where relevant.
const getAuthStatus = vi.fn(
  async (_userId?: string) => ({ connected: false }) as { connected: boolean },
);
vi.mock("@/server/claudeCli", () => ({
  userConfigDir: (userId: string) => `/tmp/claude-auth/${userId}`,
  getAuthStatus: (userId: string) => getAuthStatus(userId),
  runCliChat: vi.fn(),
}));

import { resolveClaudeAuth } from "@/server/claude";

const userOwner: OwnerRef = { userId: "user-1" };
const anonOwner: OwnerRef = { anonId: "anon-1" };

let savedShared: string | undefined;
let savedForceMock: string | undefined;

beforeEach(() => {
  findUnique.mockReset();
  update.mockClear();
  getAuthStatus.mockReset();
  getAuthStatus.mockResolvedValue({ connected: false });
  savedShared = process.env.ANTHROPIC_API_KEY;
  savedForceMock = process.env.CLAUDE_FORCE_MOCK;
  // vitest.config sets CLAUDE_FORCE_MOCK=true globally; clear it so the real
  // resolution order is exercised. Re-set explicitly where needed.
  delete process.env.CLAUDE_FORCE_MOCK;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (savedShared === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedShared;
  if (savedForceMock === undefined) delete process.env.CLAUDE_FORCE_MOCK;
  else process.env.CLAUDE_FORCE_MOCK = savedForceMock;
});

describe("resolveClaudeAuth", () => {
  it('authorized user -> mode "account" with their config dir (even if shared set)', async () => {
    findUnique.mockResolvedValue({ claudeAuthorized: true });
    process.env.ANTHROPIC_API_KEY = "sk-ant-shared";
    const auth = await resolveClaudeAuth(userOwner);
    expect(auth).toEqual({
      mode: "account",
      configDir: "/tmp/claude-auth/user-1",
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { claudeAuthorized: true },
    });
  });

  it('DB flag false but CLI still logged in -> mode "account" (persists across restarts) and re-syncs the flag', async () => {
    findUnique.mockResolvedValue({ claudeAuthorized: false });
    getAuthStatus.mockResolvedValue({ connected: true });
    const auth = await resolveClaudeAuth(userOwner);
    expect(auth).toEqual({
      mode: "account",
      configDir: "/tmp/claude-auth/user-1",
    });
    // It re-syncs the DB flag so future resolves take the fast path.
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ claudeAuthorized: true }),
    });
  });

  it('unauthorized user + CLI logged out + shared env -> mode "sharedKey"', async () => {
    findUnique.mockResolvedValue({ claudeAuthorized: false });
    process.env.ANTHROPIC_API_KEY = "sk-ant-shared";
    const auth = await resolveClaudeAuth(userOwner);
    expect(auth).toEqual({ mode: "sharedKey", apiKey: "sk-ant-shared" });
  });

  it('anon + shared env -> mode "sharedKey" (never queries the user table)', async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-shared";
    const auth = await resolveClaudeAuth(anonOwner);
    expect(auth).toEqual({ mode: "sharedKey", apiKey: "sk-ant-shared" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('unauthorized user + nothing set -> mode "mock"', async () => {
    findUnique.mockResolvedValue({ claudeAuthorized: false });
    const auth = await resolveClaudeAuth(userOwner);
    expect(auth).toEqual({ mode: "mock" });
  });

  it('user row missing entirely -> mode "mock"', async () => {
    findUnique.mockResolvedValue(null);
    const auth = await resolveClaudeAuth(userOwner);
    expect(auth).toEqual({ mode: "mock" });
  });

  it('anon + nothing set -> mode "mock"', async () => {
    const auth = await resolveClaudeAuth(anonOwner);
    expect(auth).toEqual({ mode: "mock" });
  });

  it('CLAUDE_FORCE_MOCK=true forces "mock" even for an authorized user + shared env', async () => {
    process.env.CLAUDE_FORCE_MOCK = "true";
    findUnique.mockResolvedValue({ claudeAuthorized: true });
    process.env.ANTHROPIC_API_KEY = "sk-ant-shared";
    const auth = await resolveClaudeAuth(userOwner);
    expect(auth).toEqual({ mode: "mock" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only shared key as unset -> mock", async () => {
    findUnique.mockResolvedValue({ claudeAuthorized: false });
    process.env.ANTHROPIC_API_KEY = "   ";
    const auth = await resolveClaudeAuth(userOwner);
    expect(auth).toEqual({ mode: "mock" });
  });
});
