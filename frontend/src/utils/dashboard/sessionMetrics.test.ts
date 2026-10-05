import { describe, expect, it } from "vitest";

import type { AIAssisted, AnnotationItem } from "@common/types/annotations";

import { getSessionSummary, getUserFeedbackSummary } from "./sessionMetrics";

const guideAnnotation = (
  sampleId: number,
  review: Partial<AIAssisted> | null,
  source: AnnotationItem["source"] = "guide",
): AnnotationItem => ({
  taskId: "task-1",
  sampleId,
  sampleContent: { text: `Sample ${sampleId}` },
  labels: ["positive"],
  source,
  createdBy: "user-1",
  createdAt: "2026-09-20T00:00:00.000Z",
  aiAnnotation: review
    ? {
        batchID: "batch-1",
        label: ["positive"],
        reason: "Reason",
        span_text: "Sample",
        isCorrect: null,
        feedback: "",
        spanFeedback: null,
        reasoningFeedback: null,
        ...review,
      }
    : null,
});

describe("session metrics", () => {
  it("returns zeroed summaries for an empty session", () => {
    expect(getSessionSummary([])).toEqual({
      samplesReviewed: 0,
      predictionsCorrect: 0,
      rulesCreated: 0,
      sessionTimeMs: 0,
      batchesReviewed: 0,
    });
    expect(getUserFeedbackSummary([])).toEqual({
      accepted: 0,
      corrected: 0,
      incomplete: 0,
      total: 0,
    });
  });

  it("counts accepted, corrected, and incomplete guide reviews", () => {
    const annotations = [
      guideAnnotation(1, {
        batchID: "batch-1",
        isCorrect: true,
        spanFeedback: true,
        reasoningFeedback: true,
        timeToCompleteMs: 1_000,
        guidelinesAdded: ["Rule one"],
      }),
      guideAnnotation(2, {
        batchID: "batch-2",
        isCorrect: false,
        spanFeedback: true,
        reasoningFeedback: true,
        timeToCompleteMs: 2_000,
        guidelinesAdded: ["Rule one", "Rule two"],
      }),
      guideAnnotation(3, { batchID: "batch-2", isCorrect: null, timeToCompleteMs: 9_000 }),
      guideAnnotation(4, { isCorrect: true }, "val"),
    ];

    expect(getSessionSummary(annotations)).toEqual({
      samplesReviewed: 2,
      predictionsCorrect: 1,
      rulesCreated: 2,
      sessionTimeMs: 3_000,
      batchesReviewed: 2,
    });
    expect(getUserFeedbackSummary(annotations)).toEqual({
      accepted: 1,
      corrected: 1,
      incomplete: 1,
      total: 3,
    });
  });

  it("treats any rejected feedback dimension as corrected", () => {
    const annotations = [
      guideAnnotation(1, { isCorrect: true, spanFeedback: false, reasoningFeedback: true }),
    ];

    expect(getUserFeedbackSummary(annotations)).toEqual({
      accepted: 0,
      corrected: 1,
      incomplete: 0,
      total: 1,
    });
    expect(getSessionSummary(annotations).predictionsCorrect).toBe(0);
  });
});
