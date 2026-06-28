/**
 * @vitest-environment node
 *
 * Part C — key-service CRUD against the real dev sqlite DB with REAL crypto and
 * a stubbed validation fetch (so we never hit the network). Proves:
 *   - status starts disconnected
 *   - setUserApiKey stores an ENCRYPTED blob (not plaintext) that decrypts back
 *   - getUserKeyStatus / getUserApiKey reflect the stored key + last4
 *   - deleteUserApiKey clears it
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// claudeKey.ts does not import auth, but the chat-service test pattern mocks it
// defensively to keep the next-auth import chain out of Vitest. Harmless here.
vi.mock("@/server/auth", () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/crypto";
import {
  deleteUserApiKey,
  getUserApiKey,
  getUserKeyStatus,
  setUserApiKey,
} from "@/server/services/claudeKey";

const userId = `vitest-key-user-${Date.now()}`;
const API_KEY = "sk-ant-api03-vitest-secret-0123456789";

beforeAll(async () => {
  await prisma.user.create({
    data: { id: userId, email: `${userId}@example.test` },
  });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claudeKey service CRUD (dev DB, real crypto)", () => {
  it("getUserKeyStatus on a fresh user -> connected:false", async () => {
    const status = await getUserKeyStatus(userId);
    expect(status).toEqual({ connected: false, last4: null, updatedAt: null });
  });

  it("setUserApiKey stores an encrypted key; status + getUserApiKey reflect it", async () => {
    // Stub validation to a 200 so storage is deterministic (no network).
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 } as Response));

    const status = await setUserApiKey(userId, API_KEY);
    expect(status.connected).toBe(true);
    expect(status.last4).toBe(API_KEY.slice(-4));
    expect(status.updatedAt).toBeTruthy();

    // The DB column is ciphertext, NOT the plaintext key, and decrypts back.
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { anthropicKeyEnc: true, anthropicKeyLast4: true },
    });
    expect(row?.anthropicKeyEnc).toBeTruthy();
    expect(row?.anthropicKeyEnc).not.toContain(API_KEY);
    expect(row?.anthropicKeyEnc?.startsWith("v1:")).toBe(true);
    expect(decryptSecret(row!.anthropicKeyEnc!)).toBe(API_KEY);
    expect(row?.anthropicKeyLast4).toBe(API_KEY.slice(-4));

    // Status helper agrees.
    const fetched = await getUserKeyStatus(userId);
    expect(fetched.connected).toBe(true);
    expect(fetched.last4).toBe(API_KEY.slice(-4));

    // getUserApiKey decrypts and returns the original key.
    expect(await getUserApiKey(userId)).toBe(API_KEY);
  });

  it("setUserApiKey trims surrounding whitespace before storing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 } as Response));
    await setUserApiKey(userId, `  ${API_KEY}  `);
    expect(await getUserApiKey(userId)).toBe(API_KEY);
  });

  it("setUserApiKey throws InvalidKeyError for a malformed key (no DB write)", async () => {
    // Format gate fails before any fetch; existing key remains.
    await expect(setUserApiKey(userId, "not-a-key")).rejects.toThrow();
    expect(await getUserApiKey(userId)).toBe(API_KEY);
  });

  it("deleteUserApiKey clears the key -> connected:false, getUserApiKey null", async () => {
    await deleteUserApiKey(userId);
    const status = await getUserKeyStatus(userId);
    expect(status).toEqual({ connected: false, last4: null, updatedAt: null });
    expect(await getUserApiKey(userId)).toBeNull();
  });
});
