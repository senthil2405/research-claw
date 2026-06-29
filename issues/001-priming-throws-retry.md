---
id: 001
title: Priming throws → next request re-primes
status: known-safe
area: chat/priming
file: src/server/services/chat.ts
---

## Description

If the priming API call throws (network error, rate limit, etc.), the per-document lock releases and the next queued request wakes up. That request reads `claudeSessionId = null` from the DB and attempts priming again. This repeats until one succeeds and saves the session ID to the DB, after which all subsequent requests skip priming.

## Impact

Low. Transient failures are retried automatically. If the API is consistently down, every queued request pays the priming cost and fails — but no data is corrupted.

## Status

No fix needed. The retry-on-failure behavior is intentional and consistent with the rest of the codebase.
