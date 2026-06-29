import { expect, test } from "@playwright/test";
import { FIXTURE_PAGES, FIXTURE_PATH } from "./global-setup";

// Run the full journey as one ordered test so the anon session / login /
// migration state carries across steps in a single browser context.
test("full user journey: upload, render, toolbar, auth, history", async ({
  page,
}) => {
  // ---- 1. Landing ----
  await page.goto("/");
  await expect(
    page.getByText("Research Claw", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(
    page.getByText("Drag a PDF here, or click to upload"),
  ).toBeVisible();

  // ---- 2. Upload (anonymous) ----
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIXTURE_PATH);
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });

  // ---- 3. Real PDF rendering ----
  const canvas = page.locator(".react-pdf__Page__canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // Toolbar shows the correct page count.
  await expect(page.getByText(`/ ${FIXTURE_PAGES}`)).toBeVisible();

  // ---- 4. Toolbar: zoom ----
  await expect(page.getByText("80%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("90%", { exact: true })).toBeVisible();

  // ---- 4b. Toolbar: rotate (should not crash; canvas stays visible) ----
  await page.getByRole("button", { name: "Rotate clockwise" }).click();
  await expect(canvas).toBeVisible();

  // ---- 4c. Toolbar: thumbnails toggle ----
  await page.getByRole("button", { name: "Toggle thumbnails" }).click();
  await expect(
    page.getByRole("complementary", { name: "Page thumbnails" }),
  ).toBeVisible();
  // Close it again.
  await page.getByRole("button", { name: "Toggle thumbnails" }).click();

  // ---- 5. Auth: sign in as the dev test user ----
  // Sidebar collapses on doc load — expand it to reach the sign-in button.
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("button", { name: "Sign in as Test User" }).click();
  // signInDev redirects back to "/".
  await page.waitForURL("**/", { timeout: 30_000 });
  await expect(page.getByText("Test User")).toBeVisible({ timeout: 15_000 });

  // ---- 6. History: the anon-uploaded doc migrated and now shows in Recents ----
  // Use .first(): the shared dev-user accumulates migrated docs across runs.
  const recentItem = page.getByRole("link", { name: /sample\.pdf/ }).first();
  await expect(recentItem).toBeVisible({ timeout: 15_000 });

  // ---- 7. Persistence across reload ----
  await page.reload();
  await expect(page.getByText("Test User")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("link", { name: /sample\.pdf/ }).first(),
  ).toBeVisible();

  // ---- 8. New chat -> home; history item -> back to the doc ----
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("Drag a PDF here, or click to upload"),
  ).toBeVisible();

  await page.getByRole("link", { name: /sample\.pdf/ }).first().click();
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });
  await expect(
    page.locator(".react-pdf__Page__canvas").first(),
  ).toBeVisible({ timeout: 30_000 });

  // ---- 9. Log out ----
  // Sidebar collapsed again after navigating to the doc — expand to reach menu.
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.waitForURL("**/", { timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Sign in as Test User" }),
  ).toBeVisible({ timeout: 15_000 });
});
