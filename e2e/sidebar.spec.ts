import { expect, test } from "@playwright/test";

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
