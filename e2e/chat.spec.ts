import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_PATH } from "./global-setup";

/**
 * Part B end-to-end: text selection -> toolbar -> highlight + chat window ->
 * mock Claude reply -> minimize/chip -> reopen -> reload persistence.
 *
 * Runs against the dev server with the MOCK Claude backend (default when
 * CLAUDE_CODE_OAUTH_TOKEN is empty), so no subscription is required.
 */

/**
 * Synthetically select the text of a text-layer span and dispatch a real
 * `mouseup` on document, mirroring what useTextSelection listens for. Returns
 * the selected string (or "" if no suitable span was found).
 */
async function selectFirstSpan(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".react-pdf__Page__textContent span",
      ),
    );
    // Pick the first span that actually carries visible text.
    const target = spans.find((s) => (s.textContent ?? "").trim().length > 3);
    if (!target || !target.firstChild) return "";

    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    if (!sel) return "";
    sel.removeAllRanges();
    sel.addRange(range);

    const text = sel.toString().trim();
    // The hook listens for mouseup on document.
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return text;
  });
}

test("chat flow: select -> ask -> minimize -> reopen -> persist", async ({
  page,
}) => {
  // ---- 1. Upload + land on the doc, wait for the text layer ----
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });

  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator(".react-pdf__Page__textContent").first(),
  ).toBeVisible({ timeout: 30_000 });
  // Ensure spans have actually been laid out.
  await expect
    .poll(
      async () =>
        page.locator(".react-pdf__Page__textContent span").count(),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  // ---- 2. Synthetic text selection -> SelectionToolbar appears ----
  const selectedText = await selectFirstSpan(page);
  expect(selectedText.length).toBeGreaterThan(0);

  // The SelectionToolbar's chat button is unique (the PdfToolbar also uses
  // role="toolbar"), so assert on the button directly.
  const askButton = page.getByRole("button", {
    name: "Ask Claude about this",
  });
  await expect(askButton).toBeVisible({ timeout: 10_000 });

  // ---- 3. Click the chat button -> a ChatWindow (dialog) opens ----
  await askButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // The window quotes the selected passage somewhere in its chrome.
  await expect(dialog).toContainText(selectedText.slice(0, 8));

  // ---- 4. Ask a question -> mock assistant reply appears ----
  const composer = dialog.getByRole("textbox", { name: "Message" });
  await composer.fill("What is this passage about?");
  await composer.press("Enter");

  // The mock reply echoes the question ("You asked: ..."), so match the first
  // occurrence (the user bubble).
  await expect(
    dialog.getByText("What is this passage about?").first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText(/Mock Claude/i)).toBeVisible({
    timeout: 20_000,
  });

  // ---- 5. Minimize -> panel detaches to floating, minimize again -> chip ----
  // First click: panel → floating (dialog still visible as a floating window).
  await dialog.getByRole("button", { name: "Minimize chat window" }).click();
  const floating = page.getByRole("dialog");
  await expect(floating).toBeVisible({ timeout: 5_000 });
  // Second click: floating → minimized (hidden), chip appears.
  await floating.getByRole("button", { name: "Minimize chat window" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const chip = page.getByRole("button", {
    name: "Reopen chat for this highlight",
  });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await chip.click();

  const reopened = page.getByRole("dialog");
  await expect(reopened).toBeVisible({ timeout: 10_000 });
  // Prior messages are still present.
  await expect(
    reopened.getByText("What is this passage about?").first(),
  ).toBeVisible();
  await expect(reopened.getByText(/Mock Claude/i).first()).toBeVisible();

  // ---- 6. Reload -> highlight persists; reopening shows prior messages ----
  await page.reload();
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({
    timeout: 30_000,
  });

  // The persisted highlight box (aria-label) or its minimized chip is present.
  const highlightBox = page.getByRole("button", {
    name: "Open chat for this highlight",
  });
  await expect(highlightBox.first()).toBeVisible({ timeout: 15_000 });
  await highlightBox.first().click();

  const afterReload = page.getByRole("dialog");
  await expect(afterReload).toBeVisible({ timeout: 10_000 });
  // Persistence: the earlier conversation is reloaded from the server.
  await expect(
    afterReload.getByText("What is this passage about?").first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(afterReload.getByText(/Mock Claude/i).first()).toBeVisible();
});

test("closing a chat with no messages removes its highlight", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      async () => page.locator(".react-pdf__Page__textContent span").count(),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  // Select text and open a chat window, but DON'T send a message.
  const selectedText = await selectFirstSpan(page);
  expect(selectedText.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ask Claude about this" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // The highlight is now painted in the PDF.
  await expect(
    page.getByRole("button", { name: "Open chat for this highlight" }).first(),
  ).toBeVisible({ timeout: 10_000 });
  // Wait for the empty state so the messages query has settled (fetched empty).
  await expect(
    dialog.getByText(/Ask a question about this passage/i),
  ).toBeVisible({ timeout: 10_000 });

  // Close without sending → the highlight should be removed too.
  await dialog.getByRole("button", { name: "Close chat window" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open chat for this highlight" }),
  ).toHaveCount(0, { timeout: 10_000 });

  // It stays gone after a reload (server-side deletion).
  await page.reload();
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "Open chat for this highlight" }),
  ).toHaveCount(0, { timeout: 10_000 });
});
