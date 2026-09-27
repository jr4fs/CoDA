import type { AnnotationItem } from "@common/types/annotations";

export interface SessionSummary {
  samplesReviewed: number;
  predictionsCorrect: number;
  rulesCreated: number;
  sessionTimeMs: number;
  batchesReviewed: number;
}

export function getSessionSummary(annotations: AnnotationItem[]): SessionSummary {
  const reviewed = annotations.filter(({ source, aiAnnotation }) =>
    source === "guide" && aiAnnotation?.isCorrect != null,
  );
  const samplesReviewed = reviewed.length;
  const batchesReviewed = new Set(
    reviewed
      .map(({ aiAnnotation }) => aiAnnotation?.batchID)
      .filter((batchId): batchId is string => Boolean(batchId)),
  ).size;
  const predictionsCorrect = reviewed.filter(({ aiAnnotation: ai }) => {
    return (
      ai?.isCorrect === true &&
      ai.spanFeedback === true &&
      ai.reasoningFeedback === true
    );
  }).length;
  const rulesCreated = new Set(
    reviewed.flatMap(({ aiAnnotation }) => aiAnnotation?.guidelinesAdded ?? []),
  ).size;
  const sessionTimeMs = reviewed.reduce(
    (total, { aiAnnotation }) => total + (aiAnnotation?.timeToCompleteMs ?? 0),
    0,
  );
  return { samplesReviewed, predictionsCorrect, rulesCreated, sessionTimeMs, batchesReviewed };
}
