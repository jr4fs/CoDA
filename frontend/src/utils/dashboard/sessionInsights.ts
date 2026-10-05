import type { AnnotationItem } from "@common/types/annotations";

export interface RemainingIssue {
  label: string;
  f1: number;
  confusedWith?: string;
}

interface LabelCounts {
  tp: number;
  fp: number;
  fn: number;
}

export function getRemainingIssues(
  annotations: AnnotationItem[],
  labelNames: string[],
): RemainingIssue[] {
  const canonicalLabels = new Map(
    labelNames.map((label) => [normalizeLabel(label), label]),
  );
  const counts = new Map<string, LabelCounts>(
    labelNames.map((label) => [label, { tp: 0, fp: 0, fn: 0 }]),
  );
  const confusions = new Map<string, Map<string, number>>();

  for (const annotation of annotations) {
    const feedback = annotation.aiAnnotation;
    if (annotation.source !== "guide" || feedback?.isCorrect == null) continue;

    const predicted = toCanonicalSet(feedback.label, canonicalLabels);
    const truth = getTruthLabels(annotation, canonicalLabels);
    if (truth.size === 0) continue;

    for (const label of labelNames) {
      const labelCounts = counts.get(label)!;
      const wasPredicted = predicted.has(label);
      const isTruth = truth.has(label);

      if (wasPredicted && isTruth) labelCounts.tp += 1;
      else if (wasPredicted) labelCounts.fp += 1;
      else if (isTruth) labelCounts.fn += 1;
    }

    const falsePositives = [...predicted].filter((label) => !truth.has(label));
    const falseNegatives = [...truth].filter((label) => !predicted.has(label));

    for (const predictedLabel of falsePositives) {
      for (const truthLabel of falseNegatives) {
        addConfusion(confusions, predictedLabel, truthLabel);
        addConfusion(confusions, truthLabel, predictedLabel);
      }
    }
  }

  return labelNames
    .flatMap((label) => {
      const { tp, fp, fn } = counts.get(label)!;
      if (fp + fn === 0) return [];

      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 =
        precision + recall > 0
          ? (2 * precision * recall) / (precision + recall)
          : 0;

      return [
        {
          label,
          f1,
          confusedWith: getMostFrequentConfusion(confusions.get(label)),
        },
      ];
    })
    .sort((a, b) => a.f1 - b.f1);
}

function getTruthLabels(
  annotation: AnnotationItem,
  canonicalLabels: Map<string, string>,
) {
  const feedback = annotation.aiAnnotation!;

  if (feedback.isCorrect) {
    return toCanonicalSet(feedback.label, canonicalLabels);
  }

  if (feedback.correctLabel) {
    return toCanonicalSet([feedback.correctLabel], canonicalLabels);
  }

  return toCanonicalSet(annotation.labels, canonicalLabels);
}

function toCanonicalSet(
  labels: string[],
  canonicalLabels: Map<string, string>,
) {
  return new Set(
    labels.flatMap((label) => {
      const canonical = canonicalLabels.get(normalizeLabel(label));
      return canonical ? [canonical] : [];
    }),
  );
}

function addConfusion(
  confusions: Map<string, Map<string, number>>,
  label: string,
  confusedWith: string,
) {
  const labelConfusions = confusions.get(label) ?? new Map<string, number>();
  labelConfusions.set(
    confusedWith,
    (labelConfusions.get(confusedWith) ?? 0) + 1,
  );
  confusions.set(label, labelConfusions);
}

function getMostFrequentConfusion(confusions?: Map<string, number>) {
  if (!confusions || confusions.size === 0) return undefined;

  return [...confusions.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}
