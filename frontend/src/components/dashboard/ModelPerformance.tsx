import type { AnnotationItem } from "@common/types/annotations";
import type { EvalResults, Task } from "@common/types/tasks";
import { Download, Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  getCompatibleBaseline,
  getErrorProfile,
  getLabelPerformance,
  getMetricBreakdown,
  getReviewF1History,
  getWrongPredictionCount,
} from "@/utils/dashboard/modelPerformance";

export interface ModelPerformanceProps {
  task: Task;
  annotations: AnnotationItem[];
  onDownloadPredictions?: (filename: string) => Promise<void>;
}

const CARD_STYLES =
  "h-full rounded-[14px] border border-[#f3f4f6] bg-white p-[25px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]";

const historyChartConfig = {
  f1: { label: "Reviewed-sample F1", color: "var(--chart-accepted)" },
} satisfies ChartConfig;

const metricChartConfig = {
  baseline: { label: "Baseline", color: "var(--chart-baseline)" },
  final: { label: "Final Evaluation", color: "var(--chart-final)" },
} satisfies ChartConfig;

const labelChartConfig = {
  baselineScore: { label: "Baseline F1", color: "var(--chart-baseline)" },
  score: { label: "Final F1", color: "var(--chart-final)" },
} satisfies ChartConfig;

export default function ModelPerformance({
  task,
  annotations,
  onDownloadPredictions,
}: ModelPerformanceProps) {
  const realBaseline = getCompatibleBaseline(task)?.results;
  const demoBaseline = realBaseline ? undefined : task.demoBaseline;
  const baseline = realBaseline ?? demoBaseline;
  const baselineLabel = demoBaseline ? "Demo reference" : "Baseline";
  const baselineRecorded = task.evaluationHistory?.some((snapshot) => snapshot.stage === "baseline");

  return (
    <div className="grid gap-4">
      {!task.evalResults && <p className="text-xs leading-5 text-[#667085]" role="status">
        Run final evaluation from the task summary to unlock held-out F1, precision, recall, prediction errors, and label performance. This runs model inference on the evaluation set only.
      </p>}
      {demoBaseline && <p className="text-xs leading-5 text-[#667085]" role="note">
        Demo reference predicts the most common label in the uploaded evaluation set for every sample. No model inference was run; comparisons are illustrative, not measured codebook improvement.
      </p>}
      {!baseline && <p className="text-xs leading-5 text-[#667085]" role="status">
        {baselineRecorded
          ? task.evalResults
            ? "A comparable initial evaluation is unavailable for this evaluation set."
            : "The initial evaluation is saved; comparisons will appear after the final evaluation."
          : "No comparison reference is available for this task."}
      </p>}
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <F1HistoryCard task={task} annotations={annotations} />
        <MetricBreakdownCard
          finalResults={task.evalResults}
          baselineResults={baseline}
          baselineLabel={baselineLabel}
        />
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-10">
        <FinalEvaluationCard
          evalResults={task.evalResults}
          onDownloadPredictions={onDownloadPredictions}
          className="xl:col-span-3"
        />
        <PredictionErrorsCard
          evalResults={task.evalResults}
          className="xl:col-span-3"
        />
        <LabelPerformanceCard
          task={task}
          baselineResults={baseline}
          baselineLabel={baselineLabel}
          className="xl:col-span-4"
        />
      </div>

      {realBaseline &&
        getWrongPredictionCount(realBaseline) !== null &&
        getWrongPredictionCount(task.evalResults) !== null && (
          <div className="grid gap-4 xl:grid-cols-10">
            <ErrorReductionCard
              baselineResults={realBaseline}
              finalResults={task.evalResults}
              className="xl:col-span-3"
            />
          </div>
        )}
    </div>
  );
}

function F1HistoryCard({
  task,
  annotations,
}: {
  task: Task;
  annotations: AnnotationItem[];
}) {
  const data = useMemo(
    () =>
      getReviewF1History(
        annotations,
        task.labels.map((label) => label.name),
      ).map((point) => ({ ...point, f1: roundToOneDecimal(point.f1) })),
    [annotations, task.labels],
  );

  return (
    <DashboardCard className="min-h-[300px]">
      <div className="flex items-center gap-1.5">
        <CardTitle>F1 Score Over Time</CardTitle>
        <InfoTooltip label="About F1 Score Over Time">
          Reviews happen in small batches. This cumulative trend updates after
          each completed batch and may rise or fall as the model encounters new
          examples. It uses reviewed guide samples, not the held-out evaluation
          set.
        </InfoTooltip>
      </div>

      {data.length > 0 ? (
        <>
          <ChartContainer
            config={historyChartConfig}
            className="mt-4 min-h-[220px] w-full flex-1 aspect-auto"
            aria-label="Cumulative F1 on reviewed samples after each completed batch"
          >
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ top: 12, right: 18, left: -18, bottom: 4 }}
            >
              <defs>
                <linearGradient id="reviewed-f1-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-f1)"
                    stopOpacity={0.24}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-f1)"
                    stopOpacity={0.04}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--chart-grid)"
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="samplesReviewed"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(value) => `${value}%`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const point = payload?.[0]?.payload;
                      return point
                        ? `${point.batchLabel} · ${point.samplesReviewed} reviewed`
                        : "Review progress";
                    }}
                    formatter={(value, _name, item) => (
                      <div className="grid gap-1">
                        <TooltipValue
                          label="Cumulative F1"
                          value={`${Number(value).toFixed(1)}%`}
                        />
                        <TooltipValue
                          label="Batch size"
                          value={String(item.payload.batchSize)}
                        />
                      </div>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="f1"
                stroke="var(--color-f1)"
                strokeWidth={2}
                fill="url(#reviewed-f1-fill)"
                dot={{ r: 4, fill: "var(--chart-accepted)", fillOpacity: 1, stroke: "var(--chart-accepted)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: "var(--chart-accepted)", fillOpacity: 1, stroke: "var(--chart-accepted)" }}
              />
            </AreaChart>
          </ChartContainer>
          <p className="mt-1 text-center text-xs leading-5 text-[#667085]">
            Samples reviewed
          </p>
          <ul className="sr-only">
            {data.map((point) => (
              <li key={point.batchNum}>
                {point.batchLabel}: {point.f1.toFixed(1)}% cumulative F1 after{" "}
                {point.samplesReviewed} reviewed samples
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="grid flex-1 place-items-center py-8 text-center">
          <div className="max-w-sm">
            <p className="text-sm font-medium text-[#404040]">
              Your performance trend will appear after the first review batch.
            </p>
            <p className="mt-2 text-xs leading-5 text-[#808080]">
              Each point will summarize the model’s predictions across all
              samples reviewed so far.
            </p>
            {task.evalResults && (
              <p className="mt-5 text-xs text-[#667085]">
                Final held-out F1
                <span className="ml-2 text-xl font-semibold text-[#396bc6]">
                  {formatScore(task.evalResults.macroF1)}
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

function MetricBreakdownCard({
  finalResults,
  baselineResults,
  baselineLabel = "Baseline",
}: {
  finalResults?: EvalResults;
  baselineResults?: EvalResults;
  baselineLabel?: string;
}) {
  const data = getMetricBreakdown(finalResults, baselineResults).map((item) => ({
    ...item,
    final: roundToOneDecimal(item.final),
    baseline:
      item.baseline === undefined
        ? undefined
        : roundToOneDecimal(item.baseline),
  }));
  const hasBaseline = data.some((item) => item.baseline !== undefined);

  return (
    <DashboardCard className="min-h-[300px]">
      <div className="flex items-start justify-between gap-4">
        <CardTitle>Metric Breakdown</CardTitle>
        <div className="flex flex-wrap justify-end gap-3">
          {hasBaseline && (
            <ChartKey color="var(--chart-baseline)">{baselineLabel}</ChartKey>
          )}
          <ChartKey color="var(--chart-final)">Final Evaluation</ChartKey>
        </div>
      </div>

      {data.length > 0 ? (
        <>
          <ChartContainer
            config={metricChartConfig}
            className="mt-3 h-[145px] w-full aspect-auto"
            aria-label="Macro F1, precision, and recall"
          >
            <BarChart
              accessibilityLayer
              data={data}
              barGap={6}
              barCategoryGap="52%"
              margin={{ top: 18, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--chart-grid)"
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="metric"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(value) => `${value}%`}
              />
              <ChartTooltip
                cursor={{ fill: "rgba(57, 107, 198, 0.05)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <TooltipValue
                        label={name === "baseline" ? baselineLabel : "Final"}
                        value={`${Number(value).toFixed(1)}%`}
                      />
                    )}
                  />
                }
              />
              {hasBaseline && (
                <Bar
                  dataKey="baseline"
                  fill="var(--color-baseline)"
                  radius={[3, 3, 0, 0]}
                  barSize={22}
                >
                  <LabelList
                    dataKey="baseline"
                    position="top"
                    className="fill-[#667085] text-[10px]"
                    formatter={formatChartValue}
                  />
                </Bar>
              )}
              <Bar
                dataKey="final"
                fill="var(--color-final)"
                radius={[3, 3, 0, 0]}
                barSize={22}
              >
                <LabelList
                  dataKey="final"
                  position="top"
                  className="fill-[#396bc6] text-[10px]"
                  formatter={formatChartValue}
                />
              </Bar>
            </BarChart>
          </ChartContainer>

          <dl className="mt-3 grid grid-cols-1 gap-3 border-t border-[#f0f1f3] pt-3 md:grid-cols-3">
            <MetricDefinition
              term="F1 Score"
              definition="Balances correct predictions with correct labels the model finds."
            />
            <MetricDefinition
              term="Precision"
              definition="Of the labels the model applied, how many were correct."
            />
            <MetricDefinition
              term="Recall"
              definition="Of the correct labels in the evaluation set, how many the model found."
            />
          </dl>
        </>
      ) : (
        <EmptyState>Run final evaluation to see these metrics.</EmptyState>
      )}
    </DashboardCard>
  );
}

function FinalEvaluationCard({
  evalResults,
  onDownloadPredictions,
  className,
}: {
  evalResults?: EvalResults;
  onDownloadPredictions?: (filename: string) => Promise<void>;
  className?: string;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const fullyCorrect =
    evalResults && getWrongPredictionCount(evalResults) !== null
      ? Math.max(
          0,
          evalResults.numSamples - (getWrongPredictionCount(evalResults) ?? 0),
        )
      : null;

  const handleDownload = async () => {
    if (!evalResults?.predictionsFilename || !onDownloadPredictions) return;
    setIsDownloading(true);
    try {
      await onDownloadPredictions(evalResults.predictionsFilename);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <DashboardCard className={`min-h-[315px] ${className ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <CardTitle>Final Evaluation</CardTitle>
        <InfoTooltip label="About final evaluation metrics">
          F1, precision, and recall are macro averages, so every configured
          label contributes equally. Fully correct means the complete predicted
          label set matched the expected set.
        </InfoTooltip>
      </div>

      {evalResults ? (
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <dl className="flex flex-1 flex-col justify-evenly gap-4 text-center">
            <EvaluationMetric label="F1 Score" value={evalResults.macroF1} primary tone="green" />
            <div className="grid grid-cols-2 gap-4">
              <EvaluationMetric label="Precision" value={evalResults.macroPrecision} />
              <EvaluationMetric label="Recall" value={evalResults.macroRecall} />
            </div>
          </dl>

          <dl className="grid gap-3 border-t border-[#f0f1f3] pt-4 text-xs leading-5">
            <SummaryRow
              label="Evaluated samples"
              value={evalResults.numSamples.toLocaleString()}
            />
            <SummaryRow
              label="Fully correct samples"
              value={fullyCorrect === null ? "—" : fullyCorrect.toLocaleString()}
            />
          </dl>
          {evalResults.predictionsFilename && (
            <button
              type="button"
              disabled={isDownloading || !onDownloadPredictions}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 self-center rounded-md px-2 text-xs font-medium text-[#396bc6] hover:bg-[#f3f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void handleDownload()}
            >
              <Download className="size-3.5" aria-hidden="true" />
              {isDownloading ? "Downloading…" : "Download predictions"}
            </button>
          )}
        </div>
      ) : (
        <EmptyState>Run final evaluation to see these metrics.</EmptyState>
      )}
    </DashboardCard>
  );
}

function PredictionErrorsCard({
  evalResults,
  className,
}: {
  evalResults?: EvalResults;
  className?: string;
}) {
  const profile = getErrorProfile(evalResults);

  return (
    <DashboardCard className={`min-h-[315px] ${className ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <CardTitle>Prediction Errors</CardTitle>
        <InfoTooltip label="About prediction errors">
          A sample is wrong when its complete predicted label set differs from
          the expected set. One wrong sample can have both an added and a missed
          label, so label-decision counts can exceed the number of wrong samples.
        </InfoTooltip>
      </div>

      {!profile ? (
        <EmptyState>{getWrongPredictionCount(evalResults) === null
          ? "Per-label error counts are not available."
          : `${getWrongPredictionCount(evalResults)} of ${evalResults!.numSamples} samples had an incorrect label set. Per-label error counts are unavailable.`}</EmptyState>
      ) : profile.totalErrors === 0 ? (
        <div className="grid flex-1 place-items-center py-8 text-center">
          <div>
            <p className="text-2xl font-semibold text-[#33996b]">0</p>
            <p className="mt-2 text-xs text-[#667085]">
              No label-assignment errors found.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[34px] font-semibold leading-none text-[#d35f5f]">
              {getWrongPredictionCount(evalResults)?.toLocaleString() ?? "—"}
            </span>
            <span className="text-[11px] text-[#667085]">of {evalResults!.numSamples.toLocaleString()} samples had an incorrect label set</span>
          </div>
          <p className="mt-2 text-xs text-[#667085]">{profile.totalErrors.toLocaleString()} individual label decisions were wrong; one sample can contribute more than one.</p>

          <dl className="mt-5 grid gap-4">
            <ErrorCountRow
              term="Added incorrectly"
              count={profile.falsePositives}
              total={profile.totalErrors}
              color="var(--chart-corrected)"
              definition="An extra label was added."
            />
            <ErrorCountRow
              term="Missed"
              count={profile.falseNegatives}
              total={profile.totalErrors}
              color="var(--chart-error)"
              definition="An expected label was not applied."
            />
          </dl>

          <p className="mt-auto border-t border-[#f0f1f3] pt-3 text-xs leading-5 text-[#667085]">
            Most affected: {" "}
            <span className="font-semibold text-[#404040]">
              {profile.mostAffectedLabel}
            </span>{" "}
            · {profile.mostAffectedCount} mistakes
          </p>
        </>
      )}
    </DashboardCard>
  );
}

function LabelPerformanceCard({
  task,
  baselineResults,
  baselineLabel = "Baseline",
  className,
}: {
  task: Task;
  baselineResults?: EvalResults;
  baselineLabel?: string;
  className?: string;
}) {
  const data = getLabelPerformance(
    task.labels.map((label) => label.name),
    task.evalResults,
    baselineResults,
  ).map((item) => ({
    ...item,
    score: roundToOneDecimal(item.score),
    baselineScore:
      item.baselineScore === undefined
        ? undefined
        : roundToOneDecimal(item.baselineScore),
  }));
  const hasBaseline = data.some((item) => item.baselineScore !== undefined);
  const chartHeight = Math.max(170, data.length * (hasBaseline ? 42 : 36) + 42);
  const strongest = data.reduce<(typeof data)[number] | undefined>(
    (best, item) => (!best || item.score > best.score ? item : best),
    undefined,
  );
  const needsAttention = data.reduce<(typeof data)[number] | undefined>(
    (lowest, item) => (!lowest || item.score < lowest.score ? item : lowest),
    undefined,
  );
  const largestChange = data
    .filter(
      (item): item is typeof item & { baselineScore: number } =>
        item.baselineScore !== undefined,
    )
    .reduce<((typeof data)[number] & { baselineScore: number }) | undefined>(
      (largest, item) =>
        !largest ||
        item.score - item.baselineScore >
          largest.score - largest.baselineScore
          ? item
          : largest,
      undefined,
    );

  return (
    <DashboardCard className={`min-h-[315px] ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-4">
        <CardTitle>Label Performance</CardTitle>
        <div className="flex flex-wrap justify-end gap-3">
          {hasBaseline && (
            <ChartKey color="var(--chart-baseline)">{baselineLabel} F1</ChartKey>
          )}
          <ChartKey color="var(--chart-final)">Final F1</ChartKey>
        </div>
      </div>

      {data.length > 0 ? (
        <>
          {hasBaseline ? (
            <ChartContainer
              config={labelChartConfig}
              className="mt-3 w-full aspect-auto"
              style={{ height: chartHeight }}
              aria-label={`${baselineLabel} and final F1 score for each configured label`}
            >
              <BarChart
                accessibilityLayer
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 52, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--chart-grid)"
                  strokeDasharray="2 4"
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  tickFormatter={(value) => `${value}%`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={82}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                />
                <ChartTooltip content={<ScoreTooltip baselineLabel={`${baselineLabel} F1`} />} />
                <Bar
                  dataKey="baselineScore"
                  fill="var(--color-baselineScore)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={9}
                >
                  <LabelList
                    dataKey="baselineScore"
                    position="right"
                    className="fill-[#667085] text-[10px]"
                    formatter={formatChartValueOneDecimal}
                  />
                </Bar>
                <Bar
                  dataKey="score"
                  fill="var(--color-score)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={9}
                >
                  <LabelList
                    dataKey="score"
                    position="right"
                    className="fill-[#396bc6] text-[10px]"
                    formatter={formatChartValueOneDecimal}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartContainer
              config={labelChartConfig}
              className="mt-3 w-full aspect-auto"
              style={{ height: chartHeight }}
              aria-label="Final F1 score for each configured label"
            >
              <ScatterChart
                accessibilityLayer
                data={data}
                margin={{ top: 8, right: 42, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--chart-grid)"
                  strokeDasharray="2 4"
                />
                <XAxis
                  type="number"
                  dataKey="score"
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  tickFormatter={(value) => `${value}%`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  reversed
                  width={82}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                />
                <ChartTooltip content={<ScoreTooltip />} />
                <Scatter dataKey="score" fill="var(--color-score)">
                  <LabelList
                    dataKey="score"
                    position="right"
                    className="fill-[#404040] text-[10px]"
                    formatter={formatChartValueOneDecimal}
                  />
                </Scatter>
              </ScatterChart>
            </ChartContainer>
          )}
          <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-[#f0f1f3] pt-3 text-xs leading-5">
            <LabelInsight
              label="Strongest"
              value={
                strongest
                  ? `${strongest.label} · ${strongest.score.toFixed(1)}%`
                  : "—"
              }
            />
            {hasBaseline && largestChange ? (
              <LabelInsight
                label={baselineLabel === "Demo reference" ? "Largest difference" : "Largest gain"}
                value={`${largestChange.label} · ${formatPointChange(largestChange.score - largestChange.baselineScore)}`}
              />
            ) : (
              <LabelInsight
                label="Needs attention"
                value={
                  needsAttention
                    ? `${needsAttention.label} · ${needsAttention.score.toFixed(1)}%`
                    : "—"
                }
              />
            )}
          </dl>
        </>
      ) : (
        <EmptyState>
          Per-label metrics were not captured for this evaluation.
        </EmptyState>
      )}
    </DashboardCard>
  );
}

function ErrorReductionCard({
  baselineResults,
  finalResults,
  className,
}: {
  baselineResults: EvalResults;
  finalResults?: EvalResults;
  className?: string;
}) {
  const baselineErrors = getWrongPredictionCount(baselineResults);
  const finalErrors = getWrongPredictionCount(finalResults);
  const reduction =
    baselineErrors !== null && baselineErrors > 0 && finalErrors !== null
      ? ((baselineErrors - finalErrors) / baselineErrors) * 100
      : null;

  return (
    <DashboardCard className={className}>
      <CardTitle>Error Reduction</CardTitle>
      <dl className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <MetricValue
          label="Baseline errors"
          value={baselineErrors?.toLocaleString() ?? "—"}
          tone="baseline"
        />
        <span className="text-xl text-[#808080]" aria-hidden="true">
          →
        </span>
        <MetricValue
          label="Final errors"
          value={finalErrors?.toLocaleString() ?? "—"}
          tone="final"
        />
      </dl>
      <p className="mt-5 border-t border-[#f0f1f3] pt-4 text-center text-xs text-[#667085]">
        Reduction {" "}
        <span className="text-base font-semibold text-[#33996b]">
          {reduction === null ? "—" : `${roundToOneDecimal(reduction)}%`}
        </span>
      </p>
    </DashboardCard>
  );
}

function DashboardCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${CARD_STYLES} flex flex-col ${className ?? ""}`}>
      {children}
    </section>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold leading-5 text-[#1e2939]">{children}</h2>;
}

function MetricDefinition({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold leading-5 text-[#404040]">{term}</dt>
      <dd className="mt-0.5 text-xs leading-5 text-[#667085]">{definition}</dd>
    </div>
  );
}

function EvaluationMetric({
  label,
  value,
  primary = false,
  tone = "blue",
}: {
  label: string;
  value?: number;
  primary?: boolean;
  tone?: "blue" | "green";
}) {
  return (
    <div className="min-w-0">
      <dd
        className={`${primary ? "text-[36px]" : "text-[24px]"} whitespace-nowrap font-semibold leading-none tabular-nums ${tone === "green" ? "text-[#33996b]" : "text-[#396bc6]"}`}
      >
        {formatScore(value)}
      </dd>
      <dt className="mt-2 text-xs leading-5 text-[#667085]">{label}</dt>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#667085]">{label}</dt>
      <dd className="font-medium text-[#404040]">{value}</dd>
    </div>
  );
}

function ErrorCountRow({
  color,
  term,
  count,
  total,
  definition,
}: {
  color: string;
  term: string;
  count: number;
  total: number;
  definition: string;
}) {
  return (
    <div className="text-xs leading-5">
      <dt className="flex items-center justify-between gap-3 font-semibold text-[#404040]">
        <span>{term}</span>
        <span>{count}</span>
      </dt>
      <dd className="mt-1 text-[#667085]">{definition}</dd>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef0f3]"
        role="img"
        aria-label={`${term}: ${count} of ${total} label mistakes`}
      >
        <span
          className="block h-full rounded-full"
          style={{
            backgroundColor: color,
            width: `${total > 0 ? (count / total) * 100 : 0}%`,
          }}
        />
      </div>
    </div>
  );
}

function LabelInsight({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#667085]">{label}</dt>
      <dd className="font-semibold text-[#404040]">{value}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-36 flex-1 place-items-center py-6 text-center text-xs leading-5 text-[#667085]">
      <p className="max-w-72">{children}</p>
    </div>
  );
}

function ChartKey({
  children,
  color,
}: {
  children: ReactNode;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-[#667085]">
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

function TooltipValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full min-w-28 items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function ScoreTooltip({ baselineLabel = "Baseline F1" }: { baselineLabel?: string }) {
  return (
    <ChartTooltipContent
      formatter={(value, name) => (
        <TooltipValue
          label={name === "baselineScore" ? baselineLabel : "Final F1"}
          value={`${Number(value).toFixed(1)}%`}
        />
      )}
    />
  );
}

function InfoTooltip({
  children,
  label = "More information",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="grid size-4 place-items-center rounded-full border-0 p-0 text-[#808080] hover:text-[#404040] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
      >
        <Info className="size-3" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-6 left-0 z-20 w-64 rounded-lg border border-[#e5e7eb] bg-white p-3 text-xs leading-5 text-[#667085] opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}

function MetricValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "baseline" | "final";
}) {
  return (
    <div>
      <dd
        className={`text-[28px] font-semibold leading-none ${tone === "baseline" ? "text-[#667085]" : "text-[#33996b]"}`}
      >
        {value}
      </dd>
      <dt className="mt-2 text-xs leading-5 text-[#667085]">{label}</dt>
    </div>
  );
}

function formatScore(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${roundToOneDecimal(value * 100)}%`;
}

function formatChartValue(value: unknown) {
  return typeof value === "number" ? `${value.toFixed(0)}%` : "";
}

function formatChartValueOneDecimal(value: unknown) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "";
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function formatPointChange(value: number) {
  const rounded = roundToOneDecimal(value);
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}
