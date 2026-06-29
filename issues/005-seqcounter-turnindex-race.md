---
id: 005
title: seqCounter + turnIndex race condition under concurrent messages
status: fixed
area: chat/db
file: src/server/services/chat.ts
fixed-in: withSessionLock refactor (2026-06-29)
---

## Description

Prior to the fix, `getOrCreateSession` was called inside `withSessionLock` but the `$transaction` that consumed `session.seqCounter` and the `prisma.chatMessage.count` for `turnIndex` ran *outside* the lock. The lock was released before the DB writes committed. A queued request could therefore read the same stale `seqCounter` as the previous request and produce duplicate `seq` values in `ChatMessage`.

Priming worsened the race: the lock was held for two API calls (prime + user turn) instead of one, causing more requests to queue up during the hold, increasing the window for stale reads.

## Fix

Moved the entire critical section — session read, optional prime, user turn, `turnIndex` count, and the `$transaction` — inside `withSessionLock`. The lock is now released only after the DB commit, guaranteeing each request sees the counter values committed by the previous one.

```ts
return withSessionLock(documentId, async () => {
  const session = await getOrCreateSession(documentId);
  // ... prime ...
  const turnResult = await runClaudeTurn({ ... });
  const turnIndex = await prisma.chatMessage.count({ where: { highlightId } });
  const [userRow, assistantRow] = await prisma.$transaction([ ... ]);
  return { userMessage: ..., assistantMessage: ... };
});
```

## Status

Fixed. The remaining multi-process caveat (issue #004) still applies.
