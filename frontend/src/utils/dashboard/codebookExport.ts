import type { AnnotationItem } from "@common/types/annotations";
import type { Task } from "@common/types/tasks";

const normalized = (value: string) => value.trim().toLocaleLowerCase();

export function buildCodebookExport(task: Task, annotations: AnnotationItem[]) {
  const labels = task.labels.map((label) => ({ name: label.name, key: normalized(label.name) }));
  const versions = Object.values(task.codebookVersions ?? {}).sort((a, b) => a.batch - b.batch).map((version) => {
    const reviews = annotations.filter((item) => item.source === "guide" && item.aiAnnotation?.batchNum === version.batch && typeof item.aiAnnotation.isCorrect === "boolean" && item.labels.length > 0);
    let totalTp = 0, totalFp = 0, totalFn = 0;
    const perLabel = Object.fromEntries(labels.map(({ name, key }) => {
      let tp = 0, fp = 0, fn = 0;
      for (const item of reviews) {
        const predicted = item.aiAnnotation!.label.map(normalized).includes(key);
        const truth = item.labels.map(normalized).includes(key);
        if (predicted && truth) tp++; else if (predicted) fp++; else if (truth) fn++;
      }
      totalTp += tp; totalFp += fp; totalFn += fn;
      const precision = tp + fp ? tp / (tp + fp) : 0;
      const recall = tp + fn ? tp / (tp + fn) : 0;
      const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
      return [name, { precision, recall, f1, tp, fp, fn }];
    }));
    const macroF1 = labels.length ? Object.values(perLabel).reduce((sum, value) => sum + value.f1, 0) / labels.length : 0;
    const macroPrecision = labels.length ? Object.values(perLabel).reduce((sum, value) => sum + value.precision, 0) / labels.length : 0;
    const macroRecall = labels.length ? Object.values(perLabel).reduce((sum, value) => sum + value.recall, 0) / labels.length : 0;
    const microF1 = 2 * totalTp + totalFp + totalFn ? 2 * totalTp / (2 * totalTp + totalFp + totalFn) : 0;
    const microPrecision = totalTp + totalFp ? totalTp / (totalTp + totalFp) : 0;
    const microRecall = totalTp + totalFn ? totalTp / (totalTp + totalFn) : 0;
    const evaluation = task.evalResults?.evaluationKey ? [...(task.evaluationHistory ?? [])].reverse().find((snapshot) =>
      snapshot.stage !== "baseline" && snapshot.evaluationKey === task.evalResults?.evaluationKey && snapshot.modelName === task.modelName && snapshot.valFile === task.valFile && JSON.stringify(snapshot.codebook) === JSON.stringify(version.codebook),
    ) : undefined;
    return {
      ...version,
      reviewedBatchPredictionsBeforeCodebookUpdate: reviews.length ? { sampleCount: reviews.length, macroF1, microF1, macroPrecision, macroRecall, microPrecision, microRecall, perLabel } : null,
      dValEvaluationOfThisCodebook: evaluation?.results ?? null,
    };
  });
  return { taskId: task._id, versions };
}
