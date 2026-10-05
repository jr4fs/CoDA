import type { AnnotationItem } from "@common/types/annotations";
import type {
  EvalLabelResults,
  EvalResults,
  EvaluationSnapshot,
  Task,
} from "@common/types/tasks";

export interface MetricBreakdownItem {
  metric: "F1" | "Precision" | "Recall";
  final: number;
  baseline?: number;
}

export interface ReviewF1Point {
  batchNum: number;
  batchLabel: string;
  samplesReviewed: number;
  batchSize: number;
  f1: number;
}

export interface LabelPerformanceItem extends EvalLabelResults {
  label: string;
  score: number;
  baselineScore?: number;
}

export interface ErrorProfile {
  falsePositives: number;
  falseNegatives: number;
  totalErrors: number;
  falsePositivePercent: number;
  falseNegativePercent: number;
  mostAffectedLabel: string | null;
  mostAffectedCount: number;
}

export function getCompatibleBaseline(task: Task): EvaluationSnapshot | undefined {
  const evaluationKey = task.evalResults?.evaluationKey;
  if (!evaluationKey) return undefined;

  return [...(task.evaluationHistory ?? [])]
    .reverse()
    .find(
      (snapshot) =>
        snapshot.stage === "baseline" &&
        snapshot.evaluationKey === evaluationKey,
    );
}

export function getMetricBreakdown(
  finalResults?: EvalResults,
  baselineResults?: EvalResults,
): MetricBreakdownItem[] {
  if (!finalResults) return [];

  return [
    toMetric("F1", finalResults.macroF1, baselineResults?.macroF1),
    toMetric(
      "Precision",
      finalResults.macroPrecision,
      baselineResults?.macroPrecision,
    ),
    toMetric("Recall", finalResults.macroRecall, baselineResults?.macroRecall),
  ].filter((metric): metric is MetricBreakdownItem => metric !== null);
}

export function getReviewF1History(
  annotations: AnnotationItem[],
  labelNames: string[],
): ReviewF1Point[] {
  const normalizedLabels = labelNames.map(normalizeLabel).filter(Boolean);
  if (normalizedLabels.length === 0) return [];

  const grouped = new Map<
    number,
    Array<{ predicted: string[]; truth: string[] }>
  >();

  for (const annotation of annotations) {
    const ai = annotation.aiAnnotation;
    const batchNum = ai?.batchNum;
    if (
      annotation.source !== "guide" ||
      !ai ||
      typeof batchNum !== "number" ||
      !Number.isFinite(batchNum) ||
      typeof ai.isCorrect !== "boolean"
    ) {
      continue;
    }

    const predicted = ai.label.map(normalizeLabel).filter(Boolean);
    const truth = annotation.labels.map(normalizeLabel).filter(Boolean);
    if (truth.length === 0) continue;

    const batch = grouped.get(batchNum) ?? [];
    batch.push({ predicted, truth });
    grouped.set(batchNum, batch);
  }

  const cumulative: Array<{ predicted: string[]; truth: string[] }> = [];
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([batchNum, pairs]) => {
      cumulative.push(...pairs);
      return {
        batchNum,
        batchLabel: `Batch ${batchNum}`,
        samplesReviewed: cumulative.length,
        batchSize: pairs.length,
        f1: toScore(computeMacroF1(cumulative, normalizedLabels)),
      };
    });
}

export function getLabelPerformance(
  labelNames: string[],
  finalResults?: EvalResults,
  baselineResults?: EvalResults,
): LabelPerformanceItem[] {
  if (!finalResults?.perLabel) return [];

  const finalByLabel = normalizedMetrics(finalResults.perLabel);
  const baselineByLabel = normalizedMetrics(baselineResults?.perLabel);

  return labelNames.flatMap((label) => {
    const metrics = finalByLabel.get(normalizeLabel(label));
    if (!metrics || !Number.isFinite(metrics.f1)) return [];
    const baseline = baselineByLabel.get(normalizeLabel(label));

    return [
      {
        label,
        ...metrics,
        score: toScore(metrics.f1),
        baselineScore:
          baseline && Number.isFinite(baseline.f1)
            ? toScore(baseline.f1)
            : undefined,
      },
    ];
  });
}

export function getErrorProfile(evalResults?: EvalResults): ErrorProfile | null {
  if (!evalResults?.perLabel) return null;

  let falsePositives = 0;
  let falseNegatives = 0;
  let mostAffectedLabel: string | null = null;
  let mostAffectedCount = -1;

  for (const [label, metrics] of Object.entries(evalResults.perLabel)) {
    falsePositives += metrics.fp;
    falseNegatives += metrics.fn;
    const errors = metrics.fp + metrics.fn;
    if (errors > mostAffectedCount) {
      mostAffectedLabel = label;
      mostAffectedCount = errors;
    }
  }

  const totalErrors = falsePositives + falseNegatives;
  return {
    falsePositives,
    falseNegatives,
    totalErrors,
    falsePositivePercent: getPercent(falsePositives, totalErrors),
    falseNegativePercent: getPercent(falseNegatives, totalErrors),
    mostAffectedLabel,
    mostAffectedCount: Math.max(0, mostAffectedCount),
  };
}

export function getWrongPredictionCount(evalResults?: EvalResults) {
  const count = evalResults?.wrongPredictions;
  return typeof count === "number" && Number.isFinite(count)
    ? Math.max(0, Math.round(count))
    : null;
}

function computeMacroF1(
  pairs: Array<{ predicted: string[]; truth: string[] }>,
  labelNames: string[],
) {
  if (pairs.length === 0 || labelNames.length === 0) return 0;

  const total = labelNames.reduce((sum, label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;

    for (const pair of pairs) {
      const predicted = pair.predicted.includes(label);
      const expected = pair.truth.includes(label);
      if (predicted && expected) tp += 1;
      else if (predicted) fp += 1;
      else if (expected) fn += 1;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;
    return sum + f1;
  }, 0);

  return total / labelNames.length;
}

function toMetric(
  metric: MetricBreakdownItem["metric"],
  finalValue?: number,
  baselineValue?: number,
): MetricBreakdownItem | null {
  if (typeof finalValue !== "number" || !Number.isFinite(finalValue)) return null;
  return {
    metric,
    final: toScore(finalValue),
    baseline:
      typeof baselineValue === "number" && Number.isFinite(baselineValue)
        ? toScore(baselineValue)
        : undefined,
  };
}

function normalizedMetrics(metrics?: Record<string, EvalLabelResults>) {
  return new Map(
    Object.entries(metrics ?? {}).map(([label, value]) => [
      normalizeLabel(label),
      value,
    ]),
  );
}

function toScore(value: number) {
  return Math.min(100, Math.max(0, value * 100));
}

function getPercent(count: number, total: number) {
  return total > 0 ? (count / total) * 100 : 0;
}

function normalizeLabel(label: string) {
  return label.trim().toLocaleLowerCase();
}
