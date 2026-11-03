import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

for (const width of [1440, 1024, 390]) {
  test(`upload file controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", email: "reviewer@example.test", exp: 4102444800 })).toString("base64url");
    await page.addInitScript((token) => {
      localStorage.setItem("accessToken", token);
      localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer", name: "Reviewer", email: "reviewer@example.test" }));
      localStorage.setItem("hideStep1Intro", "true");
    }, `x.${payload}.x`);
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, tasks: [] }) }));
    await page.goto("http://127.0.0.1:15173/new-codebook");
    await expect(page.getByText("Required files", { exact: true })).toBeVisible();
    for (const id of ["task-json", "labels-json", "unlabeled-dataset"]) {
      const card = page.locator(`#${id}`).locator("..");
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      const upload = card.locator(`label[for="${id}"]`);
      const action = await upload.boundingBox();
      expect(action).not.toBeNull();
      expect(action!.x + action!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
    }
    await page.screenshot({ path: `/private/tmp/upload-layout-${width}.png`, fullPage: true });
  });
}
