import { expect, test } from "@playwright/test";
import { FIXTURE_PATH } from "./global-setup";

/**
 * Pinch-to-zoom: verify that a ctrl+wheel event over the PDF stage
 * drives the toolbar zoom indicator (same store path as toolbar buttons).
 */
test("ctrl+wheel over the PDF stage zooms in and out", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  await page.waitForURL(/\/doc\/.+/, { timeout: 30_000 });
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({
    timeout: 30_000,
  });

  // Baseline zoom is 80 %.
  await expect(page.getByText("80%", { exact: true })).toBeVisible();

  // Dispatch a ctrl+wheel event that simulates a trackpad pinch-out (zoom in).
  // deltaY < 0 → Math.exp(-(-200)/300) ≈ 1.95 → scale roughly doubles, but
  // we dispatch a smaller value for a realistic increment.
  await page.locator("[data-pdf-stage]").dispatchEvent("wheel", {
    deltaY: -120,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });

  // The toolbar should show a zoom > 100 %.
  await expect
    .poll(
      async () => {
        const text = await page.getByText(/%$/).first().textContent();
        return parseInt(text ?? "0", 10);
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThan(100);

  // Pinch back in (zoom out).
  await page.locator("[data-pdf-stage]").dispatchEvent("wheel", {
    deltaY: 400,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });

  await expect
    .poll(
      async () => {
        const text = await page.getByText(/%$/).first().textContent();
        return parseInt(text ?? "200", 10);
      },
      { timeout: 5_000 },
    )
    .toBeLessThan(100);
});
