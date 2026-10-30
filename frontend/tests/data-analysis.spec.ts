import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });
const taskId = "6ad6f31aedcac0b9fd5ce065";

for (const predictionStatus of ["pending", "ready"] as const) {
  test(`D_all dashboard with ${predictionStatus} predictions`, async ({ page }) => {
    const payload = Buffer.from(JSON.stringify({ userId: "reviewer", username: "Reviewer", email: "reviewer@example.test", exp: 4102444800 })).toString("base64url");
    await page.addInitScript((token) => {
      localStorage.setItem("accessToken", token);
      localStorage.setItem("user", JSON.stringify({ id: "reviewer", username: "Reviewer", name: "Reviewer", email: "reviewer@example.test" }));
    }, `x.${payload}.x`);
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith(`/api/tasks/getTask/${taskId}`)) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ task: {
          _id: taskId, name: "Dashboard test", description: "Find professional interactions", type: "Multiclass",
          labels: [{ name: "Legal", definition: "Legal interaction" }, { name: "Health", definition: "Health interaction" }],
          codebook: [], columns: ["translated_text"], labelColumn: "__evaluation_labels", status: "ready",
        } }) });
        return;
      }
      if (url.pathname.endsWith(`/api/tasks/data-analysis/${taskId}`)) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          success: true, status: "ready", source: "d_all", predictionStatus,
          overview: { totalEntries: 100, uniqueIds: 40, averageEntriesPerId: 2.5, missingIds: 0 },
          distribution: predictionStatus === "ready" ? [{ label: "Legal", count: 30, proportion: 0.3 }, { label: "Health", count: 20, proportion: 0.2 }] : [],
          overTime: [], hasTimestamp: false, classifiedCount: predictionStatus === "ready" ? 100 : 0,
          multiLabelCount: predictionStatus === "ready" ? 5 : 0, unclassifiedCount: 0, datedClassifiedCount: 0,
          ids: [{ id: "A", activityCount: 2, labelCounts: predictionStatus === "ready" ? { Legal: 1, Health: 1 } : {} }],
          totalIds: 40, page: 1, pageSize: 25,
        }) });
        return;
      }
      if (url.pathname.endsWith(`/api/tasks/data-analysis/${taskId}/id/A`)) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, records: [
          { id: "A", text: "A lawyer and doctor helped.", labels: predictionStatus === "ready" ? ["Legal", "Health"] : [] },
        ] }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, tasks: [], annotations: [], completed: 0, total: 0, done: true }) });
    });
    await page.goto(`http://127.0.0.1:15173/dashboard/${taskId}?tab=data-analysis`);
    await expect(page.getByText("Full Dataset Overview")).toBeVisible();
    await expect(page.getByText("100", { exact: true }).first()).toBeVisible();
    if (predictionStatus === "pending") {
      await expect(page.getByText("Run final-codebook inference over D_all to populate these charts.")).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Predicted Label Distribution" })).toBeVisible();
      await expect(page.getByText(/percentages may add to more than 100%/)).toBeVisible();
    }
    await page.screenshot({ path: `/private/tmp/data-analysis-${predictionStatus}.png`, fullPage: true });
  });
}
