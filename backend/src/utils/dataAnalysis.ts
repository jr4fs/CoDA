import { createReadStream } from "fs";
import fs from "fs/promises";
import Papa from "papaparse";
import type { AnalysisId, AnalysisPeriod, AnalysisRecord, DataAnalysisResponse } from "@common/types/dataAnalysis";

interface MonthCount {
  total: number;
  counts: Record<string, number>;
}

export interface AnalysisSnapshot {
  totalEntries: number;
  missingIds: number;
  classifiedCount: number;
  multiLabelCount: number;
  datedClassifiedCount: number;
  nonemptyDates: number;
  validDates: number;
  labels: Record<string, number>;
  months: Map<string, MonthCount>;
  ids: Map<string, AnalysisId>;
  columns: { text: string; id?: string; date?: string };
}

const cache = new Map<string, Promise<AnalysisSnapshot>>();
const canonical = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

export function parsePredictedLabels(row: Record<string, string>, knownLabels: string[]): string[] {
  const known = new Map(knownLabels.map((name) => [canonical(name), name]));
  let values: string[] = [];
  if (row.generated_labels_json) {
    try {
      const parsed: unknown = JSON.parse(row.generated_labels_json);
      if (Array.isArray(parsed)) values = parsed.filter((value): value is string => typeof value === "string");
    } catch { /* Older outputs only have generated_label. */ }
  }
  if (!values.length && row.generated_label && row.generated_label !== "ERROR")
    values = row.generated_label.split("|");
  return [...new Set(values.map((value) => known.get(canonical(value))).filter((value): value is string => Boolean(value)))];
}

export function detectColumns(headers: string[], textColumn: string) {
  const id = headers.find((header) => /(^| )(id|identifier|case number|case no|record id|participant id|client id|patient id|youth id)( |$)/.test(canonical(header)));
  const date = headers.find((header) => /(^| )(date|timestamp|time|created at|updated at|event date|entry date)( |$)/.test(canonical(header)));
  const text = headers.includes(textColumn) ? textColumn : headers.find((header) => header !== id && header !== date && header !== "generated_label" && header !== "generated_labels_json") ?? "";
  return { text, id, date };
}

export function parseDate(value: string): Date | undefined {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(input);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (!iso && !us) return undefined;
  const year = Number(iso?.[1] ?? us?.[3]);
  const month = Number(iso?.[2] ?? us?.[1]);
  const day = Number(iso?.[3] ?? us?.[2]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return undefined;
  const parsed = iso && input.length > 10 ? new Date(input) : calendar;
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function streamCsv(filePath: string, visit: (row: Record<string, string>) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const source = createReadStream(filePath);
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true }) as NodeJS.ReadWriteStream & { destroy(error?: Error): void };
    source.on("error", reject);
    parser.on("error", reject);
    parser.on("data", (row: Record<string, string>) => {
      try { visit(row); } catch (error) { source.destroy(); parser.destroy(error as Error); }
    });
    parser.on("end", resolve);
    source.pipe(parser);
  });
}

async function analyze(filePath: string, knownLabels: string[], textColumn: string, predicted: boolean): Promise<AnalysisSnapshot> {
  const snapshot: AnalysisSnapshot = {
    totalEntries: 0, missingIds: 0, classifiedCount: 0, multiLabelCount: 0,
    datedClassifiedCount: 0, nonemptyDates: 0, validDates: 0,
    labels: {}, months: new Map(), ids: new Map(), columns: { text: textColumn },
  };
  await streamCsv(filePath, (row) => {
    if (snapshot.totalEntries === 0) snapshot.columns = detectColumns(Object.keys(row), textColumn);
    snapshot.totalEntries++;
    const { id: idColumn, date: dateColumn } = snapshot.columns;
    const id = idColumn ? String(row[idColumn] ?? "").trim() : "";
    const dateValue = dateColumn ? String(row[dateColumn] ?? "") : "";
    if (dateValue.trim()) snapshot.nonemptyDates++;
    const date = parseDate(dateValue);
    if (date) snapshot.validDates++;
    const labels = predicted ? parsePredictedLabels(row, knownLabels) : [];
    if (labels.length) {
      snapshot.classifiedCount++;
      if (labels.length > 1) snapshot.multiLabelCount++;
      for (const label of labels) snapshot.labels[label] = (snapshot.labels[label] ?? 0) + 1;
      if (date) {
        snapshot.datedClassifiedCount++;
        const month = date.toISOString().slice(0, 7);
        const bucket = snapshot.months.get(month) ?? { total: 0, counts: {} };
        bucket.total++;
        for (const label of labels) bucket.counts[label] = (bucket.counts[label] ?? 0) + 1;
        snapshot.months.set(month, bucket);
      }
    }
    if (!id) {
      snapshot.missingIds++;
      return;
    }
    const summary = snapshot.ids.get(id) ?? { id, activityCount: 0, labelCounts: {} };
    summary.activityCount++;
    for (const label of labels) summary.labelCounts[label] = (summary.labelCounts[label] ?? 0) + 1;
    if (date && (!summary.lastActivity || date.toISOString() > summary.lastActivity))
      summary.lastActivity = date.toISOString();
    snapshot.ids.set(id, summary);
  });
  return snapshot;
}

export async function loadAnalysis(filePath: string, labels: string[], textColumn: string, predicted: boolean) {
  const stat = await fs.stat(filePath);
  const key = JSON.stringify([filePath, stat.size, stat.mtimeMs, labels, textColumn, predicted]);
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = analyze(filePath, labels, textColumn, predicted);
  cache.set(key, pending);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  pending.catch(() => cache.delete(key));
  return pending;
}

function periods(snapshot: AnalysisSnapshot): AnalysisPeriod[] {
  const months = [...snapshot.months.keys()].sort();
  if (!months.length) return [];
  const [firstYear, firstMonth] = months[0].split("-").map(Number);
  const [lastYear, lastMonth] = months[months.length - 1].split("-").map(Number);
  const span = (lastYear - firstYear) * 12 + lastMonth - firstMonth + 1;
  const granularity = span <= 18 ? "month" : span <= 54 ? "quarter" : "year";
  const grouped = new Map<string, MonthCount>();
  for (const [month, value] of snapshot.months) {
    const year = month.slice(0, 4);
    const period = granularity === "month" ? month : granularity === "quarter" ? `${year}-Q${Math.ceil(Number(month.slice(5)) / 3)}` : year;
    const bucket = grouped.get(period) ?? { total: 0, counts: {} };
    bucket.total += value.total;
    for (const [label, count] of Object.entries(value.counts)) bucket.counts[label] = (bucket.counts[label] ?? 0) + count;
    grouped.set(period, bucket);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({
    period, total: value.total, counts: value.counts,
    proportions: Object.fromEntries(Object.entries(value.counts).map(([label, count]) => [label, count / value.total])),
  }));
}

export function summarizeAnalysis(raw: AnalysisSnapshot, predicted: AnalysisSnapshot | null, options: { search?: string; sort?: string; label?: string; page?: number; pageSize?: number } = {}): DataAnalysisResponse {
  const current = predicted ?? raw;
  const page = Math.max(1, Math.floor(options.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize || 25)));
  const search = (options.search ?? "").trim().toLowerCase();
  const prevalence = options.label && predicted ? (predicted.labels[options.label] ?? 0) / Math.max(1, predicted.classifiedCount) : 0;
  const ids = [...current.ids.values()]
    .filter((item) => !search || item.id.toLowerCase().includes(search))
    .filter((item) => !options.label || (item.labelCounts[options.label] ?? 0) / item.activityCount > prevalence)
    .sort((a, b) => options.sort === "id" ? a.id.localeCompare(b.id, undefined, { numeric: true }) : options.sort === "notes" ? b.activityCount - a.activityCount : options.sort === "oldest" ? (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "") : (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  const hasTimestamp = current.nonemptyDates > 0 && current.validDates / current.nonemptyDates >= 0.8;
  return {
    success: true, status: "ready", source: "d_all", predictionStatus: predicted ? "ready" : "pending",
    overview: { totalEntries: raw.totalEntries, uniqueIds: raw.ids.size, averageEntriesPerId: raw.ids.size ? (raw.totalEntries - raw.missingIds) / raw.ids.size : 0, missingIds: raw.missingIds },
    distribution: predicted ? Object.entries(predicted.labels).map(([label, count]) => ({ label, count, proportion: count / Math.max(1, predicted.classifiedCount) })).sort((a, b) => b.count - a.count) : [],
    overTime: predicted && hasTimestamp ? periods(predicted) : [], hasTimestamp,
    classifiedCount: predicted?.classifiedCount ?? 0, multiLabelCount: predicted?.multiLabelCount ?? 0,
    unclassifiedCount: predicted ? raw.totalEntries - predicted.classifiedCount : 0,
    datedClassifiedCount: predicted?.datedClassifiedCount ?? 0,
    ids: ids.slice((page - 1) * pageSize, page * pageSize), totalIds: ids.length, page, pageSize,
  };
}

export async function loadAnalysisRecords(filePath: string, columns: AnalysisSnapshot["columns"], id: string, knownLabels: string[], predicted: boolean): Promise<AnalysisRecord[]> {
  const records: AnalysisRecord[] = [];
  if (!columns.id) return records;
  await streamCsv(filePath, (row) => {
    if (String(row[columns.id!] ?? "").trim() !== id) return;
    const date = columns.date ? parseDate(String(row[columns.date] ?? "")) : undefined;
    records.push({ id, text: String(row[columns.text] ?? ""), labels: predicted ? parsePredictedLabels(row, knownLabels) : [], ...(date ? { timestamp: date.toISOString() } : {}) });
  });
  return records;
}
