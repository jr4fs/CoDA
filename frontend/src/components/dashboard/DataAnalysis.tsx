import type { Task } from "@common/types/tasks";
import type { DataAnalysisResponse } from "@common/types/dataAnalysis";
import { ArrowUpDown, Copy, Eye, ListFilter, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Rectangle, XAxis, YAxis } from "recharts";

import RecordAnalyticsDialog, { type AnalysisLabel } from "@/components/dashboard/RecordAnalyticsDialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { toast } from "@/lib/toast";
import { getDataAnalysisData, getDataAnalysisIdRecords } from "@/services/tasks.service";
import type { NormalizedRecord } from "@/types/dashboard";
import {
  type IdSummary, type LabelDistributionItem, type LabelDistributionOverTime,
} from "@/utils/dashboard/dashboardMetrics";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: DataAnalysisResponse };
type SortOption = "latest" | "oldest" | "notes" | "id";
type ChartMode = "proportion" | "count";

const CARD = "rounded-[14px] border border-[#f3f4f6] bg-white p-[25px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]";
const COLORS = [
  "var(--chart-accepted)", "var(--chart-final)", "var(--chart-baseline)",
  "#8b5cf6", "#e76f51", "#0891b2", "#ca8a04", "#db2777",
];
const LABEL_COLORS: Record<string, string> = {
  "health referral": "var(--chart-accepted)",
  referral: "var(--chart-accepted)",
  "health discussion": "var(--chart-final)",
  neither: "var(--chart-baseline)",
  "not relevant": "var(--chart-baseline)",
};

export default function DataAnalysis({ task }: { task: Task }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("latest");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailRecords, setDetailRecords] = useState<NormalizedRecord[]>([]);

  useEffect(() => {
    if (!task._id) return setState({ status: "error" });
    let cancelled = false;
    const load = () => void getDataAnalysisData(task._id!, { search, sort, label: filter === "all" ? undefined : filter, page })
      .then((data) => { if (!cancelled) setState({ status: "ready", data }); })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });
    const timer = window.setTimeout(load, search ? 250 : 0);
    const onUpdate = () => load();
    window.addEventListener("tasks:updated", onUpdate);
    const poll = window.setInterval(() => {
      if (state.status === "ready" && state.data.predictionStatus !== "ready") load();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener("tasks:updated", onUpdate);
    };
  }, [task._id, search, sort, filter, page, state.status === "ready" ? state.data.predictionStatus : "loading"]);

  useEffect(() => {
    if (!selectedId || !task._id) return setDetailRecords([]);
    let cancelled = false;
    setDetailRecords([]);
    void getDataAnalysisIdRecords(task._id, selectedId)
      .then((records) => {
        if (!cancelled) setDetailRecords(records.map((record) => ({
          id: record.id, text: record.text, labels: record.labels,
          label: record.labels[0], timestamp: record.timestamp ? new Date(record.timestamp) : undefined, raw: {},
        })));
      })
      .catch(() => { if (!cancelled) setDetailRecords([]); });
    return () => { cancelled = true; };
  }, [task._id, selectedId]);

  if (state.status === "loading") return <Status title="Loading data analysis…" loading />;
  if (state.status === "error") return <Status title="Data analysis could not be loaded." description="Refresh the page or check the uploaded full dataset." />;
  if (state.data.status === "unavailable") return <Status title="The full dataset is unavailable." description="This task has no accessible D_all upload." />;
  if (!state.data.overview.totalEntries) return <Status title="The full dataset is empty." description="No records are available to summarize." />;
  const labels = getAnalysisLabels(task.labels);
  return <ReadyAnalysis
    data={state.data} labels={labels} search={search} sort={sort} filter={filter} page={page}
    onSearch={(value) => { setPage(1); setSearch(value); }}
    onSort={(value) => { setPage(1); setSort(value); }}
    onFilter={(value) => { setPage(1); setFilter(value); }}
    onPage={setPage} selectedId={selectedId} onSelectId={setSelectedId} detailRecords={detailRecords}
  />;
}

function ReadyAnalysis({ data, labels, search, sort, filter, page, onSearch, onSort, onFilter, onPage, selectedId, onSelectId, detailRecords }: {
  data: DataAnalysisResponse;
  labels: AnalysisLabel[];
  search: string;
  sort: SortOption;
  filter: string;
  page: number;
  onSearch: (value: string) => void;
  onSort: (value: SortOption) => void;
  onFilter: (value: string) => void;
  onPage: (value: number) => void;
  selectedId: string | null;
  onSelectId: (value: string | null) => void;
  detailRecords: NormalizedRecord[];
}) {
  const [mode, setMode] = useState<ChartMode>("proportion");
  const overview = data.overview;
  const distribution = data.distribution;
  const timeData = data.overTime;
  const visible: IdSummary[] = data.ids.map((item) => ({ ...item, lastActivity: item.lastActivity ? new Date(item.lastActivity) : undefined }));
  const selectedLabel = labels.find((label) => label.key === filter);
  const overallShare = distribution.find((item) => item.label === filter)?.proportion ?? 0;
  const selectedIndex = visible.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex < 0 ? null : visible[selectedIndex];
  const hasIds = overview.uniqueIds > 0;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <section className={`${CARD} min-w-0 flex flex-col gap-5 md:flex-row md:items-center md:justify-between`}>
        <Heading title="Full Dataset Overview" description="All records in the original D_all upload" />
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-8">
          <Metric label="Total Entries" value={overview.totalEntries} />
          <Metric label="Total Unique IDs" value={hasIds ? overview.uniqueIds : "—"} />
          <Metric label="Average Entries Per ID" value={hasIds ? overview.averageEntriesPerId.toFixed(2) : "—"} />
        </dl>
      </section>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-stretch gap-3 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Heading
            title="Label Distribution Over Time"
            description={`Predicted entries by label at each time point · ${data.datedClassifiedCount.toLocaleString()} dated entries`}
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
        {data.predictionStatus === "ready" && data.hasTimestamp && timeData.length ? (
          <TimeChart data={timeData} labels={labels} mode={mode} multiLabel={data.multiLabelCount > 0} />
        ) : (
          <ChartEmpty>{data.predictionStatus !== "ready" ? "Run final-codebook inference over D_all to see predicted label trends." : "No usable timestamp column was detected for time-based analysis."}</ChartEmpty>
        )}
      </Card>
      <Card>
        <Heading title="Predicted Label Distribution" description={`Predictions across D_all · ${data.classifiedCount.toLocaleString()} of ${overview.totalEntries.toLocaleString()} records classified`} />
        {data.multiLabelCount > 0 && <p className="mt-2 text-xs leading-5 text-[#667085]">
          {data.multiLabelCount.toLocaleString()} {data.multiLabelCount === 1 ? "entry has" : "entries have"} multiple labels. Each label is counted once per record, so percentages may add to more than 100%.
        </p>}
        {data.unclassifiedCount > 0 && data.predictionStatus === "ready" && <p className="mt-2 text-xs leading-5 text-[#667085]">
          {data.unclassifiedCount.toLocaleString()} records have a missing, failed, or unrecognized prediction and are excluded from label percentages.
        </p>}
        {data.predictionStatus === "ready" && distribution.length ? (
          <OverallChart data={distribution} labels={labels} />
        ) : (
          <ChartEmpty>{data.predictionStatus === "error" ? "The latest full-dataset inference failed or produced an incomplete output." : data.predictionStatus === "pending" ? "Run final-codebook inference over D_all to populate these charts." : "No recognized predictions are available."}</ChartEmpty>
        )}
      </Card>
    </div>

    {!hasIds && <section className={CARD}><Heading title="Record histories unavailable" description="D_all has no usable ID column, so entries cannot be grouped into histories." /></section>}
    {hasIds && <section className={`${CARD} p-4 sm:p-6`}>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_112px_124px]">
        <label className="relative block">
          <span className="sr-only">Search by ID</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} placeholder="Search by ID…" className={inputClass + " w-full pl-9"} onChange={(event) => onSearch(event.target.value)} />
        </label>
        <label className="relative">
          <span className="sr-only">Sort records</span>
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={sort} className={selectClass + " w-full pl-8"} onChange={(event) => onSort(event.target.value as SortOption)}>
            <option value="latest">Sort By</option>
            <option value="oldest">Oldest activity</option>
            <option value="notes">Most notes</option>
            <option value="id">ID number</option>
          </select>
        </label>
        <label className="relative">
          <span className="sr-only">Filter by label</span>
          <ListFilter className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={filter} disabled={data.predictionStatus !== "ready"} className={selectClass + " w-full pl-8"} onChange={(event) => onFilter(event.target.value)}>
            <option value="all">Filter</option>
            {labels.map((label) => <option key={label.key} value={label.key}>More {label.label}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
        Showing {visible.length.toLocaleString()} of {data.totalIds.toLocaleString()} IDs{selectedLabel ? ` with above-average ${selectedLabel.label} prevalence (${Math.round(overallShare * 100)}% overall)` : ""}.
      </p>
      {overview.missingIds > 0 && <p className="mt-3 text-xs text-muted-foreground">{overview.missingIds.toLocaleString()} entries without an ID remain in D_all totals but not the record list.</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed text-left text-xs">
          <caption className="sr-only">Per-ID predicted label distribution and recent activity in D_all</caption>
          <colgroup>
            <col className="w-[14%]" />
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
                <td className="pr-6 font-regular tabular-nums text-[hsl(0,0%,40%)]">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 flex-1 truncate select-text" title={summary.id}>{summary.id}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Copy full ID ${summary.id}`}
                      title="Copy full ID"
                      onClick={() => {
                        if (!navigator.clipboard?.writeText) return toast.error("Clipboard is unavailable");
                        void navigator.clipboard.writeText(summary.id)
                          .then(() => toast.success("Full ID copied"))
                          .catch(() => toast.error("Could not copy ID"));
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </td>
                <td className="pr-8">{data.predictionStatus === "ready" ? <DistributionBar summary={summary} labels={labels} /> : <span className="text-xs text-muted-foreground">Awaiting inference</span>}</td>
                <td className="pr-6 font-regular tabular-nums text-[hsl(0,0%,40%)]">{summary.activityCount.toLocaleString()}</td>
                <td className="pr-6 font-regular tabular-nums text-[hsl(0,0%,40%)]">{formatDate(summary.lastActivity)}</td>
                <td>
                  <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-[#707b8f] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelectId(summary.id)}>
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
      {data.totalIds > data.pageSize && <div className="mt-4 flex items-center justify-end gap-3 text-xs text-muted-foreground">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-9 px-2 disabled:opacity-40">Previous</button>
        <span>Page {page} of {Math.ceil(data.totalIds / data.pageSize)}</span>
        <button type="button" disabled={page * data.pageSize >= data.totalIds} onClick={() => onPage(page + 1)} className="min-h-9 px-2 disabled:opacity-40">Next</button>
      </div>}
    </section>}
      <RecordAnalyticsDialog
        open={Boolean(selected)}
        summary={selected}
        records={detailRecords}
        labels={labels}
        previousId={selectedIndex > 0 ? visible[selectedIndex - 1]?.id : undefined}
        nextId={visible[selectedIndex + 1]?.id}
        onSelectId={onSelectId}
        onOpenChange={(open) => !open && onSelectId(null)}
      />
    </div>
  );
}

function TimeChart({ data, labels, mode, multiLabel }: { data: LabelDistributionOverTime[]; labels: AnalysisLabel[]; mode: ChartMode; multiLabel: boolean }) {
  const config = Object.fromEntries(
    labels.map((label, index) => [`label${index}`, { label: label.label, color: label.color }]),
  ) satisfies ChartConfig;
  const rows: Array<Record<string, number | string>> = data.map((point) => ({
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
              stackId={multiLabel ? undefined : "labels"}
              fill={`var(--color-label${index})`}
              maxBarSize={34}
              stroke="white"
              strokeWidth={1}
              shape={(props) => {
                const row = props.payload as Record<string, number>;
                const bottom = labels.slice(0, index).every((_, labelIndex) => !row[`label${labelIndex}`]);
                const top = labels.slice(index + 1).every((_, offset) => !row[`label${index + offset + 1}`]);
                return <Rectangle {...props} radius={[top ? 4 : 0, top ? 4 : 0, bottom ? 4 : 0, bottom ? 4 : 0]} />;
              }}
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
  const assignments = Object.values(summary.labelCounts).reduce((sum, count) => sum + count, 0);
  const accessibleLabel = labels.map((label) => {
    const percentage = assignments ? Math.round(((summary.labelCounts[label.key] ?? 0) / assignments) * 100) : 0;
    return `${label.label} ${percentage}%`;
  }).join(", ");
  return (
    <div className="flex h-6 overflow-hidden rounded-md bg-muted" role="img" aria-label={`Share of label assignments for ID ${summary.id}: ${accessibleLabel}`}>
      {labels.map((label) => {
        const value = assignments ? (summary.labelCounts[label.key] ?? 0) / assignments : 0;
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
  return <section className={`${CARD} flex min-h-[300px] min-w-0 flex-col`}>{children}</section>;
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

function getAnalysisLabels(labels: Task["labels"]): AnalysisLabel[] {
  const reserved = new Set(labels.map((label) => LABEL_COLORS[canonical(label.name)]).filter(Boolean));
  const used = new Set<string>();
  return labels.map((label, index) => {
    const preferred = LABEL_COLORS[canonical(label.name)];
    const color = preferred && !used.has(preferred)
      ? preferred
      : COLORS.find((candidate) => !reserved.has(candidate) && !used.has(candidate))
        ?? COLORS.find((candidate) => !used.has(candidate))
        ?? COLORS[index % COLORS.length];
    used.add(color);
    return { key: label.name.trim(), label: displayLabel(label.name), color };
  });
}

const inputClass = "h-8 rounded-md border border-border bg-card pr-3 !text-[11px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const selectClass = "h-8 appearance-none rounded-md border border-border bg-card px-3 pr-6 !text-[11px] text-[#666] outline-none focus-visible:ring-2 focus-visible:ring-ring";
