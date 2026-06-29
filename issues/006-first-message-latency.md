---
id: 006
title: First message per document was ~2× slower due to unnecessary priming
status: fixed
area: chat/priming
file: src/server/services/chat.ts
fixed-in: priming removed (2026-06-29)
---

## Description

The original implementation sent a separate "priming" message to Claude before the first user question, asking it to confirm receipt of the paper. This was unnecessary — the full PDF text is already embedded in the system prompt, which is sent with every API call including the first one. Claude has full context from turn 1 without any extra round-trip.

## Fix

Removed the `PRIME_MESSAGE` constant and the priming block entirely. `sendMessage` now goes directly to `runClaudeTurn` with `resumeSessionId: session.claudeSessionId` (null on first message, populated on subsequent ones).

## Status

Fixed. Issues 001–003 (priming-related edge cases) are also resolved as a side effect — the code they described no longer exists.
