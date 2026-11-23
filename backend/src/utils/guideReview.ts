import type { AnnotationItem } from "@common/types/annotations";
import type { Task } from "@common/types/tasks";

export function guideReviewError(task: Task, existing: AnnotationItem, payload: any): string | null {
  const labels = payload.labels;
  const allowed = new Set(task.labels.map((label) => label.name));
  const pendingSuggestion = existing.aiAnnotation?.isCorrect == null &&
    payload.aiAnnotation?.isCorrect === null && Array.isArray(labels) && labels.length === 0;
  if (pendingSuggestion) return null;
  if (!Array.isArray(labels) || !labels.length || new Set(labels).size !== labels.length ||
      labels.some((label) => typeof label !== "string" || !allowed.has(label)) ||
      (task.type === "Single-class" && labels.length !== 1)) {
    return "Choose a valid final label set for this guide example";
  }
  if (typeof payload.aiAnnotation?.isCorrect !== "boolean") {
    return "Confirm the prediction before continuing";
  }
  return null;
}
