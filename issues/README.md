# Issues

Known bugs, constraints, and UX gaps tracked here.

| # | Title | Status |
|---|-------|--------|
| [001](001-priming-throws-retry.md) | Priming throws → next request re-primes | ~~known-safe~~ n/a (priming removed) |
| [002](002-priming-db-save-throws.md) | Priming succeeds but DB save throws → orphaned Claude session | ~~known-acceptable~~ n/a (priming removed) |
| [003](003-priming-returns-null-session-id.md) | Priming returns null sessionId → user turn starts unprimed session | ~~handled-with-warning~~ n/a (priming removed) |
| [004](004-multi-process-priming-race.md) | Multi-process deployment → simultaneous priming race | known-constraint |
| [005](005-seqcounter-turnindex-race.md) | seqCounter + turnIndex race condition under concurrent messages | **fixed** |
| [006](006-first-message-latency.md) | First message was ~2× slower due to unnecessary priming | **fixed** (priming removed) |
