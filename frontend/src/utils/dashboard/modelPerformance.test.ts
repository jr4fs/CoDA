import type { AnnotationItem } from "@common/types/annotations";
import type { EvalResults, Task } from "@common/types/tasks";
import { describe, expect, it } from "vitest";

import {
  getCompatibleBaseline,
  getErrorProfile,
  getLabelPerformance,
  getMetricBreakdown,
  getReviewF1History,
  getWrongPredictionCount,
} from "./modelPerformance";

const baseEvalResults: EvalResults = {
  predictionsFilename: "predictions.csv",
  macroF1: 0.81,
  macroPrecision: 0.82,
  macroRecall: 0.8,
  accuracy: 0.75,
  numSamples: 20,
  completedAt: "2026-09-23T18:42:00.000Z",
  evaluationKey: "evaluation-v1",
};

describe("model performance data", () => {
  it("maps final and compatible baseline metrics to percentages", () => {
    expect(
      getMetricBreakdown(baseEvalResults, {
        ...baseEvalResults,
        macroF1: 0.65,
        macroPrecision: 0.7,
        macroRecall: 0.62,
      }),
    ).toEqual([
      { metric: "F1", final: 81, baseline: 65 },
      { metric: "Precision", final: 82, baseline: 70 },
      { metric: "Recall", final: 80, baseline: 62 },
    ]);
  });

  it("builds cumulative reviewed-sample F1 points without new evaluation data", () => {
    const history = getReviewF1History(
      [
        annotation(1, ["positive"], ["positive"], true),
        annotation(1, ["positive"], ["negative"], false),
        annotation(2, ["negative"], ["negative"], true),
        annotation(3, ["positive"], ["positive"], null),
      ],
      ["positive", "negative"],
    );

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      batchNum: 1,
      batchSize: 2,
      samplesReviewed: 2,
    });
    expect(history[0].f1).toBeCloseTo(33.33, 2);
    expect(history[1]).toMatchObject({
      batchNum: 2,
      batchSize: 1,
      samplesReviewed: 3,
    });
    expect(history[1].f1).toBeCloseTo(66.67, 2);
  });

  it("excludes incomplete and non-guide annotations from review history", () => {
    const nonGuide = annotation(1, ["positive"], ["positive"], true);
    nonGuide.source = "val";

    expect(
      getReviewF1History(
        [nonGuide, annotation(1, ["positive"], ["positive"], null)],
        ["positive"],
      ),
    ).toEqual([]);
  });

  it("maps per-label baseline and final scores in configured order", () => {
    const final = withPerLabel(baseEvalResults);
    const baseline = withPerLabel({ ...baseEvalResults, macroF1: 0.7 });
    baseline.perLabel!.positive.f1 = 0.72;

    const mapped = getLabelPerformance(
      ["Negative", "Positive", "Not evaluated"],
      final,
      baseline,
    );

    expect(mapped.map(({ label, score, baselineScore }) => ({
      label,
      score,
      baselineScore,
    }))).toEqual([
      { label: "Negative", score: 66.7, baselineScore: 66.7 },
      { label: "Positive", score: 84.7, baselineScore: 72 },
    ]);
  });

  it("summarizes false positives and false negatives as a distinct error profile", () => {
    expect(getErrorProfile(withPerLabel(baseEvalResults))).toEqual({
      falsePositives: 4,
      falseNegatives: 5,
      totalErrors: 9,
      falsePositivePercent: 4 / 9 * 100,
      falseNegativePercent: 5 / 9 * 100,
      mostAffectedLabel: "negative",
      mostAffectedCount: 6,
    });
  });

  it("uses only a baseline compatible with the current evaluation", () => {
    const task = taskWithHistory();
    expect(getCompatibleBaseline(task)?.codebookHash).toBe("matching");

    task.evalResults = { ...baseEvalResults, evaluationKey: "unknown" };
    expect(getCompatibleBaseline(task)).toBeUndefined();
  });

  it("does not infer missing wrong-prediction counts", () => {
    expect(getWrongPredictionCount(baseEvalResults)).toBeNull();
    expect(
      getWrongPredictionCount({ ...baseEvalResults, wrongPredictions: 5 }),
    ).toBe(5);
  });
});

function withPerLabel(results: EvalResults): EvalResults {
  return {
    ...results,
    perLabel: {
      positive: {
        precision: 0.8,
        recall: 0.9,
        f1: 0.847,
        tp: 9,
        fp: 2,
        tn: 7,
        fn: 1,
        support: 10,
      },
      negative: {
        precision: 0.75,
        recall: 0.6,
        f1: 0.667,
        tp: 6,
        fp: 2,
        tn: 10,
        fn: 4,
        support: 10,
      },
    },
  };
}

function taskWithHistory(): Task {
  return {
    _id: "task-1",
    name: "Task",
    description: "Description",
    type: "Multiclass",
    labels: [],
    labelColumn: "label",
    modelName: "model",
    userID: "user",
    columns: ["text"],
    file: "data.csv",
    createdAt: "2026-09-23T18:42:00.000Z",
    evalResults: baseEvalResults,
    evaluationHistory: [
      {
        stage: "baseline",
        codebook: [],
        codebookHash: "other",
        evaluationKey: "other-key",
        modelName: "model",
        valFile: "val.csv",
        results: { ...baseEvalResults, evaluationKey: "other-key" },
      },
      {
        stage: "baseline",
        codebook: [],
        codebookHash: "matching",
        evaluationKey: "evaluation-v1",
        modelName: "model",
        valFile: "val.csv",
        results: { ...baseEvalResults, macroF1: 0.6 },
      },
    ],
  };
}

function annotation(
  batchNum: number,
  predicted: string[],
  truth: string[],
  isCorrect: boolean | null,
): AnnotationItem {
  return {
    taskId: "task-1",
    sampleId: batchNum,
    sampleContent: { text: "sample" },
    labels: truth,
    source: "guide",
    aiAnnotation: {
      batchID: `batch-${batchNum}`,
      batchNum,
      label: predicted,
      reason: "reason",
      span_text: "sample",
      isCorrect,
      feedback: "",
      spanFeedback: true,
      reasoningFeedback: true,
    },
    createdBy: "user-1",
    createdAt: "2026-09-23T18:42:00.000Z",
  };
}
