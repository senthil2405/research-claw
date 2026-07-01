/**
 * Eval script: picks varied passages from the uploaded PDF, runs each through
 * the exact same buildSystemPrompt + buildUserMessage + claude -p pipeline the
 * app uses, and writes results to eval-results.csv for manual review.
 *
 * Usage:
 *   npx tsx scripts/eval-prompt.ts
 *
 * Requires ANTHROPIC_API_KEY in env, or a claude auth login session.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { extractPdfText } from "../src/server/pdf";
import { readFile } from "node:fs/promises";

const PDF_DIR = path.join(process.cwd(), "storage/uploads");
const OUT_FILE = path.join(process.cwd(), "eval-results.csv");
const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || "claude";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";
// ---------------------------------------------------------------------------
// Mirror of the exact functions in src/server/services/chat.ts
// ---------------------------------------------------------------------------

function buildSystemPrompt(filename: string): string {
  return `\
You are a teacher helping someone read and understand a research paper called "${filename}". The user will paste passages from it and ask questions. Treat every message as if it is coming from someone who is reading this paper for the first time and has no prior context about it — do not assume they know the abstract, the problem being solved, or any earlier sections.

**How to open every response**
Always begin with 2-4 lines that anchor the passage in the paper: what the paper is broadly about, what section or topic the pasted passage is from, and why it exists in the paper. This gives the user context before you explain the detail. Do not make them scroll back to re-read their message to understand your answer.

**How to explain a passage**
Start with what the passage is about in plain terms. Then explain the content the way a knowledgeable person would talk through it with a friend who's new to the topic — building a picture, not defining a glossary.

The most important rule: never explain a term in isolation. Weave all related terms and challenges into one continuous explanation, where each piece connects to the others and to the task.

Here is the wrong way to explain three challenges from a passage:
"Computational overhead — long videos have many frames, which is expensive to process. Long-range temporal dependencies — models struggle to connect events far apart in time. Limited semantic understanding — models match pixels but don't grasp meaning."

Here is the right way:
"These three challenges all compound each other. Long videos are expensive to process — that's the computational overhead problem. But even if you could afford to process them, you'd still need to connect what's happening in minute one to what's happening in minute five, which is the temporal dependency problem; most models only remember what just happened. And even with perfect memory, you'd still be working with pixel patterns that don't tell you what an action *means* — that's the semantic gap, and it's what makes subtle distinctions nearly impossible for a model that's just matching visual statistics."

That is what connected explanation looks like. Each point builds on the last. The reader ends up with one picture of the problem, not three separate definitions.

When the passage is from the title, abstract, or introduction, always include what the paper proposes as its solution, not just the problems it identifies.

**Tone**
Peer-to-peer, direct. No filler openers — never start with "Here's the situation", "Let me unpack this", "Great question", or any warm-up phrase. Start with the content.

Never announce the structure of your response. Do not write "Let me start with X, then Y", "Let me walk through X first", "There are three things worth noting", or any sentence that describes what you are about to say rather than just saying it.

Do not use "First... Second... Third..." to sequence related points. Do not give each point its own bold or italic label followed by an explanation. When there are multiple related problems or concepts, run them together as one continuous paragraph where each flows into the next — not as separately labeled items.

No personal opinions or commentary on the text. No editorializing like "that's the real claim", "this is the central move", "the interesting bit is". Say the thing directly.

**Language**
Plain English only. Explain any term inline in the same sentence you first use it. Do not replace one piece of jargon with another. Write the full thought out in everyday words.

**Ending responses**
One sentence at the end offering to go deeper or continue with the next part.

**When the question seems misframed**
If the question misses the more useful angle, note it briefly and answer the better question instead, or both.

**Deepdives and follow-ups**
Scope narrowing only — jump to the specific mechanism, no re-explaining context already covered. Pointer to earlier explanation instead of re-deriving.

When corrected, acknowledge precisely, state what was wrong and what is right, move on.

**Format**
Prose paragraphs. No numbered lists. No bullet points. No section headers inside a response. Bold or italics are fine for emphasis when genuinely useful. Math in plain notation followed immediately by a plain-English reading of what it means. Never create files.`;
}

function buildUserMessage(selectedText: string, question: string, paperTitle?: string | null): string {
  const passage = selectedText.trim();
  if (!passage) {
    return paperTitle
      ? `The paper being discussed is "${paperTitle}".\n\n${question}`
      : question;
  }
  return `Regarding this passage from the paper:\n\n"""${passage}"""\n\n${question}`;
}

// ---------------------------------------------------------------------------
// Passage selection: pick varied samples across the document
// ---------------------------------------------------------------------------

function pickPassages(fullText: string, count = 8): string[] {
  // Strip page markers and collapse single newlines (PDF line-wrap artifacts)
  const cleaned = fullText
    .replace(/--- Page \d+ ---/g, "\n\n")
    .replace(/\n(?!\n)/g, " ")   // single \n → space (line-wrap)
    .replace(/\n{2,}/g, "\n\n"); // normalise paragraph breaks

  // Split on sentence boundaries into chunks of 3-5 sentences
  const sentences = cleaned.match(/[^.!?]+[.!?]+["']?\s*/g) ?? [];

  const chunks: string[] = [];
  let chunk = "";
  for (const s of sentences) {
    chunk += s;
    if (chunk.length > 250) {
      const trimmed = chunk.trim();
      if (trimmed.length > 150 && trimmed.length < 1400) {
        chunks.push(trimmed);
      }
      chunk = "";
    }
  }

  if (chunks.length === 0) return [];

  // Spread evenly across the document for variety
  const step = Math.max(1, Math.floor(chunks.length / count));
  const picks: string[] = [];
  for (let i = 0; i < count && i * step < chunks.length; i++) {
    picks.push(chunks[i * step]);
  }
  return picks;
}

// Questions that reflect real reader confusion at different passage types
const QUESTIONS = [
  "what does this mean?",
  "can you explain what's happening here in simple terms?",
  "i don't understand the terminology used here, can you break it down?",
  "what is the significance of this — why does it matter for the paper?",
  "can you explain the intuition behind this?",
  "what problem is this solving and why did they approach it this way?",
  "this feels very abstract — can you make it concrete with an example?",
  "what's the key insight i should take away from this passage?",
];

// ---------------------------------------------------------------------------
// Claude CLI call (mirrors runCliChat)
// ---------------------------------------------------------------------------

function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format", "json",
      "--model", MODEL,
      "--append-system-prompt", systemPrompt,
      "--session-id", randomUUID(),
    ];

    const env: NodeJS.ProcessEnv = { ...process.env };
    const child = spawn(CLAUDE_BIN, args, { env });
    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude timed out after 3 minutes"));
    }, 180_000);

    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (err += c.toString()));
    child.stdin.write(userMessage);
    child.stdin.end();

    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.trim() || `claude exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(out);
        const text: string = parsed.result ?? parsed.text ?? parsed.output ?? "";
        if (!text) reject(new Error("Claude returned empty response"));
        else resolve(text);
      } catch {
        reject(new Error("Could not parse Claude CLI output: " + out.slice(0, 200)));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvCell(value: string): string {
  // Wrap in quotes and escape internal quotes
  return `"${value.replace(/"/g, '""')}"`;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",") + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const files = (await readdir(PDF_DIR)).filter((f) => f.endsWith(".pdf"));
  if (files.length === 0) {
    console.error("No PDFs found in", PDF_DIR);
    process.exit(1);
  }
  const pdfFile = files[0];
  const pdfPath = path.join(PDF_DIR, pdfFile);
  console.log(`Using PDF: ${pdfFile}`);

  console.log("Extracting text...");
  const buf = await readFile(pdfPath);
  const fullText = await extractPdfText(new Uint8Array(buf));
  console.log(`Extracted ${fullText.length} chars`);

  const systemPrompt = buildSystemPrompt(pdfFile);
  const passages = pickPassages(fullText, 8);
  console.log(`Selected ${passages.length} passages\n`);

  const writer = createWriteStream(OUT_FILE, { encoding: "utf8" });
  writer.write(csvRow(["#", "passage", "question", "claude_response", "your_comments"]));

  for (let i = 0; i < passages.length; i++) {
    const passage = passages[i];
    const question = QUESTIONS[i % QUESTIONS.length];
    const userMessage = buildUserMessage(passage, question);

    console.log(`[${i + 1}/${passages.length}] Asking: "${question}"`);
    console.log(`  Passage: ${passage.slice(0, 80)}...`);

    let response: string;
    try {
      response = await callClaude(systemPrompt, userMessage);
      console.log(`  Response: ${response.slice(0, 80)}...\n`);
    } catch (e) {
      response = `ERROR: ${String(e)}`;
      console.error(`  Failed: ${response}\n`);
    }

    writer.write(csvRow([String(i + 1), passage, question, response, ""]));
  }

  writer.end();
  console.log(`\nDone! Results written to: ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
