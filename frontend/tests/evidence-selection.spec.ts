import { expect, test } from "@playwright/test";

const narrative = "A lawyer reviewed a legal notice. The doctor answered questions about medication.";
const taskId = "6ad6f31aedcac0b9fd5ce065";
test.use({ channel: "chrome" });

test.beforeEach(async ({ page }) => {
  const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", email: "reviewer@example.test", exp: 4102444800 })).toString("base64url");
  await page.addInitScript((token) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer", name: "Reviewer", email: "reviewer@example.test" }));
  }, `x.${payload}.x`);
  await page.route("**/api/**", async (route) => {
    if (route.request().url().endsWith(`/api/tasks/${taskId}/evaluation`)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        task: {
          _id: taskId, name: "Evidence test", description: "Identify professional interactions", type: "Multiclass",
          labels: [{ name: "Legal", definition: "Legal professional", keywords: [] }, { name: "Health", definition: "Healthcare professional", keywords: [] }],
          evaluationBuild: { phase: "collecting", batchSize: 1, targetPerLabel: 1, guideSize: 1, round: 1 },
        },
        round: { number: 1, revision: 0, status: "draft", quotas: { Legal: 1 }, records: [{
          recordId: "r0", text: narrative, sampleContent: { translated_text: narrative },
          labels: ["Legal"], spans: [{ label: "Legal", start: 2, end: 8, text: "lawyer" }], reviewed: false,
        }] },
        counts: { Legal: 0, Health: 0 }, reviewedCount: 0, remainingCount: 9, targetsMet: false, exhausted: false,
      }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, tasks: [] }) });
  });
  await page.goto(`http://127.0.0.1:15173/evaluation-builder/${taskId}`);
  await expect(page.getByRole("region", { name: "Narrative text" })).toBeVisible();
});

test("selects and saves the full narrative with keyboard select-all", async ({ page }) => {
  const region = page.getByRole("region", { name: "Narrative text" });
  await region.focus();
  await region.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await expect(page.getByText(`${narrative.length} characters selected`)).toBeVisible();
  await page.getByRole("button", { name: "Add highlight" }).click();
  await expect(page.getByLabel("Saved evidence")).toContainText(narrative);
});

test("captures a selection crossing an existing highlight and retains it while choosing a label", async ({ page }) => {
  await page.evaluate(() => {
    const region = document.querySelector('[aria-label="Narrative text"]')!;
    const range = document.createRange();
    range.setStart(region.firstChild!.firstChild!, 0);
    range.setEnd(region.lastChild!.firstChild!, region.lastChild!.textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(page.getByText(`${narrative.length} characters selected`)).toBeVisible();
  await page.getByRole("textbox", { name: "Evidence for" }).click();
  await page.getByRole("option", { name: "Legal" }).click();
  await expect(page.getByRole("button", { name: "Add highlight" })).toBeEnabled();
});

test("offers a select-all control for touch and pointer users", async ({ page }) => {
  await page.getByRole("button", { name: "Select all text" }).click();
  await expect(page.getByText(`${narrative.length} characters selected`)).toBeVisible();
});

test("clips a drag selection that ends outside the narrative", async ({ page }) => {
  await page.evaluate(() => {
    const region = document.querySelector('[aria-label="Narrative text"]')!;
    const help = document.getElementById("highlight-help")!;
    const range = document.createRange();
    range.setStart(region.firstChild!.firstChild!, 0);
    range.setEnd(help.firstChild!, help.firstChild!.textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(page.getByText(`${narrative.length} characters selected`)).toBeVisible();
});
