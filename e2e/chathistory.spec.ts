import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_PATH } from "./global-setup";

/**
 * Chat-history side panel + "go to top": create a chat (highlight), open the
 * right-hand panel from the toolbar, confirm the chat is listed, and clicking it
 * opens the window. Runs against the mock Claude backend.
 */

async function selectFirstSpan(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".react-pdf__Page__textContent span",
      ),
    );
    const target = spans.find((s) => (s.textContent ?? "").trim().length > 3);
    if (!target || !target.firstChild) return "";
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    if (!sel) return "";
    sel.removeAllRanges();
    sel.addRange(range);
    const text = sel.toString().trim();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return text;
  });
}

test("chat history panel lists chats and reopens them; go-to-top is present", async ({
  page,
}) => {
  // ---- Upload + wait for the text layer ----
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(async () => page.locator(".react-pdf__Page__textContent span").count(), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // The "Go to top" toolbar button exists.
  await expect(page.getByRole("button", { name: "Go to top" })).toBeVisible();

  // ---- Create a chat via selection -> toolbar chat icon ----
  const selectedText = await selectFirstSpan(page);
  expect(selectedText.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ask Claude about this" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // Send a message so the chat persists (closing an empty chat removes its
  // highlight), then close the window to prove the panel reopens it.
  const composer = dialog.getByRole("textbox", { name: "Message" });
  await composer.fill("What is this passage about?");
  await composer.press("Enter");
  await expect(dialog.getByText(/Mock LLM/i)).toBeVisible({
    timeout: 20_000,
  });
  await dialog.getByRole("button", { name: "Close chat window" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // ---- Badge: the toolbar toggle button should now show "1" ----
  await expect(page.locator('[aria-label="1 chats"]').first()).toBeVisible();

  // ---- Chat-history panel is open by default; verify it shows the new chat ----
  const panel = page.getByRole("complementary", { name: "Chats in this PDF" });
  await expect(panel).toBeVisible();
  // The created chat is listed (snippet of the selected text).
  const entry = panel.getByRole("button").filter({ hasText: /p\.\d+/ }).first();
  await expect(entry).toBeVisible({ timeout: 10_000 });

  // ---- Clicking the entry reopens its window ----
  await entry.click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
});

/**
 * Regression guard: jumping to a far page must land on that page (not fall short
 * near the top, which happened for pages > 2 when scrollToIndex was used on
 * unmeasured virtualized pages). Uses the toolbar page input — the same
 * requestScroll path the chat-history panel uses.
 */
async function pageAtTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const stage = [...document.querySelectorAll("div")].find(
      (d) =>
        d.scrollHeight > d.clientHeight + 50 &&
        getComputedStyle(d).overflowY !== "visible" &&
        !!d.querySelector(".react-pdf__Page"),
    );
    if (!stage) return -1;
    const top = stage.getBoundingClientRect().top;
    let best = 1;
    let bestRel = -1e9;
    stage.querySelectorAll("[data-page-number]").forEach((e) => {
      const rel = (e as HTMLElement).getBoundingClientRect().top - top;
      if (rel <= 40 && rel > bestRel) {
        bestRel = rel;
        best = Number(e.getAttribute("data-page-number"));
      }
    });
    return best;
  });
}

test("jumping to a far page lands on that page (not the top)", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(800);

  const input = page.getByRole("textbox", { name: "Page number" });
  for (const target of [4, 5, 3]) {
    await input.click();
    await input.fill(String(target));
    await input.press("Enter");
    await expect.poll(() => pageAtTop(page), { timeout: 5_000 }).toBe(target);
  }
});
