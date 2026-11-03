import type { NormalizedRecord } from "../../types/dashboard";

// types for dashboard results
export interface DatasetOverview {
  totalEntries: number;
  uniqueIds: number;
  averageEntriesPerId: number;
  medianEntriesPerId: number;
}

export interface LabelDistributionItem {
  label: string;
  count: number;
  proportion: number;
}

export interface LabelDistributionOverTime {
  period: string;
  total: number;
  counts: Record<string, number>;
  proportions: Record<string, number>;
}

export interface IdSummary {
  id: string;
  labelCounts: Record<string, number>;
  activityCount: number;
  lastActivity?: Date;
}

type TimeAggregation = "month" | "quarter" | "year"; // used for deciding time intervals

interface TimeAggregationOptions {
  maxIntervals?: number;
}

// dataset overview

export function getDatasetOverview(records: NormalizedRecord[]): DatasetOverview {
  const totalEntries = records.length;
  const ids = records.map((record) => record.id).filter((id) => id.trim() !== "");
  const uniqueIds = new Set(ids).size;

  const entriesPerId: Record<string, number> = {};

  for (const record of records) {
    if (record.id.trim() === "") continue;
    entriesPerId[record.id] = (entriesPerId[record.id] ?? 0) + 1;
  }

  // average and median
  const values = Object.values(entriesPerId);

  const averageEntriesPerId =
    values.length > 0
      ? values.reduce((sum, val) => sum + val, 0) / values.length
      : 0;

  const medianEntriesPerId = getMedian(values);

  return {
    totalEntries,
    uniqueIds,
    averageEntriesPerId,
    medianEntriesPerId,
  };
}

// label distribution

export function getLabelDistribution(
  records: NormalizedRecord[],
): LabelDistributionItem[] {
  const labelCounts: Record<string, number> = {};

  for (const record of records) {
    if (!record.label) {
      continue;
    }

    labelCounts[record.label] = (labelCounts[record.label] ?? 0) + 1;
  }

  const totalLabeled = Object.values(labelCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  if (totalLabeled === 0) {
    return [];
  }

  return Object.entries(labelCounts)
    .map(([label, count]) => ({
      // label counts with proportions
      label,
      count,
      proportion: count / totalLabeled,
    }))
    .sort((a, b) => b.count - a.count);
}

// label distribution over time

export function getLabelDistributionOverTime(
  records: NormalizedRecord[],
  options: TimeAggregationOptions = {},
): LabelDistributionOverTime[] {
  const maxIntervals = options.maxIntervals ?? 18; // max 18 intervals

  const datedRecords = records.filter(
    (record) => record.timestamp && record.label,
  );

  if (datedRecords.length === 0) {
    return [];
  }

  const aggregation = getTimeAggregation(datedRecords, maxIntervals); // decide intervals

  const grouped: Record<
    string,
    {
      total: number;
      counts: Record<string, number>;
    }
  > = {};

  for (const record of datedRecords) {
    const period = getTimeBucket(record.timestamp!, aggregation);

    if (!grouped[period]) {
      grouped[period] = {
        total: 0,
        counts: {},
      };
    }

    grouped[period].total += 1;

    grouped[period].counts[record.label!] =
      (grouped[period].counts[record.label!] ?? 0) + 1;
  }

  return Object.entries(grouped)
    .sort(([periodA], [periodB]) => periodA.localeCompare(periodB))
    .map(([period, data]) => {
      const proportions: Record<string, number> = {};

      for (const [label, count] of Object.entries(data.counts)) {
        proportions[label] = count / data.total;
      }

      return {
        period,
        total: data.total,
        counts: data.counts,
        proportions,
      };
    });
}

// per-id summaries

export function getIdSummaries(records: NormalizedRecord[]): IdSummary[] {
  const grouped: Record<
    string,
    {
      labelCounts: Record<string, number>;
      activityCount: number;
      lastActivity?: Date;
    }
  > = {};

  for (const record of records) {
    if (!grouped[record.id]) {
      grouped[record.id] = {
        labelCounts: {},
        activityCount: 0,
      };
    }

    const summary = grouped[record.id];

    summary.activityCount += 1;

    if (record.label) {
      summary.labelCounts[record.label] =
        (summary.labelCounts[record.label] ?? 0) + 1;
    }

    if (
      record.timestamp &&
      (!summary.lastActivity || record.timestamp > summary.lastActivity)
    ) {
      summary.lastActivity = record.timestamp;
    }
  }

  return Object.entries(grouped)
    .map(([id, summary]) => ({
      id,
      labelCounts: summary.labelCounts,
      activityCount: summary.activityCount,
      lastActivity: summary.lastActivity,
    }))
    .sort((a, b) => {
      const aTime = a.lastActivity?.getTime() ?? 0;
      const bTime = b.lastActivity?.getTime() ?? 0;

      return bTime - aTime;
    });
}

// helper functions

function getMedian(entriesPerId: number[]): number {
  if (entriesPerId.length === 0) {
    return 0;
  }

  const sorted = [...entriesPerId].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getTimeAggregation(
  records: NormalizedRecord[],
  maxIntervals: number,
): TimeAggregation {
  const timestamps = records
    .map((record) => record.timestamp!.getTime())
    .sort((a, b) => a - b);

  const earliest = new Date(timestamps[0]);
  const latest = new Date(timestamps[timestamps.length - 1]);

  const monthsSpan =
    (latest.getUTCFullYear() - earliest.getUTCFullYear()) * 12 +
    (latest.getUTCMonth() - earliest.getUTCMonth()) +
    1;

  if (monthsSpan <= maxIntervals) {
    return "month";
  }

  if (monthsSpan <= maxIntervals * 3) {
    return "quarter";
  }

  return "year";
}

function getTimeBucket(timestamp: Date, aggregation: TimeAggregation): string {
  const year = timestamp.getUTCFullYear();
  const month = timestamp.getUTCMonth();

  switch (aggregation) {
    case "month":
      return `${year}-${String(month + 1).padStart(2, "0")}`;

    case "quarter":
      return `${year}-Q${Math.floor(month / 3) + 1}`;

    case "year":
      return String(year);
  }
}
