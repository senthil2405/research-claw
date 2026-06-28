/**
 * @vitest-environment node
 *
 * Part C — secret-at-rest crypto. AES-256-GCM round-trip, ciphertext format,
 * tamper detection, and the non-sensitive last-4 helper. The encryption key is
 * provided deterministically via APP_ENCRYPTION_KEY (vitest.config.ts env).
 */
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, keyLast4 } from "@/server/crypto";

describe("crypto (encryptSecret/decryptSecret/keyLast4)", () => {
  const plain = "sk-ant-api03-abcdef0123456789-secret-value";

  it("round-trips: decryptSecret(encryptSecret(x)) === x", () => {
    const blob = encryptSecret(plain);
    expect(decryptSecret(blob)).toBe(plain);
  });

  it("ciphertext is versioned (v1:) and never the plaintext", () => {
    const blob = encryptSecret(plain);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(blob).not.toContain(plain);
    expect(blob.split(":")).toHaveLength(4);
  });

  it("produces a fresh random IV each call (two encryptions differ)", () => {
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it("tampering with the ciphertext makes decryptSecret throw", () => {
    const blob = encryptSecret(plain);
    const parts = blob.split(":");
    // Flip the last base64 char of the ciphertext segment.
    const ct = parts[3];
    const lastChar = ct.slice(-1);
    const flipped = lastChar === "A" ? "B" : "A";
    parts[3] = ct.slice(0, -1) + flipped;
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects a malformed blob (wrong shape / version)", () => {
    expect(() => decryptSecret("not-a-valid-blob")).toThrow(/Malformed/);
    expect(() => decryptSecret("v2:a:b:c")).toThrow(/Malformed/);
  });

  it("keyLast4 returns the last 4 characters", () => {
    expect(keyLast4("sk-ant-xyz1234")).toBe("1234");
    expect(keyLast4("abcd")).toBe("abcd");
  });
});
