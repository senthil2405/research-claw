---
name: claude-auth-constraint
description: "Research Claw — Claude auth history, the policy caveat, and the account-login implementation that shipped"
metadata: 
  node_type: memory
  type: project
  originSessionId: 67bbb3a9-bf15-4840-8127-2e56c73f4c81
---

**Background / policy caveat (still true):** Anthropic's docs say third-party apps should use API-key auth, and that claude.ai/subscription OAuth login is "intended for Claude Code and Claude.ai." Using a Pro/Max subscription to serve *other* users from a hosted product is the contested/discouraged case and risks being blocked. This was surfaced to the user multiple times.

**Decision (2026-06-27):** The user rejected API keys and explicitly chose **account-based login driven through the official Claude Code CLI**, accepting the compliance risk as their own product decision. Running the official `claude auth login` is NOT reverse-engineering — it's invoking Anthropic's documented command — so it's appropriate to help build. (Earlier guidance here said "don't build the CLI relay"; that was overcautious — superseded by the user's informed choice. Still note the multi-tenant-on-subscription risk if asked.)

**What shipped (Part C v2 — replaces the BYOK API-key model):**
- `src/server/claudeCli.ts` drives the CLI directly: `startLogin(userId)` spawns `claude auth login --claudeai` with a per-user `CLAUDE_CONFIG_DIR` (`storage/claude-auth/<userId>`), captures the `claude.com/cai/oauth/...` URL from stdout, and holds the child in an in-memory registry (single-instance, 5-min TTL) awaiting the code; `submitLoginCode(userId, code)` writes the code to that child's stdin; `getAuthStatus`/`logoutUser`; `runCliChat` spawns `claude -p --output-format json --append-system-prompt <pdf> [--session-id|--resume]` and parses `{result, session_id}`.
- `src/server/claude.ts` `resolveClaudeAuth(owner)` → `{mode:"account",configDir}` (user.claudeAuthorized) | `{mode:"sharedKey",apiKey}` (env `ANTHROPIC_API_KEY`) | `{mode:"mock"}`. `runClaudeTurn` takes `auth` (not apiKey) and calls the CLI or mock.
- Routes `GET/DELETE /api/me/claude-auth`, `POST /api/me/claude-auth/start` (→{url}), `POST .../code` ({code}) — logged-in only (401 anon). UI: `AuthorizeClaudeModal` (Authorize → open URL → paste code → connected; Disconnect) in `UserMenu` ("Authorize Claude" entry). Hooks `useClaudeAuth`. New `User.claudeAuthorized`/`claudeAuthorizedAt`.
- The old BYOK files (`ClaudeKeyModal`, `useClaudeKey`, `api/claudeKey`, `/api/me/claude-key`, `claudeKey` service, `crypto.ts`) remain present but unreferenced by the live UI; `ANTHROPIC_API_KEY` env still works as a shared fallback.

**Caveats baked in:** in-memory pending-login = single server instance only; live OAuth completion needs the user's real account (not CI-testable — tests mock the `child_process`/HTTP boundary). See [[research-claw-project]].

**Auth persistence fix (2026-06-27):** the Claude OAuth credential is stored in the **global macOS Keychain** (`Claude Code-credentials`), not per-`CLAUDE_CONFIG_DIR` — so `claude auth status` reports `{"loggedIn":true,...}` across server restarts regardless of config dir. The bug: the app gated on the DB `claudeAuthorized` flag alone, so any drift (fresh dev.db, lost app session) caused a needless "Authorize" prompt → risky repeated `claude auth login` (IP-ban concern). Fix: `getAuthStatus()` now JSON-parses `claude auth status` (cached 60s, invalidated on login/logout); `resolveClaudeAuth` and `GET /api/me/claude-auth` fall back to the live CLI status when the DB flag is unset and re-sync the flag — so a restart shows "Connected" and never re-prompts while the CLI session is valid. `claude auth login` runs ONLY when genuinely logged out. Tests: Playwright webServer runs with `CLAUDE_FORCE_MOCK=true` (and `getAuthStatus` short-circuits to not-connected under force-mock) so E2E is independent of the machine's real global login; `claudeauth.spec` stubs `GET /api/me/claude-auth`. Note: in-app "Disconnect" runs `claude auth logout`, which clears the GLOBAL keychain (would log the dev out of their own Claude Code) — known footgun, left as-is.
