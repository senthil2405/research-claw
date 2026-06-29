import { expect, test } from "@playwright/test";
import { FIXTURE_PATH } from "./global-setup";

/** The app sidebar collapses to a thin rail and expands back. */
test("app sidebar collapses to a rail and expands back", async ({ page }) => {
  await page.goto("/");
  // Expanded by default: brand name + New chat label visible.
  const brand = page.getByText("Research Claw", { exact: true });
  await expect(brand).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New chat" }),
  ).toBeVisible();

  // Collapse.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(brand).toHaveCount(0);
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  await expect(expand).toBeVisible();

  // Expand again.
  await expand.click();
  await expect(brand).toBeVisible();
});

/** After uploading a PDF the history list shows a "Today" date group label. */
test("document history shows date group label after upload", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });
  // The sidebar collapses automatically on doc load — expand it to see history.
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(
    page.getByText("Today", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});
