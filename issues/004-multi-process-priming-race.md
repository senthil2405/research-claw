---
id: 004
title: Multi-process deployment → simultaneous priming race
status: known-constraint
area: chat/priming
file: src/server/services/chat.ts (withSessionLock in src/server/claude/)
---

## Description

`withSessionLock` uses a module-level in-memory Promise chain. This only serializes requests within a single Node.js process. Under a multi-process deployment (PM2 cluster, `next start` with multiple workers, Kubernetes pods), two processes can simultaneously read `claudeSessionId = null`, both prime, and race to write the session ID. Last write wins; the other primed session is orphaned.

## Impact

Medium under multi-process deploys. Each race produces one extra priming call and one orphaned Claude session. No user-visible error; the winning session ID is saved and subsequent requests resume correctly.

## Status

Known constraint, not a bug for the current single-server dev/staging setup. Fix if scaling to multiple workers:
- Replace in-memory lock with a DB-level advisory lock or a Redis distributed mutex
- Or use a `PRIME_ATTEMPTS` limit + `primeFailed` flag so orphaned sessions don't accumulate
