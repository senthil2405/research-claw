// Per-document turn serialization for the chat backend.
//
// The chat transport itself now lives in `src/server/llm.ts` (OpenRouter). This
// module keeps only the per-document lock: turns for one document must run one
// at a time so the ChatSession.seqCounter / turnIndex reads inside a turn are
// always fresh and never interleave. The old Claude CLI turn code was retired
// when chat moved to OpenRouter (see `src/server/llm.ts`).

const locks = new Map<string, Promise<unknown>>();

export async function withSessionLock<T>(
  documentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(documentId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(
    documentId,
    prev.then(() => next),
  );
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
  }
}
