import { prisma } from "@/server/db";
import { decryptSecret, encryptSecret, keyLast4 } from "@/server/crypto";
import type { ClaudeKeyStatus } from "@/lib/types";

/**
 * Decrypt and return a user's stored Anthropic API key, or null if none/invalid.
 * (Write/validate/status helpers live alongside this in Part C Wave 1.)
 */
export async function getUserApiKey(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { anthropicKeyEnc: true },
  });
  if (!user?.anthropicKeyEnc) return null;
  try {
    return decryptSecret(user.anthropicKeyEnc);
  } catch {
    return null;
  }
}

/** Thrown when an API key fails format or live validation. Carries a user-safe reason. */
export class InvalidKeyError extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidKeyError";
    this.reason = reason;
  }
}

/**
 * Validate an Anthropic API key.
 *
 * 1. Format gate: must look like an Anthropic key (`sk-ant-`, length >= 20).
 * 2. Live check against the Anthropic models endpoint. A 200 confirms the key;
 *    a 401/403 rejects it. Other non-2xx responses and thrown network errors are
 *    treated leniently (`ok:true`) so offline/dev environments can still store a
 *    well-formed key.
 */
export async function validateAnthropicKey(
  apiKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (
    typeof apiKey !== "string" ||
    apiKey.length < 20 ||
    !apiKey.startsWith("sk-ant-")
  ) {
    return { ok: false, reason: "That doesn't look like an Anthropic API key." };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Anthropic rejected this API key." };
    }
    // Transient / non-auth error — don't block storage.
    return { ok: true, reason: `Anthropic returned status ${res.status}.` };
  } catch {
    // Network error (offline/dev) — lenient: allow storing the well-formed key.
    return { ok: true };
  }
}

/**
 * Validate, encrypt, and persist a user's Anthropic API key.
 * Throws {@link InvalidKeyError} (with a user-safe reason) when validation fails.
 */
export async function setUserApiKey(
  userId: string,
  apiKey: string,
): Promise<ClaudeKeyStatus> {
  const key = apiKey.trim();
  const result = await validateAnthropicKey(key);
  if (!result.ok) {
    throw new InvalidKeyError(result.reason ?? "Invalid API key.");
  }

  const updatedAt = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      anthropicKeyEnc: encryptSecret(key),
      anthropicKeyLast4: keyLast4(key),
      anthropicKeyUpdatedAt: updatedAt,
    },
  });

  return {
    connected: true,
    last4: keyLast4(key),
    updatedAt: updatedAt.toISOString(),
  };
}

/** Remove a user's stored Anthropic API key (clears all three columns). */
export async function deleteUserApiKey(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      anthropicKeyEnc: null,
      anthropicKeyLast4: null,
      anthropicKeyUpdatedAt: null,
    },
  });
}

/** Non-sensitive status of a user's stored Anthropic API key. */
export async function getUserKeyStatus(
  userId: string,
): Promise<ClaudeKeyStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      anthropicKeyEnc: true,
      anthropicKeyLast4: true,
      anthropicKeyUpdatedAt: true,
    },
  });
  return {
    connected: !!user?.anthropicKeyEnc,
    last4: user?.anthropicKeyLast4 ?? null,
    updatedAt: user?.anthropicKeyUpdatedAt?.toISOString() ?? null,
  };
}
