import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ channel: "chrome" });

test("creates and reopens an analysis-only dashboard and downloads reports", async ({ page }, testInfo) => {
  const taskId = "6ad6f31aedcac0b9fd5ce065";
  const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", email: "reviewer@example.test", exp: 4102444800 })).toString("base64url");
  await page.addInitScript((token) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer", name: "Reviewer", email: "reviewer@example.test" }));
  }, `x.${payload}.x`);
  const task = { _id: taskId, dashboardOnly: true, name: "Pilot", description: "Pilot analysis", type: "Multiclass", labels: [{ name: "Legal", definition: "Legal" }], columns: ["text"], labelColumn: "prediction", status: "ready" };
  const calls: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname);
    if (url.pathname.endsWith("/create-dashboard")) {
      expect(route.request().postData()).toContain('name="dataset"');
      await route.fulfill({ json: { success: true, taskId, task } });
    } else if (url.pathname.endsWith(`/getTask/${taskId}`)) await route.fulfill({ json: { task } });
    else if (url.pathname.endsWith(`/data-analysis/${taskId}`)) await route.fulfill({ json: {
      success: true, status: "ready", source: "d_all", predictionStatus: "ready",
      overview: { totalEntries: 1, uniqueIds: 1, averageEntriesPerId: 1, missingIds: 0 },
      distribution: [{ label: "Legal", count: 1, proportion: 1 }], overTime: [{ period: "2026-01", total: 1, counts: { Legal: 1 }, proportions: { Legal: 1 } }],
      hasTimestamp: true, classifiedCount: 1, multiLabelCount: 0, unclassifiedCount: 0, datedClassifiedCount: 1,
      ids: [{ id: "A", activityCount: 12, labelCounts: { Legal: 12 }, lastActivity: "2026-01-01T00:00:00Z" }], totalIds: 1, page: 1, pageSize: 25,
    } });
    else if (url.pathname.endsWith(`/data-analysis/${taskId}/id/A`)) await route.fulfill({ json: { success: true, records: Array.from({ length: 12 }, (_, index) => ({ id: "A", timestamp: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`, text: `Case note ${index + 1}: ${"Detailed narrative for the case. ".repeat(12)} END OF FULL NOTE.`, labels: ["Legal"] })) } });
    else await route.fulfill({ json: { success: true, tasks: [task], annotations: [] } });
  });
  await page.goto("/new-dashboard");
  await expect(page.getByText("Unlabeled dataset")).toHaveCount(0);
  await expect(page.getByText("Model", { exact: true })).toHaveCount(0);
  await page.getByText("Enter details", { exact: true }).click();
  await page.getByLabel("Task Name").fill("Pilot");
  await page.getByLabel("Description").fill("Pilot analysis");
  await page.locator("#labels-json").setInputFiles({ name: "labels.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ labels: [{ name: "Legal", definition: "Legal" }] })) });
  await page.locator("#validation-dataset").setInputFiles({ name: "data.csv", mimeType: "text/csv", buffer: Buffer.from("id,date,text,prediction\nA,2026-01-01,Example,Legal\n") });
  await expect(page.getByLabel("Prediction label column")).toBeVisible();
  const textBox = await page.getByLabel("Text column name").boundingBox();
  const predictionBox = await page.getByLabel("Prediction label column").boundingBox();
  expect(predictionBox!.x).toBe(textBox!.x);
  await page.getByLabel("Text column name").fill("text");
  await page.getByLabel("Prediction label column").fill("prediction");
  await page.getByRole("button", { name: "Create dashboard", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${taskId}`));
  await expect(page.getByText("Full Dataset Overview")).toBeVisible();
  await expect(page.getByText("Session Details", { exact: true })).toHaveCount(0);
  const aggregate = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF report" }).click();
  const aggregateFile = await aggregate;
  expect(aggregateFile.suggestedFilename()).toContain("analysis.pdf");
  await aggregateFile.saveAs(testInfo.outputPath("aggregate.pdf"));
  expect((await readFile(testInfo.outputPath("aggregate.pdf"))).toString("latin1")).not.toMatch(/\/Subtype\s*\/Image/);
  await page.getByRole("button", { name: "View", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const exportButton = dialog.getByRole("button", { name: "Download PDF report" });
  await expect(exportButton).toBeInViewport();
  await expect(dialog.getByText("ID", { exact: true })).toBeVisible();
  await expect(dialog.getByText("User ID", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Total Records")).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  const exportBox = await exportButton.boundingBox();
  expect(dialogBox!.y + dialogBox!.height - (exportBox!.y + exportBox!.height)).toBeLessThan(30);
  await dialog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(exportButton).toBeInViewport();
  const detail = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Download PDF report" }).click();
  const detailFile = await detail;
  expect(detailFile.suggestedFilename()).toBe("data-analysis-A.pdf");
  await detailFile.saveAs(testInfo.outputPath("individual.pdf"));
  const individualPdf = (await readFile(testInfo.outputPath("individual.pdf"))).toString("latin1");
  expect(individualPdf).not.toMatch(/\/Subtype\s*\/Image/);
  expect(individualPdf).toMatch(/\/F2 10 Tf[\s\S]{0,180}\(January 12, 2026 \| Legal\)/);
  expect(individualPdf).toContain("Timeline - all records");
  await page.reload();
  await expect(page.getByText("Full Dataset Overview")).toBeVisible();
  expect(calls.some((path) => /sampling|evaluation|annotations|inference/.test(path))).toBe(false);
});
