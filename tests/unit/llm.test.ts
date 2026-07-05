/**
 * @vitest-environment node
 *
 * Gemini transport. In mock mode (LLM_FORCE_MOCK, set globally by vitest.config)
 * it returns a canned reply with no network. With a key + the mock disabled, it
 * POSTs to the Gemini Developer API and parses usageMetadata — including
 * cachedContentTokenCount. `fetch` is stubbed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMockLlm, runLlmTurn } from "@/server/llm";
import type { LlmTurnInput } from "@/server/llm";

const input: LlmTurnInput = {
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Explain softmax." }],
};

const savedKey = process.env.GEMINI_API_KEY;
const savedMock = process.env.LLM_FORCE_MOCK;

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
  if (savedMock === undefined) delete process.env.LLM_FORCE_MOCK;
  else process.env.LLM_FORCE_MOCK = savedMock;
});

const okResponse = (json: unknown) => ({ ok: true, json: async () => json });

describe("mock mode", () => {
  it("returns a canned reply with mock=true and no network", async () => {
    process.env.LLM_FORCE_MOCK = "true";
    expect(isMockLlm()).toBe(true);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await runLlmTurn(input);
    expect(r.mock).toBe(true);
    expect(r.text).toContain("Mock LLM");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("live mode (fetch stubbed)", () => {
  it("parses candidate text + usage incl. cached tokens", async () => {
    delete process.env.LLM_FORCE_MOCK;
    process.env.GEMINI_API_KEY = "test-key";
    expect(isMockLlm()).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okResponse({
          candidates: [
            { content: { parts: [{ text: "Softmax normalizes logits." }] } },
          ],
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 42,
            thoughtsTokenCount: 8,
            cachedContentTokenCount: 640,
          },
        }),
      ),
    );

    const r = await runLlmTurn(input);
    expect(r).toMatchObject({
      text: "Softmax normalizes logits.",
      promptTokens: 1000,
      cachedTokens: 640,
      // completion = candidates(42) + thoughts(8) — thinking tokens are billed.
      completionTokens: 50,
      costCredits: null,
      mock: false,
    });
  });

  it("sends systemInstruction + contents with user/model roles and the api-key header", async () => {
    delete process.env.LLM_FORCE_MOCK;
    process.env.GEMINI_API_KEY = "test-key";

    const fetchMock = vi.fn(async () =>
      okResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {},
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runLlmTurn({
      system: "SYS",
      messages: [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ],
    });

    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(call[0]).toContain("/models/gemini-2.5-flash:generateContent");
    expect(call[1].headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(call[1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "SYS" }] });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "q1" }] },
      { role: "model", parts: [{ text: "a1" }] },
      { role: "user", parts: [{ text: "q2" }] },
    ]);
  });

  it("throws with the status + body on a non-OK response", async () => {
    delete process.env.LLM_FORCE_MOCK;
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => "prepayment credits depleted",
      })),
    );
    await expect(runLlmTurn(input)).rejects.toThrow(/429/);
  });
});
