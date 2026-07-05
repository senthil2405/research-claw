// Gemini (Google AI / Developer API) chat transport. Chat runs on
// `generativelanguage.googleapis.com` — model is a config string (GEMINI_MODEL,
// default gemini-2.5-flash). Switching model is a one-line env change.
//
// There is no session resume: the caller (services/chat.ts) rebuilds the
// conversation from the DB each turn. Gemini 2.5 models do automatic *implicit*
// prefix caching (Google-side, no config), reported back as
// usageMetadata.cachedContentTokenCount — so replaying a stable prefix is cheap
// and we meter only the uncached remainder (see services/usage.ts).

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 120_000;

export type LlmRole = "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmTurnInput {
  /** System prompt — kept byte-stable across a paper's windows for cache hits. */
  system: string;
  /** Prior turns of this thread followed by the new user message. */
  messages: LlmMessage[];
  /** Override the configured model (rarely needed). */
  model?: string;
}

export interface LlmTurnResult {
  text: string;
  promptTokens: number | null;
  /** Prompt tokens served from Gemini's implicit context cache (cheap). */
  cachedTokens: number | null;
  completionTokens: number | null;
  /** Real cost in credits — Gemini's API doesn't return one, so always null. */
  costCredits: number | null;
  durationMs: number | null;
  mock: boolean;
}

/** True when no real backend is configured — chat falls back to the mock. */
export function isMockLlm(): boolean {
  return (
    process.env.LLM_FORCE_MOCK === "true" || !process.env.GEMINI_API_KEY?.trim()
  );
}

export function llmModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function baseUrl(): string {
  return (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
}

function headers(): Record<string, string> {
  return {
    "x-goog-api-key": process.env.GEMINI_API_KEY?.trim() ?? "",
    "Content-Type": "application/json",
  };
}

/** Build the Gemini request body from the provider-agnostic turn input. */
function buildBody(input: LlmTurnInput): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    // Gemini roles are "user" / "model" (not "assistant").
    contents: input.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  };
}

// Gemini usageMetadata shape (fields optional / may be absent).
interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  // 2.5 models "think" by default; these are billed as output but reported
  // SEPARATELY from candidatesTokenCount, so we must add them to the count.
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsage;
  promptFeedback?: { blockReason?: string };
}

function extractText(resp: GeminiResponse): string {
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

function parseUsage(usage: GeminiUsage | undefined | null) {
  return {
    promptTokens: usage?.promptTokenCount ?? null,
    cachedTokens: usage?.cachedContentTokenCount ?? (usage ? 0 : null),
    // Output = visible answer + (billed) thinking tokens.
    completionTokens: usage
      ? (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)
      : null,
    costCredits: null as number | null,
  };
}

function mockText(input: LlmTurnInput): string {
  const last = [...input.messages].reverse().find((m) => m.role === "user");
  const q = (last?.content ?? "").slice(0, 400);
  return (
    "**(Mock LLM — set GEMINI_API_KEY to use Gemini)**\n\n" +
    "Here's a formatted sample so you can see rendering. The classifier is " +
    "**f = σ ∘ g**, built from two pieces:\n\n" +
    "- **g** : ℝ^d → ℝ^k — the raw network, outputting *K* unbounded logits.\n" +
    "- **σ** — the softmax, which turns logits into probabilities:\n\n" +
    "$$\\sigma_i(z) = \\frac{e^{z_i}}{\\sum_{j=1}^{k} e^{z_j}}$$\n\n" +
    "Inline math like $\\sigma_i(z) \\in (0,1)$ renders too, and so does `code`.\n\n" +
    `You asked: "${q}"`
  );
}

function mockResult(input: LlmTurnInput): LlmTurnResult {
  return {
    text: mockText(input),
    promptTokens: null,
    cachedTokens: null,
    completionTokens: null,
    costCredits: null,
    durationMs: null,
    mock: true,
  };
}

function modelUrl(input: LlmTurnInput, method: string, query = ""): string {
  const model = input.model ?? llmModel();
  return `${baseUrl()}/models/${model}:${method}${query}`;
}

/** Run one non-streaming chat turn through Gemini (or the mock). */
export async function runLlmTurn(input: LlmTurnInput): Promise<LlmTurnResult> {
  if (isMockLlm()) {
    await new Promise((r) => setTimeout(r, 200));
    return mockResult(input);
  }

  const startMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(modelUrl(input, "generateContent"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(buildBody(input)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Gemini request failed (${res.status}): ${body.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as GeminiResponse;
    const text = extractText(json);
    if (!text) {
      const reason =
        json.candidates?.[0]?.finishReason ??
        json.promptFeedback?.blockReason ??
        "empty";
      throw new Error(`Gemini returned no text (${reason})`);
    }
    return {
      text,
      ...parseUsage(json.usageMetadata),
      durationMs: Date.now() - startMs,
      mock: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stream one chat turn, invoking `onToken` for each text delta. Mirrors
 * runLlmTurn's contract; usage arrives on the final SSE chunk.
 */
export async function streamLlmTurn(
  input: LlmTurnInput,
  onToken: (delta: string) => void,
): Promise<LlmTurnResult> {
  if (isMockLlm()) {
    await new Promise((r) => setTimeout(r, 200));
    const result = mockResult(input);
    onToken(result.text);
    return result;
  }

  const startMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(
      modelUrl(input, "streamGenerateContent", "?alt=sse"),
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(buildBody(input)),
        signal: controller.signal,
      },
    );
    if (!res.ok || !res.body) {
      const body = res.body ? await res.text().catch(() => "") : "";
      throw new Error(
        `Gemini stream failed (${res.status}): ${body.slice(0, 500)}`,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let usage: GeminiUsage | undefined;

    // Gemini SSE: lines of `data: {GenerateContentResponse chunk}`; each chunk
    // carries a text delta, and the final chunk carries usageMetadata.
    const handleData = (payload: string) => {
      let evt: GeminiResponse;
      try {
        evt = JSON.parse(payload);
      } catch {
        return;
      }
      const delta = extractText(evt);
      if (delta) {
        text += delta;
        onToken(delta);
      }
      if (evt.usageMetadata) usage = evt.usageMetadata;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line || line.startsWith(":")) continue;
        if (line.startsWith("data:")) handleData(line.slice(5).trim());
      }
    }

    if (!text) throw new Error("Gemini returned an empty response");
    return {
      text,
      ...parseUsage(usage),
      durationMs: Date.now() - startMs,
      mock: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
