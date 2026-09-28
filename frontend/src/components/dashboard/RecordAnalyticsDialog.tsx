import { ArrowUpDown, Download, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { NormalizedRecord } from "@/types/dashboard";
import type { IdSummary } from "@/utils/dashboard/dashboardMetrics";
import { downloadContent } from "@/utils/downloadContent";

export interface AnalysisLabel {
  key: string;
  label: string;
  color: string;
}
interface Props {
  open: boolean;
  summary: IdSummary | null;
  records: NormalizedRecord[];
  labels: AnalysisLabel[];
  previousId?: string;
  nextId?: string;
  onSelectId: (id: string) => void;
  onOpenChange: (open: boolean) => void;
}
interface ActivityPoint {
  date: number;
  occurredAt: number;
  row: number;
  recordIndex: number;
  labelKey: string;
  label: string;
  count: number;
}

export default function RecordAnalyticsDialog({ open, summary, records, labels, previousId, nextId, onSelectId, onOpenChange }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    setSort("newest");
    setFilter("all");
    setExpanded(null);
  }, [summary?.id]);

  useEffect(() => setExpanded(null), [filter, sort]);

  const dated = useMemo(() => records.filter((record) => record.timestamp), [records]);
  const first = dated.reduce<Date | undefined>(
    (value, record) => !value || record.timestamp! < value ? record.timestamp : value,
    undefined,
  );
  const latest = summary?.lastActivity;
  const visible = useMemo(
    () => records
      .filter((record) => filter === "all" || record.label === filter)
      .sort((a, b) => {
        const delta = (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0);
        return sort === "newest" ? -delta : delta;
      }),
    [filter, records, sort],
  );
  const chartData: ActivityPoint[] = dated.flatMap((record, recordIndex) => {
    const labelIndex = labels.findIndex((label) => label.key === record.label);
    if (labelIndex < 0) return [];
    const date = record.timestamp!.getTime();
    return [{
      date, occurredAt: date, row: labels.length - labelIndex - 1, recordIndex,
      labelKey: labels[labelIndex].key, label: labels[labelIndex].label, count: 1,
    }];
  });
  const visibleChartData = filter === "all" ? chartData : chartData.filter((point) => point.labelKey === filter);
  const plottedDates = visibleChartData.map((point) => point.date);
  const dateDomain = getDateDomain(plottedDates);
  const activityTicks = getEvenDateTicks(dateDomain, 9);
  const dateTicks = activityTicks.filter((_, index) => index % 2 === 0);
  const plottedData = bucketActivityPoints(visibleChartData, activityTicks);
  const chartConfig = Object.fromEntries(
    labels.map((label) => [label.key, { label: label.label, color: label.color }]),
  ) satisfies ChartConfig;

  if (!summary) return null;
  const reveal = (recordIndex: number) => {
    const index = visible.indexOf(dated[recordIndex]);
    if (index < 0) return;
    setExpanded(index);
    requestAnimationFrame(() =>
      document.getElementById(`analysis-note-${summary.id}-${index}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      }),
    );
  };
  const exportRows = () => {
    const lines = [
      "id,timestamp,label,text",
      ...records.map((record) =>
        [record.id, record.timestamp?.toISOString() ?? "", record.label ?? "", record.text]
          .map(csvEscape)
          .join(","),
      ),
    ];
    downloadContent(`data-analysis-${safeFilename(summary.id)}.csv`, lines.join("\n"), "text/csv");
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="record-analytics-title"
      className="m-auto max-h-[92dvh] w-[min(772px,calc(100vw-24px))] overflow-y-auto rounded-[14px] border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-[#101820]/25"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
    >
      <div className="grid gap-3 p-4 sm:p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">User ID</p>
            <h2 id="record-analytics-title" className="mt-0.5 text-xl font-semibold leading-6 tabular-nums">{summary.id}</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {summary.activityCount.toLocaleString()} notes{first && latest ? ` · ${monthYear(first)} – ${monthYear(latest)}` : " · Dates unavailable"}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" disabled={!previousId} className={buttonClass} onClick={() => previousId && onSelectId(previousId)}>
              ← Previous ID
            </button>
            <button type="button" disabled={!nextId} className={buttonClass} onClick={() => nextId && onSelectId(nextId)}>
              Next ID →
            </button>
            <button
              type="button"
              aria-label="Close record analytics"
              className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <section className={insetClass}>
            <h3 className={titleClass}>Label Distribution</h3>
            <LabelStrip counts={summary.labelCounts} labels={labels} total={summary.activityCount} />
            <dl className="grid gap-2">
              {labels.map((label) => (
                <div key={label.key} className="flex items-center justify-between gap-4 text-xs">
                  <dt className="flex items-center gap-1.5 text-[#666]">
                    <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                    {label.label}
                  </dt>
                  <dd className="font-semibold tabular-nums">{(summary.labelCounts[label.key] ?? 0).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className={insetClass}>
            <h3 className={titleClass}>Key Details</h3>
            <dl className="mt-auto grid gap-2 text-xs">
              <Detail label="Total Notes" value={summary.activityCount.toLocaleString()} />
              <Detail label="First Note" value={formatDate(first)} />
              <Detail label="Latest Note" value={formatDate(latest)} />
              <Detail label="Active Span" value={activeSpan(first, latest)} />
            </dl>
          </section>
        </div>

        <section className={insetClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className={titleClass}>Activity Over Time</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Click a point to learn more about a note.</p>
            </div>
            <Legend labels={labels} />
          </div>
          {plottedData.length ? (
            <ChartContainer config={chartConfig} className="mt-3 h-[160px] w-full aspect-auto" aria-label={`Activity timeline for record ${summary.id}`}>
              <ScatterChart accessibilityLayer margin={{ top: 8, right: 12, left: 0, bottom: 6 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4" />
                {activityTicks.map((tick) => (
                  <ReferenceLine key={tick} x={tick} stroke="var(--chart-grid)" strokeDasharray="2 4" />
                ))}
                <XAxis type="number" dataKey="date" domain={dateDomain} scale="time" ticks={dateTicks}
                  axisLine={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} tickLine tickMargin={8} minTickGap={18}
                  tick={{ fill: "var(--chart-axis)", fontSize: 9 }} tickFormatter={(value) => chartDate(new Date(value))} />
                <YAxis type="number" dataKey="row" domain={[-0.5, labels.length - 0.5]}
                  ticks={labels.map((_, index) => index)} interval={0} allowDecimals={false} width={104}
                  axisLine={false} tickLine={false}
                  tickMargin={10} tick={(props) => <CategoryTick {...props} labels={labels} />} />
                <ZAxis range={[100, 100]} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      labelFormatter={(_, payload) => {
                        const point = payload?.[0]?.payload;
                        if (!point) return "Activity";
                        const noteCount = point.count > 1 ? ` · ${point.count} notes` : "";
                        return `${point.label} · ${formatDate(new Date(point.date))}${noteCount}`;
                      }}
                      formatter={() => null}
                    />
                  }
                />
                {labels.map((label) => (
                  <Scatter
                    key={label.key}
                    data={plottedData.filter((point) => point.labelKey === label.key)}
                    fill={label.color}
                    shape={markerShape(label.key)}
                    onClick={(point) => reveal(point.payload.recordIndex)}
                  />
                ))}
              </ScatterChart>
            </ChartContainer>
          ) : (
            <p className="grid h-[160px] place-items-center text-xs text-muted-foreground">
              No valid activity dates are available for this record.
            </p>
          )}
        </section>

        <section className="pt-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1">
              <h3 className="mr-12 text-base font-bold leading-5 text-[#1e2939]">Timeline</h3>
              {labels.map((label) => (
                <button key={label.key} type="button" aria-pressed={filter === label.key}
                  className="h-8 rounded-md !border !border-solid !border-[#ccc] bg-card px-2.5 !text-[10px] font-medium text-[#666] hover:bg-muted aria-pressed:!border-primary aria-pressed:bg-muted aria-pressed:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setFilter((current) => current === label.key ? "all" : label.key)}>
                  {label.label} ({summary.labelCounts[label.key] ?? 0})
                </button>
              ))}
            </div>
            <label className="relative inline-flex h-8 w-[96px] shrink-0 items-center gap-1 rounded-md !border !border-solid !border-[#e1e1e1] bg-card px-4 text-[#666] focus-within:ring-2 focus-within:ring-ring">
              <span className="sr-only">Sort timeline</span>
              <ArrowUpDown className="size-3 shrink-0" />
              <span className="!text-[10px] font-medium">Sort By</span>
              <select className="absolute inset-0 size-full cursor-pointer opacity-0" value={sort} onChange={(event) => setSort(event.target.value as "newest" | "oldest")}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
          {visible.length ? (
            <ol className="mt-4 grid">
              {visible.map((record, index) => {
                const label = labels.find((item) => item.key === record.label);
                const isExpanded = expanded === index;

                return (
                  <li id={`analysis-note-${summary.id}-${index}`} key={`${record.timestamp?.toISOString() ?? "undated"}-${index}`}
                    className="grid gap-3 border-b border-[#f0f1f3] py-4 last:border-b-0 sm:grid-cols-[148px_1fr]">
                    <time className="text-[13px] font-medium leading-5 tabular-nums">{formatDate(record.timestamp)}</time>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold leading-5" style={{ color: label?.color ?? "var(--muted-foreground)" }}>
                        <span className="size-2 rounded-full bg-current" />
                        {label?.label ?? "Label unavailable"}
                      </p>
                      <p className={`mt-1 pl-3.5 text-[13px] leading-5 text-[#666] ${isExpanded ? "" : "line-clamp-3"}`}>
                        {record.text || "No note text is available."}
                      </p>
                      {record.text.length > 150 && (
                        <button type="button"
                          className="mt-1 min-h-6 pl-3.5 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline"
                          onClick={() => setExpanded(isExpanded ? null : index)}>
                          {isExpanded ? "Show less ↑" : "View full note ↓"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">No notes match this label filter.</p>
          )}
        </section>
        <footer className="flex justify-end">
          <button type="button"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={exportRows}>
            Export <Download className="size-3.5" />
          </button>
        </footer>
      </div>
    </dialog>
  );
}

function LabelStrip({ counts, labels, total }: { counts: Record<string, number>; labels: AnalysisLabel[]; total: number }) {
  return (
    <div className="flex h-[15px] w-full overflow-hidden rounded-sm bg-muted">
      {labels.map((label) => {
        const value = total ? (counts[label.key] ?? 0) / total : 0;
        return (
          <span
            key={label.key}
            className="grid min-w-0 place-items-center overflow-hidden text-[8px] text-white tabular-nums"
            style={{ width: `${value * 100}%`, backgroundColor: label.color }}
          >
            {value >= 0.12 ? `${Math.round(value * 100)}%` : null}
          </span>
        );
      })}
    </div>
  );
}
function Legend({ labels }: { labels: AnalysisLabel[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
      {labels.map((label) => (
        <li key={label.key} className="flex items-center gap-1" style={{ color: label.color }}>
          <span className={`size-1.5 bg-current ${markerClass(label.key)}`} />
          {label.label}
        </li>
      ))}
    </ul>
  );
}

function CategoryTick({ x = 0, y = 0, payload, labels }: {
  x?: string | number;
  y?: string | number;
  payload?: { value: number };
  labels: AnalysisLabel[];
}) {
  const label = payload ? labels[labels.length - payload.value - 1]?.label : "";
  return (
    <text x={Number(x)} y={Number(y)} dy="0.35em" textAnchor="end" fill="var(--foreground)" fontSize={10}>
      {label}
    </text>
  );
}

function markerShape(label: string): "square" | "circle" | "triangle" {
  const key = label.trim().toLowerCase();
  if (key === "health referral") return "square";
  if (key === "neither") return "triangle";
  return "circle";
}

function markerClass(label: string) {
  const shape = markerShape(label);
  if (shape === "circle") return "rounded-full";
  if (shape === "triangle") return "[clip-path:polygon(50%_0,100%_100%,0_100%)]";
  return "rounded-[1px]";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#666]">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
function formatDate(date?: Date) { return date ? dateFormatter.format(date) : "Unavailable"; }
const chartDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function chartDate(date: Date) { return chartDateFormatter.format(date); }
function getDateDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum ? [minimum - 86_400_000, maximum + 86_400_000] : [minimum, maximum];
}
function getEvenDateTicks([minimum, maximum]: [number, number], count = 4) {
  const interval = (maximum - minimum) / (count - 1);
  return Array.from({ length: count }, (_, index) => minimum + interval * index);
}
function bucketActivityPoints(points: ActivityPoint[], ticks: number[]) {
  if (!points.length || !ticks.length) return [];
  const interval = ticks.length > 1 ? ticks[1] - ticks[0] : 0;
  const grouped = new Map<string, ActivityPoint>();

  for (const point of points) {
    const slot = interval
      ? Math.min(ticks.length - 1, Math.max(0, Math.round((point.date - ticks[0]) / interval)))
      : 0;
    const key = `${slot}:${point.labelKey}`;
    const current = grouped.get(key);
    const count = (current?.count ?? 0) + 1;
    const representative = !current || point.occurredAt > current.occurredAt ? point : current;
    grouped.set(key, { ...representative, date: ticks[slot], count });
  }

  return [...grouped.values()];
}
function monthYear(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
function activeSpan(first?: Date, latest?: Date) {
  if (!first || !latest) return "Unavailable";
  const months = Math.max(
    0,
    (latest.getUTCFullYear() - first.getUTCFullYear()) * 12 + latest.getUTCMonth() - first.getUTCMonth(),
  );
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [
    years ? `${years} ${years === 1 ? "year" : "years"}` : "",
    rest ? `${rest} ${rest === 1 ? "month" : "months"}` : "",
  ].filter(Boolean).join(", ") || "Less than one month";
}
function csvEscape(value: string) {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}
function safeFilename(value: string) { return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "record"; }

const insetClass = "flex min-h-[146px] flex-col gap-3 rounded-md border border-[#f0f1f3] bg-card p-4";
const titleClass = "text-sm font-semibold text-[#1e2939]";
const buttonClass = "h-9 rounded-md !border !border-solid !border-[#ccc] bg-card px-3 !text-[12px] font-medium text-[#666] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";
