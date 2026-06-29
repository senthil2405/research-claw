Improvement: Chat count badge on the toolbar chat-history toggle

Show a small number badge overlaid on the top-right corner of the chat-history
panel toggle button in PdfToolbar. The badge displays how many highlight/chat
windows exist for the current PDF so users know at a glance whether they have
any saved conversations.

**Behaviour**
- Badge is hidden when there are no chats (count = 0).
- Badge shows the integer count (1–99) for 1–99 chats.
- Badge caps at "99+" for 100+ chats.
- Badge inherits the accent colour (--accent / terracotta) to match the overall
  design language.

**Implementation**
- No DB/API/service changes required — the count is already available from
  DocChatContext.highlights (loaded by DocChatProvider on every doc page).
- PdfToolbar is rendered inside DocChatProvider (see DocViewer.tsx), so it can
  call useDocChatOptional() and read highlights.length directly.
- Wrap the chat-panel button in a position:relative container; render the badge
  as a position:absolute span at top-right.

**Files changed**
- src/components/viewer/PdfToolbar.tsx
- src/components/viewer/PdfToolbar.module.css

**Tests**
- Unit: src/components/viewer/__tests__/PdfToolbar.test.tsx
- E2E:  e2e/chathistory.spec.ts (assertion added to existing chat-history test)
