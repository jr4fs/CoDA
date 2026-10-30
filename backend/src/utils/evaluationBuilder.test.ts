import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocateQuotas,
  labelCounts,
  validateReview,
} from "./evaluationBuilder";
import type {
  EvaluationRecord,
  EvaluationRound,
} from "@common/types/evaluationBuilder";
import { parseEvaluationLabels } from "@common/utils/evaluationLabels";

const labels = [
  { name: "Explicit", definition: "Direct mention", keywords: [] },
  {
    name: "None",
    definition: "No interaction",
    keywords: [],
    requiresEvidence: false,
  },
];
const record: EvaluationRecord = {
  recordId: "r0",
  text: "A 😀 lawyer",
  sampleContent: {},
  labels: ["Explicit"],
  spans: [{ label: "Explicit", start: 5, end: 11, text: "lawyer" }],
  reviewed: true,
};

test("zero-count seeding and inverse quotas preserve the round budget", () => {
  assert.deepEqual(allocateQuotas({ A: 0, B: 0, C: 0 }, 20, 10), {
    A: 4,
    B: 3,
    C: 3,
  });
  const inverse = allocateQuotas({ A: 0, B: 4, C: 20 }, 20, 10);
  assert.equal(inverse.A, 8);
  assert.equal(inverse.B, 2);
  assert.equal(inverse.C, undefined);
  for (let size = 1; size < 30; size++)
    assert.equal(
      Object.values(allocateQuotas({ A: 2, B: 0, C: 7 }, 20, size)).reduce(
        (a, b) => a + b,
        0,
      ),
      size,
    );
});
test("seed slots rotate when there are more labels than slots", () => {
  const first = allocateQuotas({ A: 0, B: 0, C: 0 }, 20, 2);
  const second = allocateQuotas({ A: 0, B: 0, C: 0 }, 20, 2, first);
  assert.equal(second.C, 1);
});
test("spans use exact UTF-16 offsets and label-specific evidence", () => {
  assert.equal(validateReview(record, labels, false), null);
  assert.match(
    validateReview({ ...record, spans: [] }, labels, false)!,
    /Highlight evidence/,
  );
  assert.equal(
    validateReview({ ...record, labels: ["None"], spans: [] }, labels, false),
    null,
  );
  assert.match(
    validateReview(
      { ...record, spans: [{ ...record.spans[0], start: 4 }] },
      labels,
      false,
    )!,
    /does not match/,
  );
  assert.match(
    validateReview({ ...record, labels: ["Explicit", "None"] }, labels, true)!,
    /exactly one/,
  );
  assert.match(
    validateReview(
      { ...record, spans: [...record.spans, ...record.spans] },
      labels,
      false,
    )!,
    /Duplicate/,
  );
  assert.match(
    validateReview(
      {
        ...record,
        spans: [
          {
            label: "Explicit",
            start: 2,
            end: 3,
            text: record.text.slice(2, 3),
          },
        ],
      },
      labels,
      false,
    )!,
    /splits a character/,
  );
});
test("only completed rounds count, with multi-label hits counted once each", () => {
  const complete: EvaluationRound = {
    taskId: "test",
    number: 1,
    revision: 0,
    status: "complete",
    records: [{ ...record, labels: ["Explicit", "None"] }],
    quotas: {},
    createdAt: "",
  };
  assert.deepEqual(
    labelCounts(labels, [complete, { ...complete, status: "draft" }]),
    { Explicit: 1, None: 1 },
  );
});
test("JSON labels round-trip commas, while legacy comma exports still parse", () => {
  assert.deepEqual(parseEvaluationLabels('["Legal, direct","None"]'), [
    "Legal, direct",
    "None",
  ]);
  assert.deepEqual(parseEvaluationLabels("Explicit, None"), [
    "Explicit",
    "None",
  ]);
});
