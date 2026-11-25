import { describe, expect, it } from "vitest";
import type { Task } from "@common/types/tasks";
import type { AnnotationItem } from "@common/types/annotations";
import { buildCodebookExport } from "./codebookExport";

describe("codebook export", () => {
  it("reports reviewed-batch scores separately from matching D_val evaluation", () => {
    const result = { macroF1: 0.8, microF1: 0.9, accuracy: 0.9, numSamples: 10, completedAt: "now", predictionsFilename: "pred.csv", evaluationKey: "data-1" };
    const task = {
      _id: "task", name: "Example", description: "Example", type: "Multiclass", labelColumn: "label", userID: "user", columns: ["text"], file: "data.csv", createdAt: "now",
      labels: [{ name: "positive", definition: "", keywords: [] }, { name: "negative", definition: "", keywords: [] }], modelName: "model", valFile: "val.csv", evalResults: result,
      codebookVersions: { "1": { batch: 1, codebook: ["first"], savedAt: "now" }, "2": { batch: 2, codebook: ["second"], savedAt: "now" } },
      evaluationHistory: [{ stage: "final", codebookHash: "hash", evaluationKey: "data-1", modelName: "model", valFile: "val.csv", codebook: ["second"], results: result }],
    } as Task;
    const annotations = [
      { source: "guide", labels: ["positive"], aiAnnotation: { batchNum: 1, isCorrect: true, label: ["positive"] } },
      { source: "guide", labels: ["negative"], aiAnnotation: { batchNum: 1, isCorrect: false, label: ["positive"] } },
      { source: "guide", labels: ["negative"], aiAnnotation: { batchNum: 1, isCorrect: null, label: ["positive"] } },
    ] as AnnotationItem[];
    const { versions } = buildCodebookExport(task, annotations);
    expect(versions[0].reviewedBatchPredictionsBeforeCodebookUpdate).toMatchObject({ sampleCount: 2, macroF1: 1 / 3, microF1: 0.5 });
    expect(versions[0].dValEvaluationOfThisCodebook).toBeNull();
    expect(versions[1].reviewedBatchPredictionsBeforeCodebookUpdate).toBeNull();
    expect(versions[1].dValEvaluationOfThisCodebook).toEqual(result);
  });
});
