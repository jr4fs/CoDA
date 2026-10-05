import type { AnnotationItem } from "@common/types/annotations";
import type { EvalResults, Task } from "@common/types/tasks";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ModelPerformance from "./ModelPerformance";

const baseTask: Task = {
  _id: "task-1",
  name: "Test task",
  description: "Test dashboard",
  type: "Multiclass",
  labels: [
    { name: "positive", definition: "Positive", keywords: [] },
    { name: "negative", definition: "Negative", keywords: [] },
  ],
  labelColumn: "label",
  modelName: "test-model",
  userID: "user-1",
  columns: ["text"],
  file: "test.csv",
  createdAt: "2026-09-23T18:42:00.000Z",
};

describe("ModelPerformance", () => {
  it("renders concise empty states without baseline warnings", () => {
    const html = render(<ModelPerformance task={baseTask} annotations={[]} />);

    expect(html).toContain("Your performance trend will appear");
    expect(html).toContain("Run final evaluation to see these metrics.");
    expect(html).toContain("This runs model inference on the evaluation set only.");
    expect(html).toContain("Per-label error counts are not available.");
    expect(html).not.toContain("Baseline was not captured");
    expect(html).not.toContain("Error Reduction");
  });

  it("renders aggregate-only legacy evaluations without invented detail", () => {
    const task: Task = {
      ...baseTask,
      evalResults: {
        predictionsFilename: "predictions.csv",
        macroF1: 0.75,
        macroPrecision: 0.8,
        macroRecall: 0.71,
        accuracy: 0.7,
        numSamples: 20,
        completedAt: "2026-09-23T18:42:00.000Z",
      },
    };
    const html = render(<ModelPerformance task={task} annotations={[]} />);

    expect(html).toContain("75%");
    expect(html).toContain("Per-label metrics were not captured");
    expect(html).not.toContain("Error Reduction");
  });

  it("prioritizes final F1 and renders plain-language prediction errors", () => {
    const html = render(<ModelPerformance task={fullTask()} annotations={[]} />);

    expect(html).toContain("Final held-out F1");
    expect(html).toContain("F1 Score");
    expect(html).toContain("Fully correct samples");
    expect(html).toContain("27");
    expect(html).toContain("text-[#33996b]");
    expect(html).toContain("Prediction Errors");
    expect(html).toContain("Added incorrectly");
    expect(html).toContain("Missed");
    expect(html).toContain("Strongest");
    expect(html).toContain("Needs attention");
    expect(html).not.toContain("Review Outcomes");
  });

  it("renders baseline comparisons and error reduction only when compatible", () => {
    const task = fullTask(true);
    const html = render(<ModelPerformance task={task} annotations={[]} />);

    expect(html).toContain("Baseline F1");
    expect(html).toContain("Largest gain");
    expect(html).toContain("Error Reduction");
    expect(html).toContain("66.7%");
  });

  it("marks the majority-label demo reference without claiming model error reduction", () => {
    const task = fullTask();
    const html = render(<ModelPerformance task={{ ...task, demoBaseline: task.evalResults }} annotations={[]} />);

    expect(html).toContain("Demo reference predicts the most common label");
    expect(html).toContain("Demo reference F1");
    expect(html).not.toContain("Error Reduction");
  });

  it("renders cumulative batch history from completed guide reviews", () => {
    const html = render(
      <ModelPerformance
        task={fullTask()}
        annotations={[
          reviewAnnotation(2, ["negative"], ["negative"], true),
          reviewAnnotation(1, ["positive"], ["negative"], false),
          reviewAnnotation(1, ["positive"], ["positive"], true),
          reviewAnnotation(3, ["positive"], ["positive"], null),
        ]}
      />,
    );

    expect(html).toContain("Batch 1");
    expect(html).toContain("Batch 2");
    expect(html).toContain("3 reviewed samples");
    expect(html).toContain("About F1 Score Over Time");
    expect(html).toContain("Samples reviewed");
    expect(html).not.toContain("Batch 3");
  });
});

function render(component: ReactNode) {
  return renderToStaticMarkup(component);
}

function fullTask(withBaseline = false): Task {
  const evalResults: EvalResults = {
    predictionsFilename: "predictions.csv",
    macroF1: 0.89,
    macroPrecision: 0.87,
    macroRecall: 0.91,
    microF1: 0.9,
    wrongPredictions: 3,
    perLabel: {
      positive: {
        precision: 0.9,
        recall: 0.95,
        f1: 0.92,
        tp: 18,
        fp: 2,
        tn: 19,
        fn: 1,
        support: 19,
      },
      negative: {
        precision: 0.84,
        recall: 0.87,
        f1: 0.86,
        tp: 13,
        fp: 2,
        tn: 23,
        fn: 2,
        support: 15,
      },
    },
    accuracy: 0.9,
    numSamples: 30,
    completedAt: "2026-09-23T18:42:00.000Z",
    evaluationKey: "evaluation-v1",
  };

  return {
    ...baseTask,
    evalResults,
    evaluationHistory: withBaseline
      ? [
          {
            stage: "baseline",
            codebook: ["initial rule"],
            codebookHash: "baseline",
            evaluationKey: "evaluation-v1",
            modelName: "test-model",
            valFile: "val.csv",
            results: {
              ...evalResults,
              macroF1: 0.7,
              macroPrecision: 0.72,
              macroRecall: 0.68,
              wrongPredictions: 9,
              perLabel: {
                positive: { ...evalResults.perLabel!.positive, f1: 0.72 },
                negative: { ...evalResults.perLabel!.negative, f1: 0.68 },
              },
            },
          },
        ]
      : undefined,
  };
}

function reviewAnnotation(
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
