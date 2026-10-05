import type { EvalLabelResults, EvalResults } from "@common/types/tasks";

// A no-inference reference: predict the most common configured label for every row.
export function createDemoBaseline(
  rows: Array<Record<string, unknown>>,
  textColumn: string,
  labelColumn: string,
  labelNames: string[],
): EvalResults | undefined {
  const samples = rows
    .filter((row) => String(row[textColumn] ?? "").trim())
    .map((row) => String(row[labelColumn] ?? "").split(",").map((label) => label.trim()).filter(Boolean));
  if (!samples.length || !labelNames.length) return undefined;

  const support = Object.fromEntries(labelNames.map((label) => [label, samples.filter((truth) => truth.includes(label)).length]));
  const majority = labelNames.reduce((best, label) => support[label] > support[best] ? label : best);
  if (support[majority] === 0) return undefined;
  const perLabel: Record<string, EvalLabelResults> = Object.fromEntries(labelNames.map((label) => {
    const tp = label === majority ? support[label] : 0;
    const fp = label === majority ? samples.length - tp : 0;
    const fn = label === majority ? 0 : support[label];
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return [label, {
      tp, fp, fn, tn: samples.length - tp - fp - fn, support: support[label],
      precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    }];
  }));
  const metrics = Object.values(perLabel);
  const correct = samples.filter((truth) => truth.length === 1 && truth[0] === majority).length;
  const mean = (key: "f1" | "precision" | "recall") => metrics.reduce((sum, item) => sum + item[key], 0) / metrics.length;

  return {
    predictionsFilename: "",
    macroF1: mean("f1"), macroPrecision: mean("precision"), macroRecall: mean("recall"),
    accuracy: correct / samples.length, wrongPredictions: samples.length - correct,
    perLabel, numSamples: samples.length, completedAt: new Date().toISOString(),
  };
}
