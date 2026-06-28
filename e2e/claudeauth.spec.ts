import { expect, test } from "@playwright/test";

/**
 * Part C v2 end-to-end (Authorize Claude — per-user `claude auth login`).
 * Network-free / deterministic:
 *   1. Anonymous requests to every /api/me/claude-auth* route -> 401.
 *   2. Dev-login -> UserMenu exposes "Authorize Claude" -> modal not-connected.
 *   3. With POST /start STUBBED via page.route (so the real `claude auth login`
 *      / claude.com is never hit), clicking Authorize reveals the open-page link
 *      (pointing at the stubbed URL) and the verification-code input.
 *
 * The real OAuth flow + `claude -p` chat are intentionally NOT exercised here to
 * keep the suite offline-stable; the mock chat path is covered by chat.spec.ts.
 */

test("anonymous claude-auth routes are all gated with 401", async ({
  request,
}) => {
  const get = await request.get("/api/me/claude-auth");
  expect(get.status()).toBe(401);
  expect((await get.json()).error).toBeTruthy();

  const start = await request.post("/api/me/claude-auth/start", { data: {} });
  expect(start.status()).toBe(401);

  const code = await request.post("/api/me/claude-auth/code", {
    data: { code: "x" },
  });
  expect(code.status()).toBe(401);

  const del = await request.delete("/api/me/claude-auth");
  expect(del.status()).toBe(401);
});

test("logged-in: Authorize Claude modal shows not-connected state, then awaiting-code after a stubbed start", async ({
  page,
}) => {
  // Force the not-connected state deterministically: the dev machine may have a
  // real global `claude` login that the app now correctly adopts, which would
  // otherwise show "Connected". Stub only the GET status; let other methods pass.
  await page.route("**/api/me/claude-auth", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ connected: false, authorizedAt: null }),
      });
    } else {
      await route.fallback();
    }
  });

  // ---- 1. Dev login ----
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in as Test User" }).click();
  await page.waitForURL("**/", { timeout: 30_000 });
  await expect(page.getByText("Test User")).toBeVisible({ timeout: 15_000 });

  // ---- 2. Open the account popover -> Authorize Claude entry ----
  await page.getByRole("button", { name: "Account menu" }).click();
  const authEntry = page.getByRole("menuitem", { name: "Authorize Claude" });
  await expect(authEntry).toBeVisible();
  await authEntry.click();

  // ---- 3. Modal shows the not-connected (idle) state ----
  const dialog = page.getByRole("dialog", { name: "Authorize Claude" });
  await expect(dialog).toBeVisible();
  const authorizeBtn = dialog.getByRole("button", { name: "Authorize Claude" });
  await expect(authorizeBtn).toBeVisible();
  // Not connected: no Disconnect control yet.
  await expect(dialog.getByRole("button", { name: "Disconnect" })).toHaveCount(
    0,
  );

  // ---- 4. Stub POST /start so we never spawn the real `claude auth login` ----
  const FAKE_URL = "https://claude.com/cai/oauth/e2e-stub?code=fake";
  await page.route("**/api/me/claude-auth/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: FAKE_URL }),
    });
  });

  // ---- 5. Click Authorize -> awaiting-code UI (link + code input) ----
  await authorizeBtn.click();

  const openLink = dialog.getByRole("link", {
    name: /Open authorization page/i,
  });
  await expect(openLink).toBeVisible({ timeout: 10_000 });
  await expect(openLink).toHaveAttribute("href", FAKE_URL);
  await expect(dialog.getByPlaceholder("Paste code here")).toBeVisible();

  // ---- 6. Server status is still disconnected (nothing was authorized) ----
  const res = await page.request.get("/api/me/claude-auth");
  expect(res.status()).toBe(200);
  const status = await res.json();
  expect(status.connected).toBe(false);
});
