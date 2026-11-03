import { describe, expect, it } from "vitest";

import type { AnnotationItem } from "@common/types/annotations";

import { getRemainingIssues } from "./sessionInsights";

const reviewedAnnotation = (
  sampleId: number,
  predicted: string[],
  truth: string[],
): AnnotationItem => ({
  taskId: "task-1",
  sampleId,
  sampleContent: { text: `Sample ${sampleId}` },
  labels: truth,
  source: "guide",
  createdBy: "user-1",
  createdAt: "2026-09-20T00:00:00.000Z",
  aiAnnotation: {
    batchID: "batch-1",
    label: predicted,
    reason: "Reason",
    span_text: "Sample",
    isCorrect: predicted.join() === truth.join(),
    feedback: "",
    spanFeedback: true,
    reasoningFeedback: true,
  },
});

describe("getRemainingIssues", () => {
  it("returns no issues without completed mistakes", () => {
    expect(getRemainingIssues([], ["positive", "negative"])).toEqual([]);
    expect(getRemainingIssues([
      reviewedAnnotation(1, ["positive"], ["positive"]),
    ], ["positive", "negative"])).toEqual([]);
  });

  it("calculates multi-label errors and their strongest confusion pair", () => {
    const issues = getRemainingIssues([
      reviewedAnnotation(1, ["positive", "neutral"], ["negative", "neutral"]),
      reviewedAnnotation(2, ["positive"], ["positive"]),
    ], ["positive", "negative", "neutral"]);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ label: "negative", f1: 0, confusedWith: "positive" });
    expect(issues[1].label).toBe("positive");
    expect(issues[1].f1).toBeCloseTo(2 / 3);
    expect(issues[1].confusedWith).toBe("negative");
  });

  it("matches label names case-insensitively", () => {
    const [issue] = getRemainingIssues([
      reviewedAnnotation(1, ["POSITIVE"], ["Negative"]),
    ], ["Positive", "Negative"]);

    expect(issue).toMatchObject({ label: "Positive", confusedWith: "Negative" });
  });
});
