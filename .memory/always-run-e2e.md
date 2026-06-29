---
name: always-run-e2e
description: "After any code change in Research Claw, run the full E2E/gate before declaring done"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 67bbb3a9-bf15-4840-8127-2e56c73f4c81
---

The user wants a regression check after every change: don't just typecheck — actually start the app and run the end-to-end suite to confirm existing functionality still works.

**Why:** they were burned by a change and want assurance nothing silently breaks.

**How to apply:** after each change to Research Claw, run the full gate before reporting done — `npx tsc --noEmit`, `npm run lint`, `npm run test` (Vitest), and **`npx playwright test`** (the e2e/ specs: app.spec, chat.spec, claudeauth.spec, chathistory.spec, sidebar.spec, pinchzoom.spec — boots its own dev server with `CLAUDE_FORCE_MOCK=true`), plus `npm run build`. Prefix node/npm/npx with `export PATH="/opt/homebrew/bin:$PATH"` (Node is Homebrew-installed and may not be on the default PATH). If a spec breaks, fix it (or the regression) before finishing.
