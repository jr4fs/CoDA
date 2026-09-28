import type { Task } from "@common/types/tasks";
import { ArrowUpDown, Eye, ListFilter, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import RecordAnalyticsDialog, { type AnalysisLabel } from "@/components/dashboard/RecordAnalyticsDialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { getDataAnalysisData } from "@/services/tasks.service";
import type { NormalizedRecord } from "@/types/dashboard";
import {
  getDatasetOverview, getIdSummaries, getLabelDistribution, getLabelDistributionOverTime,
  type IdSummary, type LabelDistributionItem, type LabelDistributionOverTime,
} from "@/utils/dashboard/dashboardMetrics";
import { detectDatasetColumns, normalizeDataset } from "@/utils/dashboard/normalizeDataset";

type LoadState =
  | { status: "loading" }
  | { status: "pending" }
  | { status: "error" }
  | { status: "ready"; rows: Record<string, string>[] };
type SortOption = "latest" | "oldest" | "notes" | "id";
type ChartMode = "proportion" | "count";

const CARD = "rounded-[14px] border border-[#f3f4f6] bg-white p-[25px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]";
const COLORS = ["var(--chart-accepted)", "var(--chart-final)", "var(--chart-baseline)"];
const LABEL_COLORS: Record<string, string> = {
  "health referral": "var(--chart-accepted)",
  "health discussion": "var(--chart-final)",
  neither: "var(--chart-baseline)",
};

export default function DataAnalysis({ task }: { task: Task }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!task._id) return setState({ status: "error" });
    let cancelled = false;
    setState({ status: "loading" });
    void getDataAnalysisData(task._id)
      .then((result) => {
        if (cancelled) return;
        setState(result.status === "pending" ? { status: "pending" } : { status: "ready", rows: result.rows });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [task._id]);

  if (state.status === "loading") return <Status title="Loading data analysis…" loading />;
  if (state.status === "pending") return <Status title="Data analysis is not available yet." description="Run full-dataset inference after finishing the codebook to populate these charts and record histories." />;
  if (state.status === "error") return <Status title="Data analysis could not be loaded." description="The labeled dataset may be unavailable. Refresh the page or run full-dataset inference again." />;
  if (!state.rows.length) return <Status title="The labeled dataset is empty." description="No records are available to summarize." />;
  return <AnalysisView task={task} rows={state.rows} />;
}

function AnalysisView({ task, rows }: { task: Task; rows: Record<string, string>[] }) {
  const detected = useMemo(() => detectDatasetColumns(rows), [rows]);
  const labels = useMemo<AnalysisLabel[]>(
    () => task.labels.slice(0, 3).map((label, index) => ({
      key: label.name.trim(),
      label: displayLabel(label.name),
      color: LABEL_COLORS[canonical(label.name)] ?? COLORS[index] ?? "var(--chart-axis)",
    })),
    [task.labels],
  );
  const config = useMemo(() => detected ? {
    ...detected,
    textColumn: task.columns.find((column) => column in rows[0]) ?? detected.textColumn,
    labelColumn: "generated_label" in rows[0] ? "generated_label" : detected.labelColumn,
  } : undefined, [detected, rows, task.columns]);
  const records = useMemo(() => {
    if (!config) return [];
    const known = new Map(labels.map((label) => [canonical(label.key), label.key]));
    return normalizeDataset(rows, config).map((record) => ({
      ...record,
      label: record.label ? known.get(canonical(record.label)) : undefined,
    }));
  }, [config, labels, rows]);

  if (!config?.idColumn) return <Status title="An ID column could not be detected." description="This version recognizes participant, client, patient, case, youth, record, and generic ID column names." />;
  if (!config.labelColumn || !labels.length) return <Status title="Labels could not be matched." description="The output must contain generated_label values matching the task labels." />;
  return <ReadyAnalysis records={records} labels={labels} hasTimestamp={Boolean(config.timestampColumn)} />;
}

function ReadyAnalysis({ records, labels, hasTimestamp }: { records: NormalizedRecord[]; labels: AnalysisLabel[]; hasTimestamp: boolean }) {
  const [mode, setMode] = useState<ChartMode>("proportion");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("latest");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const overview = useMemo(() => getDatasetOverview(records), [records]);
  const distribution = useMemo(() => getLabelDistribution(records), [records]);
  const timeData = useMemo(() => getLabelDistributionOverTime(records), [records]);
  const summaries = useMemo(() => getIdSummaries(records), [records]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return summaries.filter((item) => item.id.trim())
      .filter((item) => !query || item.id.toLowerCase().includes(query))
      .filter((item) => filter === "all" || (item.labelCounts[filter] ?? 0) > 0)
      .sort((a, b) => compare(a, b, sort));
  }, [filter, search, sort, summaries]);
  const selectedIndex = visible.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex < 0 ? null : visible[selectedIndex];
  const missingIds = records.filter((record) => !record.id.trim()).length;
  const labeled = records.filter((record) => record.label).length;
  const timeRepresented = records.filter((record) => record.label && record.timestamp).length;

  return (
    <div className="grid gap-3">
      <section className={`${CARD} flex flex-col gap-5 md:flex-row md:items-center md:justify-between`}>
        <Heading title="Dataset Overview" description="High-level statistics from the fully labeled dataset" />
        <dl className="grid grid-cols-3 gap-5 sm:gap-8">
          <Metric label="Total Entries" value={overview.totalEntries} />
          <Metric label="Total Unique IDs" value={overview.uniqueIds} />
          <Metric label="Average Entries Per ID" value={overview.averageEntriesPerId.toFixed(2)} />
        </dl>
      </section>

      <div className="grid items-stretch gap-3 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Heading
            title="Label Distribution Over Time"
            description={`Number of entries by label at each time point · ${timeRepresented.toLocaleString()} dated entries`}
          />
          <div className="flex h-7 w-fit shrink-0 items-center rounded-lg border border-border bg-muted p-0.5" aria-label="Chart value mode">
            {(["proportion", "count"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                className="h-[22px] rounded-md px-2 !text-[10px] font-medium leading-none capitalize text-muted-foreground hover:text-foreground aria-pressed:bg-card aria-pressed:text-[#3457a0] aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setMode(value)}
              >
                {value?.replace(/\b\w/g, (char) => char.toUpperCase())}
              </button>
            ))}
          </div>
        </div>
        {hasTimestamp && timeData.length ? (
          <TimeChart data={timeData} labels={labels} mode={mode} />
        ) : (
          <ChartEmpty>No usable timestamp column was detected for time-based analysis.</ChartEmpty>
        )}
      </Card>
      <Card>
        <Heading title="Label Distribution" description={`Value counts and percentages · ${labeled.toLocaleString()} of ${records.length.toLocaleString()} recognized`} />
        {distribution.length ? (
          <OverallChart data={distribution} labels={labels} />
        ) : (
          <ChartEmpty>No recognized labels are available.</ChartEmpty>
        )}
      </Card>
    </div>

    <section className={`${CARD} p-4 sm:p-6`}>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_112px_124px]">
        <label className="relative block">
          <span className="sr-only">Search by ID</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} placeholder="Search by ID…" className={inputClass + " w-full pl-9"} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="relative">
          <span className="sr-only">Sort records</span>
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={sort} className={selectClass + " w-full pl-8"} onChange={(event) => setSort(event.target.value as SortOption)}>
            <option value="latest">Sort By</option>
            <option value="oldest">Oldest activity</option>
            <option value="notes">Most notes</option>
            <option value="id">ID number</option>
          </select>
        </label>
        <label className="relative">
          <span className="sr-only">Filter by label</span>
          <ListFilter className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={filter} className={selectClass + " w-full pl-8"} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Filter</option>
            {labels.map((label) => <option key={label.key} value={label.key}>{label.label}</option>)}
          </select>
        </label>
      </div>
      {missingIds > 0 && <p className="mt-3 text-[10px] text-muted-foreground">{missingIds.toLocaleString()} entries without an ID remain in dataset totals but not the record list.</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed text-left text-xs">
          <caption className="sr-only">Per-ID label distribution and recent activity</caption>
          <colgroup>
            <col className="w-[10%]" />
            <col />
            <col className="w-[9%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="text-[11px] font-medium text-[#404040]">
            <tr className="align-top">
              <th scope="col" className="pb-3 pr-6 font-medium">ID Number</th>
              <th scope="col" className="pb-3 pr-8 font-medium"><span>Label Distribution</span><Legend labels={labels} /></th>
              <th scope="col" className="pb-3 pr-6 font-medium">Notes</th>
              <th scope="col" className="pb-3 pr-6 font-medium">Last Activity</th>
              <th scope="col" className="pb-3 font-medium">View Analytics</th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? visible.map((summary) => (
              <tr key={summary.id} className="h-12 align-middle">
                <td className="pr-6 font-regular tabular-nums text-[hsl(0,0%,40%)]">{summary.id}</td>
                <td className="pr-8"><DistributionBar summary={summary} labels={labels} /></td>
                <td className="pr-6 font-regular tabular-nums text-[hsl(0,0%,40%)]">{summary.activityCount.toLocaleString()}</td>
                <td className="pr-6 font-regular tabular-nums text-[hsl(0,0%,40%)]">{formatDate(summary.lastActivity)}</td>
                <td>
                  <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-[#707b8f] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedId(summary.id)}>
                    <Eye className="size-4" />View
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">No record IDs match the current search and filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
      <RecordAnalyticsDialog
        open={Boolean(selected)}
        summary={selected}
        records={selectedId ? records.filter((record) => record.id === selectedId) : []}
        labels={labels}
        previousId={selectedIndex > 0 ? visible[selectedIndex - 1]?.id : undefined}
        nextId={visible[selectedIndex + 1]?.id}
        onSelectId={setSelectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}

function TimeChart({ data, labels, mode }: { data: LabelDistributionOverTime[]; labels: AnalysisLabel[]; mode: ChartMode }) {
  const config = Object.fromEntries(
    labels.map((label, index) => [`label${index}`, { label: label.label, color: label.color }]),
  ) satisfies ChartConfig;
  const rows = data.map((point) => ({
    period: formatPeriod(point.period),
    ...Object.fromEntries(labels.map((label, index) => [
      `label${index}`,
      mode === "proportion" ? round((point.proportions[label.key] ?? 0) * 100) : point.counts[label.key] ?? 0,
    ])),
  }));

  return (
    <>
      <ChartContainer config={config} className="mt-3 h-[184px] w-full aspect-auto" aria-label={`Label distribution over time by ${mode}`}>
        <BarChart accessibilityLayer data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 2 }} barCategoryGap="26%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4" />
          <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 9 }} />
          <YAxis
            width={44}
            domain={mode === "proportion" ? [0, 100] : [0, "auto"]}
            ticks={mode === "proportion" ? [0, 25, 50, 75, 100] : undefined}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--chart-axis)", fontSize: 9 }}
            tickFormatter={(value) => mode === "proportion" ? `${value}%` : String(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <TooltipRow
                    label={String(config[String(name)]?.label ?? name)}
                    value={`${Number(value).toLocaleString()}${mode === "proportion" ? "%" : ""}`}
                  />
                )}
              />
            }
          />
          {labels.map((label, index) => (
            <Bar
              key={label.key}
              dataKey={`label${index}`}
              stackId="labels"
              fill={`var(--color-label${index})`}
              maxBarSize={34}
              radius={index === 0 ? [0, 0, 4, 4] : index === labels.length - 1 ? [4, 4, 0, 0] : 0}
              stroke="white"
              strokeWidth={1}
            >
              <LabelList
                dataKey={`label${index}`}
                position="center"
                className="fill-white text-[8px]"
                formatter={(value) => {
                  const numericValue = Number(value);
                  if (mode === "count") return numericValue > 0 ? numericValue.toLocaleString() : "";
                  return numericValue >= 12 ? `${Math.round(numericValue)}%` : "";
                }}
              />
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      <Legend labels={labels} />
    </>
  );
}

function OverallChart({ data, labels }: { data: LabelDistributionItem[]; labels: AnalysisLabel[] }) {
  const known = new Map(data.map((item) => [item.label, item]));
  const rows = labels.map((label) => ({
    label: label.label,
    count: known.get(label.key)?.count ?? 0,
    proportion: known.get(label.key)?.proportion ?? 0,
    display: `${(known.get(label.key)?.count ?? 0).toLocaleString()} (${Math.round((known.get(label.key)?.proportion ?? 0) * 100)}%)`,
    fill: label.color,
  }));
  const config = { count: { label: "Entries", color: "var(--chart-final)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="mt-3 h-[184px] w-full aspect-auto" aria-label="Total entries for each configured label">
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ top: 8, right: 88, left: 6, bottom: 26 }}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="2 4" />
        <XAxis
          type="number"
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--chart-axis)", fontSize: 9 }}
          label={{ value: "Number of Samples", position: "insideBottom", offset: -10, fill: "var(--chart-axis)", fontSize: 9 }}
        />
        <YAxis type="category" dataKey="label" width={120} axisLine={false} tickLine={false} tick={{ fill: "var(--foreground)", fontSize: 10 }} />
        <ChartTooltip
          cursor={{ fill: "rgba(57, 107, 198, 0.05)" }}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <TooltipRow
                  label="Entries"
                  value={`${Number(value).toLocaleString()} (${Math.round(item.payload.proportion * 100)}%)`}
                />
              )}
            />
          }
        />
        <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={25}>
          {rows.map((item) => <Cell key={item.label} fill={item.fill} />)}
          <LabelList
            dataKey="display"
            position="right"
            className="fill-[#404040] text-[10px]"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function DistributionBar({ summary, labels }: { summary: IdSummary; labels: AnalysisLabel[] }) {
  const total = summary.activityCount;
  const accessibleLabel = labels.map((label) => {
    const percentage = total ? Math.round(((summary.labelCounts[label.key] ?? 0) / total) * 100) : 0;
    return `${label.label} ${percentage}%`;
  }).join(", ");
  return (
    <div className="flex h-6 overflow-hidden rounded-md bg-muted" role="img" aria-label={`Label distribution for ID ${summary.id}: ${accessibleLabel}`}>
      {labels.map((label) => {
        const value = total ? (summary.labelCounts[label.key] ?? 0) / total : 0;
        return (
          <span
            key={label.key}
            aria-hidden="true"
            className="grid min-w-0 place-items-center overflow-hidden text-[10px] text-white tabular-nums"
            style={{ width: `${value * 100}%`, backgroundColor: label.color }}
            title={`${label.label}: ${Math.round(value * 100)}%`}
          >
            {value >= 0.12 ? `${Math.round(value * 100)}%` : null}
          </span>
        );
      })}
    </div>
  );
}

function Legend({ labels, align = "center" }: { labels: AnalysisLabel[]; align?: "start" | "center" }) {
  return (
    <ul className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] ${align === "center" ? "justify-center" : "justify-start"}`}>
      {labels.map((label) => (
        <li key={label.key} className="flex items-center gap-1" style={{ color: label.color }}>
          <span className="size-1.5 rounded-full bg-current" />{label.label}
        </li>
      ))}
    </ul>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className={`${CARD} flex min-h-[300px] flex-col`}>{children}</section>;
}

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold leading-5 text-[#1e2939] sm:whitespace-nowrap">{title}</h2>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xl font-medium leading-6 tabular-nums">{value}</dd>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-32 items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="grid flex-1 place-items-center px-6 py-10 text-center text-xs leading-5 text-muted-foreground">{children}</p>;
}

function Status({ title, description, loading }: { title: string; description?: string; loading?: boolean }) {
  return (
    <section className={`${CARD} grid min-h-[220px] place-items-center text-center`}>
      <div className="max-w-md">
        {loading && <span className="mx-auto mb-4 block size-5 animate-spin rounded-full border-2 border-primary border-r-transparent" />}
        <h2 className="text-sm font-semibold text-[#1e2939]">{title}</h2>
        {description && <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
    </section>
  );
}

function compare(a: IdSummary, b: IdSummary, sort: SortOption) {
  const at = a.lastActivity?.getTime() ?? 0;
  const bt = b.lastActivity?.getTime() ?? 0;
  if (sort === "latest") return bt - at;
  if (sort === "oldest") return at - bt;
  if (sort === "notes") return b.activityCount - a.activityCount;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}
function canonical(value: string) { return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function displayLabel(value: string) { return canonical(value).replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(date?: Date) {
  return date
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date)
    : "Unavailable";
}
function formatPeriod(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  return match
    ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)),
      )
    : period;
}
function round(value: number) { return Math.round(value * 10) / 10; }

const inputClass = "h-8 rounded-md border border-border bg-card pr-3 !text-[11px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const selectClass = "h-8 appearance-none rounded-md border border-border bg-card px-3 pr-6 !text-[11px] text-[#666] outline-none focus-visible:ring-2 focus-visible:ring-ring";
