import type { AnnotationItem } from "@common/types/annotations";

export interface SessionSummary {
  samplesReviewed: number;
  predictionsCorrect: number;
  rulesCreated: number;
  sessionTimeMs: number;
  batchesReviewed: number;
}

export interface UserFeedbackSummary {
  accepted: number;
  corrected: number;
  incomplete: number;
  total: number;
}

export function getSessionSummary(
  annotations: AnnotationItem[],
): SessionSummary {
  const guideAnnotations = annotations.filter(
    (annotation) => annotation.source === "guide",
  );

  const reviewedAnnotations = guideAnnotations.filter((annotation) => {
    const ai = annotation.aiAnnotation;

    return ai !== null && ai.isCorrect !== null && ai.isCorrect !== undefined;
  });

  const samplesReviewed = reviewedAnnotations.length;

  const batchesReviewed = new Set(
    reviewedAnnotations
      .map((annotation) => annotation.aiAnnotation?.batchID)
      .filter((batchId): batchId is string => Boolean(batchId)),
  ).size;

  const predictionsCorrect = reviewedAnnotations.filter((annotation) => {
    const ai = annotation.aiAnnotation;

    return (
      ai !== null &&
      ai.isCorrect === true &&
      ai.spanFeedback === true &&
      ai.reasoningFeedback === true
    );
  }).length;

  const addedRules = reviewedAnnotations.flatMap(
    (annotation) => annotation.aiAnnotation?.guidelinesAdded ?? [],
  );

  const rulesCreated = new Set(addedRules).size;

  const sessionTimeMs = reviewedAnnotations.reduce(
    (total, annotation) =>
      total + (annotation.aiAnnotation?.timeToCompleteMs ?? 0),
    0,
  );

  return {
    samplesReviewed,
    predictionsCorrect,
    rulesCreated,
    sessionTimeMs,
    batchesReviewed,
  };
}

export function getUserFeedbackSummary(
  annotations: AnnotationItem[],
): UserFeedbackSummary {
  const guideAnnotations = annotations.filter(
    (annotation) => annotation.source === "guide",
  );

  let accepted = 0;
  let corrected = 0;

  for (const annotation of guideAnnotations) {
    const feedback = annotation.aiAnnotation;

    if (
      feedback?.isCorrect === true &&
      feedback.spanFeedback === true &&
      feedback.reasoningFeedback === true
    ) {
      accepted += 1;
      continue;
    }

    if (
      feedback?.isCorrect === false ||
      feedback?.spanFeedback === false ||
      feedback?.reasoningFeedback === false
    ) {
      corrected += 1;
    }
  }

  return {
    accepted,
    corrected,
    // There is no explicit skip event; the remainder has unfinished feedback.
    incomplete: guideAnnotations.length - accepted - corrected,
    total: guideAnnotations.length,
  };
}
