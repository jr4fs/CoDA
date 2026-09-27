import type { NormalizedRecord } from "../../types/dashboard";

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

type TimeAggregation = "month" | "quarter" | "year";
type DatedLabeledRecord = NormalizedRecord & { label: string; timestamp: Date };

export function getDatasetOverview(records: NormalizedRecord[]): DatasetOverview {
  const entriesById = new Map<string, number>();
  for (const { id } of records) entriesById.set(id, (entriesById.get(id) ?? 0) + 1);

  const counts = [...entriesById.values()];
  return {
    totalEntries: records.length,
    uniqueIds: entriesById.size,
    averageEntriesPerId: counts.length ? records.length / counts.length : 0,
    medianEntriesPerId: getMedian(counts),
  };
}

export function getLabelDistribution(records: NormalizedRecord[]): LabelDistributionItem[] {
  const counts = new Map<string, number>();
  for (const { label } of records) {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (!total) return [];

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, proportion: count / total }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function getLabelDistributionOverTime(
  records: NormalizedRecord[],
  { maxIntervals = 18 }: { maxIntervals?: number } = {},
): LabelDistributionOverTime[] {
  const dated = records.filter(isDatedAndLabeled);
  if (!dated.length) return [];

  const aggregation = getTimeAggregation(dated, maxIntervals);
  const periods = new Map<string, { total: number; counts: Record<string, number> }>();

  for (const { label, timestamp } of dated) {
    const period = getTimeBucket(timestamp, aggregation);
    const current = periods.get(period) ?? { total: 0, counts: {} };
    current.total += 1;
    current.counts[label] = (current.counts[label] ?? 0) + 1;
    periods.set(period, current);
  }

  return [...periods.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { total, counts }]) => ({
      period,
      total,
      counts,
      proportions: Object.fromEntries(
        Object.entries(counts).map(([label, count]) => [label, count / total]),
      ),
    }));
}

export function getIdSummaries(records: NormalizedRecord[]): IdSummary[] {
  const summaries = new Map<string, IdSummary>();

  for (const { id, label, timestamp } of records) {
    const summary = summaries.get(id) ?? { id, labelCounts: {}, activityCount: 0 };
    summary.activityCount += 1;
    if (label) summary.labelCounts[label] = (summary.labelCounts[label] ?? 0) + 1;
    if (timestamp && (!summary.lastActivity || timestamp > summary.lastActivity)) {
      summary.lastActivity = timestamp;
    }
    summaries.set(id, summary);
  }

  return [...summaries.values()].sort(
    (a, b) => (b.lastActivity?.getTime() ?? 0) - (a.lastActivity?.getTime() ?? 0),
  );
}

function isDatedAndLabeled(record: NormalizedRecord): record is DatedLabeledRecord {
  return Boolean(record.timestamp && record.label);
}

function getMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getTimeAggregation(records: DatedLabeledRecord[], maxIntervals: number): TimeAggregation {
  const timestamps = records.map(({ timestamp }) => timestamp.getTime()).sort((a, b) => a - b);
  const earliest = new Date(timestamps[0]);
  const latest = new Date(timestamps.at(-1)!);
  const months =
    (latest.getUTCFullYear() - earliest.getUTCFullYear()) * 12 +
    latest.getUTCMonth() -
    earliest.getUTCMonth() +
    1;

  if (months <= maxIntervals) return "month";
  if (months <= maxIntervals * 3) return "quarter";
  return "year";
}

function getTimeBucket(timestamp: Date, aggregation: TimeAggregation): string {
  const year = timestamp.getUTCFullYear();
  const month = timestamp.getUTCMonth();
  if (aggregation === "month") return `${year}-${String(month + 1).padStart(2, "0")}`;
  if (aggregation === "quarter") return `${year}-Q${Math.floor(month / 3) + 1}`;
  return String(year);
}
