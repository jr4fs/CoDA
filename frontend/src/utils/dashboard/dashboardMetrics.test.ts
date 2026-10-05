import { describe, expect, it } from "vitest";

import type { NormalizedRecord } from "../../types/dashboard";
import {
  getDatasetOverview,
  getIdSummaries,
  getLabelDistribution,
  getLabelDistributionOverTime,
} from "./dashboardMetrics";
import { countMultiLabelRows, detectDatasetColumns, normalizeDataset } from "./normalizeDataset";

const record = (
  id: string,
  label?: string,
  timestamp?: string,
): NormalizedRecord => ({
  id,
  label,
  timestamp: timestamp ? new Date(timestamp) : undefined,
  text: `${id} text`,
  raw: {},
});

describe("normalizeDataset", () => {
  it("maps configured columns and parses valid timestamps", () => {
    const rows = [{ case: 42, body: "Example", class: "positive", date: "2026-01-02T00:00:00Z" }];
    const [normalized] = normalizeDataset(rows, {
      idColumn: "case",
      textColumn: "body",
      labelColumn: "class",
      timestampColumn: "date",
    });

    expect(normalized).toMatchObject({ id: "42", text: "Example", label: "positive", raw: rows[0] });
    expect(normalized.timestamp?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("leaves missing IDs blank and omits invalid timestamps", () => {
    const [normalized] = normalizeDataset([{ body: "Example", date: "not-a-date" }], {
      textColumn: "body",
      timestampColumn: "date",
    });

    expect(normalized).toMatchObject({ id: "", text: "Example" });
    expect(normalized.timestamp).toBeUndefined();
  });

  it("detects the attached Youth ID and Date columns", () => {
    const columns = detectDatasetColumns([
      { "Youth ID": "Y-1", Date: "1/2/2026", Notes_anonymized: " Text ", generated_label: "neither" },
    ]);
    expect(columns).toEqual({
      textColumn: "Notes_anonymized",
      labelColumn: "generated_label",
      idColumn: "Youth ID",
      timestampColumn: "Date",
    });
  });

  it("recognizes the evaluation upload's taskLabel fallback and flags multi-label rows", () => {
    const rows = [{ text: "A", taskLabel: "positive, negative" }, { text: "B", taskLabel: "neutral" }];
    expect(detectDatasetColumns(rows)?.labelColumn).toBe("taskLabel");
    expect(countMultiLabelRows(rows, "taskLabel")).toBe(1);
  });

  it("trims mapped values, preserves raw data, and keeps missing configured IDs blank", () => {
    const row = { id: "  ", body: " Example ", label: " health referral ", date: "1/2/2026" };
    const [normalized] = normalizeDataset([row], {
      idColumn: "id", textColumn: "body", labelColumn: "label", timestampColumn: "date",
    });
    expect(normalized).toMatchObject({ id: "", text: "Example", label: "health referral", raw: row });
    expect(normalized.timestamp?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("does not infer arbitrary numeric dates or invalid calendar dates", () => {
    const normalized = normalizeDataset([
      { body: "a", date: "45292" },
      { body: "b", date: "2/30/2026" },
      { body: "c", date: "2026-02-30" },
    ], { textColumn: "body", timestampColumn: "date" });
    expect(normalized.map((row) => row.timestamp)).toEqual([undefined, undefined, undefined]);
  });

  it("requires at least 80 percent valid dates before choosing a timestamp column", () => {
    expect(detectDatasetColumns([
      { id: "a", date: "2026-01-02", note: "A" },
      { id: "b", date: "not a date", note: "B" },
    ])?.timestampColumn).toBeUndefined();
  });
});

describe("dashboard metrics", () => {
  it("calculates overview counts, average, and median entries per id", () => {
    expect(getDatasetOverview([record("a"), record("a"), record("a"), record("b")])).toEqual({
      totalEntries: 4,
      uniqueIds: 2,
      averageEntriesPerId: 2,
      medianEntriesPerId: 2,
    });
    expect(getDatasetOverview([])).toEqual({
      totalEntries: 0,
      uniqueIds: 0,
      averageEntriesPerId: 0,
      medianEntriesPerId: 0,
    });
  });

  it("counts total rows but excludes blank IDs from ID overview statistics", () => {
    expect(getDatasetOverview([record("a"), record(""), record(" "), record("a")])).toEqual({
      totalEntries: 4,
      uniqueIds: 1,
      averageEntriesPerId: 2,
      medianEntriesPerId: 2,
    });
  });

  it("sorts label counts and calculates proportions from labeled rows only", () => {
    expect(getLabelDistribution([
      record("1", "positive"),
      record("2", "negative"),
      record("3", "positive"),
      record("4"),
    ])).toEqual([
      { label: "positive", count: 2, proportion: 2 / 3 },
      { label: "negative", count: 1, proportion: 1 / 3 },
    ]);
  });

  it("chooses monthly, quarterly, and yearly UTC intervals", () => {
    const monthly = getLabelDistributionOverTime([
      record("1", "positive", "2026-01-01"),
      record("2", "negative", "2026-02-01"),
    ]);
    const quarterly = getLabelDistributionOverTime([
      record("1", "positive", "2026-01-01"),
      record("2", "positive", "2026-12-01"),
    ], { maxIntervals: 4 });
    const yearly = getLabelDistributionOverTime([
      record("1", "positive", "2020-01-01"),
      record("2", "negative", "2025-01-01"),
    ], { maxIntervals: 4 });

    expect(monthly.map(({ period }) => period)).toEqual(["2026-01", "2026-02"]);
    expect(quarterly.map(({ period }) => period)).toEqual(["2026-Q1", "2026-Q4"]);
    expect(yearly.map(({ period }) => period)).toEqual(["2020", "2025"]);
  });

  it("calculates time-bucket counts and proportions from dated, labeled rows", () => {
    const [january] = getLabelDistributionOverTime([
      record("1", "health referral", "2026-01-01"),
      record("2", "health referral", "2026-01-12"),
      record("3", "neither", "2026-01-20"),
      record("4", "health discussion"),
      record("5", undefined, "2026-01-25"),
    ]);

    expect(january).toEqual({
      period: "2026-01",
      total: 3,
      counts: { "health referral": 2, neither: 1 },
      proportions: { "health referral": 2 / 3, neither: 1 / 3 },
    });
  });

  it("summarizes each id and sorts by its latest activity", () => {
    const summaries = getIdSummaries([
      record("a", "positive", "2026-01-01"),
      record("a", "negative", "2026-02-01"),
      record("b", "positive", "2026-03-01"),
    ]);

    expect(summaries.map(({ id }) => id)).toEqual(["b", "a"]);
    expect(summaries[1]).toMatchObject({
      id: "a",
      activityCount: 2,
      labelCounts: { positive: 1, negative: 1 },
    });
  });
});
