import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ channel: "chrome" });

test("refreshes model performance after evaluation and offers two dashboard actions", async ({ page }) => {
  const taskId = "6ad6f31aedcac0b9fd5ce065";
  const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", exp: 4102444800 })).toString("base64url");
  await page.addInitScript((token) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer" }));
  }, `x.${payload}.x`);
  const task = { _id: taskId, name: "Pilot", description: "Review", type: "Multiclass", labels: [{ name: "positive", definition: "Positive", keywords: [] }], columns: ["text"], codebookComplete: true, status: "ready" };
  const results = { predictionsFilename: "predictions.csv", macroF1: 0.75, microF1: 0.63, macroPrecision: 0.8, macroRecall: 0.7, accuracy: 0.7, numSamples: 10, completedAt: "2026-11-23T00:00:00Z" };
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
  await expect(page.getByRole("button", { name: "D_all predictions" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "D_val predictions" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Batch codebooks" })).toBeDisabled();
  await page.getByRole("button", { name: "Evaluate D_val" }).click();
  await expect(page.getByText("75%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("63%", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "D_val predictions" })).toBeEnabled();
  await expect.poll(() => taskReads).toBeGreaterThanOrEqual(2);
});

test("shows both inference jobs and refreshes D_all when it finishes", async ({ page }) => {
  const taskId = "6ad6f31aedcac0b9fd5ce065";
  const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", exp: 4102444800 })).toString("base64url");
  await page.addInitScript((token) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer" }));
  }, `x.${payload}.x`);
  let finished = false;
  let failedRefresh = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/getTask/${taskId}`)) {
      if (finished && !failedRefresh) { failedRefresh = true; return route.fulfill({ status: 503 }); }
      return route.fulfill({ json: { task: { _id: taskId, name: "Example", description: "Review", type: "Multiclass", labels: [], columns: ["text"], codebookComplete: true, finalInferenceStatus: finished ? "ready" : "running", ...(finished ? { finalInferenceFile: "result.csv" } : {}) } } });
    }
    if (path.includes("/val-eval/progress/")) return route.fulfill({ json: { completed: 2, total: 10, done: false } });
    if (path.includes("/auto-label/progress/")) return route.fulfill({ json: finished ? { completed: 20, total: 20, done: true, outputFile: "result.csv" } : { completed: 8, total: 20, done: false } });
    return route.fulfill({ json: { success: true, tasks: [], annotations: [] } });
  });
  await page.goto(`/dashboard/${taskId}`);
  const val = page.getByRole("region", { name: "Evaluation progress" });
  const all = page.getByRole("status", { name: "D_all inference progress" });
  await expect(val).toContainText("2 of 10");
  await expect(all).toContainText("8 of 20");
  expect((await all.boundingBox())!.y).toBeGreaterThan((await val.boundingBox())!.y);
  finished = true;
  await expect(page.getByRole("button", { name: "D_all predictions" })).toBeEnabled();
  await expect(all).toContainText("D_all inference complete");
});

test("downloads codebook versions with reviewed batch metrics", async ({ page }) => {
  const taskId = "6ad6f31aedcac0b9fd5ce065";
  const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", exp: 4102444800 })).toString("base64url");
  await page.addInitScript((token) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer" }));
  }, `x.${payload}.x`);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/getTask/${taskId}`)) return route.fulfill({ json: { task: { _id: taskId, name: "Example", description: "Review", type: "Multiclass", labels: [{ name: "positive" }], columns: ["text"], codebookVersions: { "1": { batch: 1, codebook: ["rule"], savedAt: "now" } } } } });
    if (path.includes("/get-annotations/")) return route.fulfill({ json: { annotations: [{ source: "guide", sampleId: 1, labels: ["positive"], aiAnnotation: { batchNum: 1, isCorrect: true, label: ["positive"] } }] } });
    return route.fulfill({ json: { success: true, tasks: [], annotations: [] } });
  });
  await page.goto(`/dashboard/${taskId}`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Batch codebooks" }).click();
  const file = await download;
  const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(exported.versions[0].reviewedBatchPredictionsBeforeCodebookUpdate).toMatchObject({ sampleCount: 1, macroF1: 1, microF1: 1 });
  expect(exported.versions[0].dValEvaluationOfThisCodebook).toBeNull();
});
