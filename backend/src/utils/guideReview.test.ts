import { strict as assert } from "node:assert";
import { test } from "node:test";
import { guideReviewError } from "./guideReview";
import type { Task } from "@common/types/tasks";
import type { AnnotationItem } from "@common/types/annotations";

const task = { labels: [{ name: "positive" }, { name: "negative" }], type: "Single-class" } as Task;
const pending = { aiAnnotation: null } as AnnotationItem;

test("accepts an initial suggestion and a valid completed review", () => {
  assert.equal(guideReviewError(task, pending, { labels: [], aiAnnotation: { isCorrect: null } }), null);
  assert.equal(guideReviewError(task, pending, { labels: ["negative"], aiAnnotation: { isCorrect: false } }), null);
});

test("rejects invalid final reviews and does not replace a review with a pending suggestion", () => {
  assert.ok(guideReviewError(task, pending, { labels: ["other"], aiAnnotation: { isCorrect: true } }));
  assert.ok(guideReviewError(task, pending, { labels: ["positive"], aiAnnotation: { isCorrect: null } }));
  assert.ok(guideReviewError(task, { aiAnnotation: { isCorrect: true } } as AnnotationItem, { labels: [], aiAnnotation: { isCorrect: null } }));
});
