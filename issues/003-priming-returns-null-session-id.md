---
id: 003
title: Priming returns null sessionId → user turn starts unprimed session
status: handled-with-warning
area: chat/priming
file: src/server/services/chat.ts
---

## Description

`runClaudeTurn` returns `{ sessionId: string | null, text: string }`. In theory `sessionId` should never be null for real auth (the CLI always creates or resumes a session), but the type allows it. If it is null after priming, `chat.ts` skips the DB checkpoint and logs a warning. The user turn then runs with `resumeSessionId: null`, starting a fresh unrelated session. The user gets an answer but without the PDF context that priming was supposed to provide.

## Impact

Low in practice (shouldn't happen). If it does, the answer may be less grounded in the paper. The console warning makes it visible.

## How it's handled

```ts
if (claudeSessionId) {
  await prisma.chatSession.update({ ... });
} else {
  console.warn(`[chat] priming returned null sessionId for document ${documentId}`);
}
```

## Status

Handled. No further action unless it appears in logs.
