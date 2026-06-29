Improvement: Date-grouped document history in the left sidebar

Replace the single flat "Recents" list with time-period group headers
(Today / Yesterday / This week / This month / Older) matching the grouping
pattern Claude.ai uses for conversation history. Each non-empty group gets a
small uppercase label above its items, identical in style to the existing
"Recents" section label.

**Behaviour**
- Documents are sorted by createdAt descending (newest first, same as today).
- Time buckets (relative to the current day at midnight local time):
    Today       — uploaded on the current calendar day
    Yesterday   — uploaded yesterday
    This week   — 2–6 days ago
    This month  — 7–29 days ago
    Older       — 30+ days ago
- Empty buckets are omitted entirely.
- Within each bucket the existing DocumentHistoryItem is reused unchanged.

**Implementation**
- Pure front-end change inside DocumentHistoryList.tsx.
- No DB / API / hook / store changes required.
- The grouping function is a pure function (easy to unit-test).

**Files changed**
- src/components/sidebar/DocumentHistoryList.tsx
- src/components/sidebar/DocumentHistoryList.module.css

**Tests**
- Unit: src/components/sidebar/__tests__/DocumentHistoryList.test.tsx (extend)
- E2E:  e2e/sidebar.spec.ts (assertion that at least one group label is visible)
