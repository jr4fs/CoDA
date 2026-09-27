import { describe, expect, it } from "vitest";

import type { NormalizedRecord } from "../../types/dashboard";
import {
  getDatasetOverview,
  getIdSummaries,
  getLabelDistribution,
  getLabelDistributionOverTime,
} from "./dashboardMetrics";
import { normalizeDataset } from "./normalizeDataset";

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

  it("uses row indexes for ids and omits invalid timestamps", () => {
    const [normalized] = normalizeDataset([{ body: "Example", date: "not-a-date" }], {
      textColumn: "body",
      timestampColumn: "date",
    });

    expect(normalized).toMatchObject({ id: "0", text: "Example" });
    expect(normalized.timestamp).toBeUndefined();
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
