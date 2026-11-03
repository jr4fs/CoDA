import type {
  EvaluationRecord,
  EvaluationRound,
} from "@common/types/evaluationBuilder";
import type { LabelItem } from "@common/types/tasks";

export function labelCounts(labels: LabelItem[], rounds: EvaluationRound[]) {
  const counts = Object.fromEntries(labels.map((label) => [label.name, 0]));
  for (const round of rounds.filter((r) => r.status === "complete")) {
    for (const record of round.records) {
      for (const label of new Set(record.labels)) {
        if (Object.prototype.hasOwnProperty.call(counts, label))
          counts[label]++;
      }
    }
  }
  return counts;
}

/** Hamilton allocation with smoothing. Quotas are search intent, not predicted labels. */
export function allocateQuotas(
  counts: Record<string, number>,
  target: number,
  size: number,
  prior: Record<string, number> = {},
) {
  const names = Object.keys(counts).filter((name) => counts[name] < target);
  const total = names.reduce((sum, name) => sum + 1 / (counts[name] + 1), 0);
  const entries = names.map((name, index) => {
    const exact = (size * (1 / (counts[name] + 1))) / total;
    return { name, index, quota: Math.floor(exact), remainder: exact % 1 };
  });
  let left = size - entries.reduce((sum, e) => sum + e.quota, 0);
  entries.sort(
    (a, b) =>
      b.remainder - a.remainder ||
      (prior[a.name] ?? 0) - (prior[b.name] ?? 0) ||
      a.index - b.index,
  );
  for (const entry of entries) if (left-- > 0) entry.quota++;
  return Object.fromEntries(entries.map((e) => [e.name, e.quota]));
}

export function validateReview(
  record: EvaluationRecord,
  labels: LabelItem[],
  single: boolean,
): string | null {
  if (
    !Array.isArray(record.labels) ||
    !record.labels.length ||
    new Set(record.labels).size !== record.labels.length
  )
    return "Assign at least one distinct label.";
  if (single && record.labels.length !== 1)
    return "Assign exactly one label for this task.";
  if (record.labels.some((name) => !labels.some((l) => l.name === name)))
    return "Unknown label.";
  if (!Array.isArray(record.spans)) return "Evidence spans must be an array.";
  const seen = new Set<string>();
  for (const span of record.spans) {
    if (
      !span ||
      !record.labels.includes(span.label) ||
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < 0 ||
      span.end <= span.start ||
      span.end > record.text.length ||
      record.text.slice(span.start, span.end) !== span.text ||
      !span.text.trim()
    )
      return "An evidence span does not match the selected text and label.";
    // Do not permit a boundary in the middle of a UTF-16 surrogate pair.
    if (
      [span.start, span.end].some(
        (i) =>
          i > 0 &&
          /[\uD800-\uDBFF]/.test(record.text[i - 1]) &&
          /[\uDC00-\uDFFF]/.test(record.text[i] ?? ""),
      )
    )
      return "An evidence boundary splits a character.";
    const key = JSON.stringify([span.label, span.start, span.end]);
    if (seen.has(key)) return "Duplicate evidence span.";
    seen.add(key);
  }
  for (const name of record.labels) {
    if (
      labels.find((l) => l.name === name)?.requiresEvidence !== false &&
      !record.spans.some((s) => s.label === name)
    )
      return `Highlight evidence for ${name}.`;
  }
  return null;
}
