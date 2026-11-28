import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

test("uploads a review dataset without a separate full dataset", async ({ page }) => {
  const taskId = "6ad6f31aedcac0b9fd5ce065";
  const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", exp: 4102444800 })).toString("base64url");
  await page.addInitScript((token) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer" }));
    localStorage.setItem("hideStep1Intro", "true");
  }, `x.${payload}.x`);
  let submitted = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/inference/models")) return route.fulfill({ json: [{ value: "gpt-oss:120b", label: "GPT-OSS 120B" }] });
    if (path.endsWith("/tasks/create")) {
      const body = route.request().postDataBuffer()!.toString("latin1");
      expect(body).not.toContain('name="d_all_full"');
      expect(body).toContain('name="d_all"; filename="review.csv"');
      submitted = true;
      return route.fulfill({ json: { success: true, taskId, task: { _id: taskId } } });
    }
    return route.fulfill({ json: { success: true, tasks: [], annotations: [] } });
  });
  await page.goto("/new-codebook");
  await page.getByText("Enter details", { exact: true }).click();
  await page.getByLabel("Task Name").fill("Example");
  await page.getByLabel("Description").fill("Example task");
  await page.getByLabel("Text column name").fill("note");
  await page.locator("#labels-json").setInputFiles({ name: "labels.json", mimeType: "application/json", buffer: Buffer.from('{"labels":[{"name":"A","definition":"A"}]}') });
  await page.locator("#unlabeled-dataset").setInputFiles({ name: "review.csv", mimeType: "text/csv", buffer: Buffer.from("note\nreview") });
  await expect(page.locator("#full-dataset")).toHaveCount(0);
  await page.getByRole("button", { name: "Upload and build D_val" }).click();
  await expect.poll(() => submitted).toBe(true);
});
