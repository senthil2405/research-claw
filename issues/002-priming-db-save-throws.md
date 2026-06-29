---
id: 002
title: Priming succeeds but DB checkpoint save throws → orphaned Claude session
status: known-acceptable
area: chat/priming
file: src/server/services/chat.ts
---

## Description

After a successful priming call, `chat.ts` immediately saves the `claudeSessionId` to the DB as a checkpoint (before running the user turn). If that `prisma.chatSession.update` throws, the Claude session was created on Anthropic's side but its ID is lost. The user turn that follows starts a fresh unprimed session, and that session's ID is saved at the end of the transaction.

The primed session is orphaned on Claude's side. The next user request will prime again.

## Impact

Low. One extra API call per failure. No data loss, no user-visible error (the user still gets an answer).

## Status

Acceptable edge case. A retry-safe approach would require idempotency keys or a two-phase write, which is over-engineering for a dev-stage app.
