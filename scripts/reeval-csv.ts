/**
 * Re-evaluates the passages+questions in an existing eval CSV using the
 * current system prompt, and writes the new Claude responses into a new
 * "new_claude_response" column in the same file.
 *
 * Usage:
 *   npx tsx scripts/reeval-csv.ts [path-to-csv]
 *
 * Defaults to eval-results.csv in the project root.
 */

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const CSV_PATH = process.argv[2] ?? path.join(process.cwd(), "eval-results.csv");
const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || "claude";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

// Paper title inferred from the first data row — override via env if needed.
const PAPER_TITLE = process.env.PAPER_TITLE ?? "";

// ---------------------------------------------------------------------------
// System prompt (keep in sync with src/server/services/chat.ts)
// ---------------------------------------------------------------------------

function buildSystemPrompt(filename: string): string {
  return `\
You are a question answering agent helping someone read and understand a research paper called "${filename}".

When explaining unfamiliar concepts, technologies, or terminology in this document, follow these conventions:
0. Give answers in the same way you would write abd explain answers in a descriptive examination, be specific with the details and dont use any lingo terms like .. etc keep the answer descriptive, if you are refering to something name what are you referin to

1. Lead with intuition before mechanics. Before diving into how something works,
   explain why it exists and what problem it solves, in plain language.

2. Write in prose, not bullet points or headers, unless I explicitly ask for a
   list. Explanations should read like you're talking to a peer, not generating
   documentation.

3. Layer the explanation: start with the simple mental model, then add precision
   and detail. Don't front-load jargon — define terms as you introduce them, and
   assume I want to actually understand the concept, not just get a definition.

4. Use concrete, worked examples over abstract description wherever possible.

5. Be direct and skip unnecessary preamble ("Great question!", "Let me explain...").
   Just explain.

6. This applies specifically to conceptual/technical explanations (e.g. "what does
   this library do," "why is this pattern used here," "what's a closure"). For
   normal coding tasks — writing code, debugging, running commands — respond
   normally and efficiently without this expanded explanatory style.`;
}

function buildUserMessage(selectedText: string, question: string): string {
  const passage = selectedText.trim();
  if (!passage) return question;
  return `Regarding this passage from the paper:\n\n"""${passage}"""\n\n${question}`;
}

// ---------------------------------------------------------------------------
// Simple CSV parser that handles RFC-4180 quoting
// ---------------------------------------------------------------------------

function parseCSV(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        cell += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        cell += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(cell);
        cell = "";
        i++;
      } else if (ch === '\r' && raw[i + 1] === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        i += 2;
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function serializeCSV(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Claude CLI call
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

    const child = spawn(CLAUDE_BIN, args, { env: process.env });
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = await readFile(CSV_PATH, "utf8");
  const rows = parseCSV(raw);

  if (rows.length < 2) {
    console.error("CSV has no data rows");
    process.exit(1);
  }

  const header = rows[0];
  const passageIdx = header.indexOf("passage");
  const questionIdx = header.indexOf("question");
  const newColName = "new_claude_response";

  if (passageIdx === -1 || questionIdx === -1) {
    console.error("CSV must have 'passage' and 'question' columns. Found:", header);
    process.exit(1);
  }

  // Add or replace the new_claude_response column
  let newColIdx = header.indexOf(newColName);
  if (newColIdx === -1) {
    newColIdx = header.length;
    header.push(newColName);
  }

  // Infer paper title from first data row if not set via env
  const paperTitle = PAPER_TITLE || (() => {
    const firstPassage = rows[1]?.[passageIdx] ?? "";
    // Use just the first sentence of the first passage as a rough title hint
    return firstPassage.split(/[.\n]/)[0].trim().slice(0, 120);
  })();

  const systemPrompt = buildSystemPrompt(paperTitle);
  console.log(`Paper: ${paperTitle.slice(0, 80)}...`);
  console.log(`Processing ${rows.length - 1} rows...\n`);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const passage = row[passageIdx] ?? "";
    const question = row[questionIdx] ?? "";

    if (!passage && !question) {
      while (row.length <= newColIdx) row.push("");
      continue;
    }

    // Skip rows that already have a successful response
    const existing = row[newColIdx] ?? "";
    if (existing && !existing.startsWith("ERROR:")) {
      console.log(`[${i}/${rows.length - 1}] skipping (already filled)`);
      continue;
    }

    const userMessage = buildUserMessage(passage, question);
    console.log(`[${i}/${rows.length - 1}] Q: "${question.slice(0, 60)}..."`);

    let response: string;
    try {
      response = await callClaude(systemPrompt, userMessage);
      console.log(`  → ${response.slice(0, 80)}...\n`);
    } catch (e) {
      response = `ERROR: ${String(e)}`;
      console.error(`  ✗ ${response}\n`);
    }

    while (row.length <= newColIdx) row.push("");
    row[newColIdx] = response;
  }

  // Re-serialise and write back
  rows[0] = header;
  await writeFile(CSV_PATH, serializeCSV(rows), "utf8");
  console.log(`Done. Updated: ${CSV_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
