import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

test("refreshes model performance after evaluation and offers two dashboard actions", async ({ page }) => {
  const taskId = "6ad6f31aedcac0b9fd5ce065";
  const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", exp: 4102444800 })).toString("base64url");
  await page.addInitScript((token) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer" }));
  }, `x.${payload}.x`);
  const task = { _id: taskId, name: "Pilot", description: "Review", type: "Multiclass", labels: [{ name: "positive", definition: "Positive", keywords: [] }], columns: ["text"], codebookComplete: true, status: "ready" };
  const results = { macroF1: 0.75, macroPrecision: 0.8, macroRecall: 0.7, accuracy: 0.7, numSamples: 10, completedAt: "2026-11-23T00:00:00Z" };
  let completed = false;
  let taskReads = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(`/getTask/${taskId}`)) {
      taskReads++;
      await route.fulfill({ json: { task: completed ? { ...task, evalResults: results } : task } });
    } else if (url.pathname.endsWith("/val-eval")) {
      completed = true;
      await route.fulfill({ json: { success: true, evalResults: results } });
    } else if (url.pathname.includes("/val-eval/progress/")) {
      await route.fulfill({ json: { completed: 0, total: 0, done: false } });
    } else {
      await route.fulfill({ json: { success: true, tasks: [], annotations: [] } });
    }
  });
  await page.goto(`/dashboard/${taskId}?tab=model-performance`);
  await expect(page.getByText("Run final evaluation to see these metrics.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add 5 D_guide samples" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create new task" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open D_all inference" })).toBeEnabled();
  await page.getByRole("button", { name: "Evaluate D_val" }).click();
  await expect(page.getByText("75%", { exact: true }).first()).toBeVisible();
  await expect.poll(() => taskReads).toBeGreaterThanOrEqual(2);
});
