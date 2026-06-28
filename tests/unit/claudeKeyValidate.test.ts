/**
 * @vitest-environment node
 *
 * Part C — validateAnthropicKey. Format gate short-circuits before any network
 * call; live check maps 200 -> ok, 401/403 -> rejected, other/throw -> lenient.
 * `fetch` is fully stubbed: these tests NEVER hit the real network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateAnthropicKey } from "@/server/services/claudeKey";

const GOOD = "sk-ant-api03-0123456789abcdef"; // well-formed, length >= 20

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validateAnthropicKey", () => {
  it('format-invalid "nope" -> {ok:false} WITHOUT calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await validateAnthropicKey("nope");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Anthropic API key/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('too-short "sk-ant-" prefix -> {ok:false} WITHOUT calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await validateAnthropicKey("sk-ant-" + "x"); // < 20 chars
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("valid format + mocked 200 -> {ok:true} and hits the models endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const res = await validateAnthropicKey(GOOD);
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("api.anthropic.com/v1/models");
  });

  it("valid format + mocked 401 -> {ok:false, reason ~ /rejected/}", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 401 } as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const res = await validateAnthropicKey(GOOD);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/rejected/i);
  });

  it("valid format + mocked 403 -> {ok:false}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 403 } as Response));
    const res = await validateAnthropicKey(GOOD);
    expect(res.ok).toBe(false);
  });

  it("valid format + mocked non-auth status (500) -> lenient {ok:true}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500 } as Response));
    const res = await validateAnthropicKey(GOOD);
    expect(res.ok).toBe(true);
  });

  it("valid format + fetch throws (offline) -> lenient {ok:true}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const res = await validateAnthropicKey(GOOD);
    expect(res.ok).toBe(true);
  });
});
