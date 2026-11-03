import assert from "node:assert/strict";
import { test } from "node:test";

import { createDemoBaseline } from "./demoBaseline";

test("demo reference uses the most common label without model predictions", () => {
  const result = createDemoBaseline([
    { text: "A", label: "positive" },
    { text: "B", label: "positive" },
    { text: "C", label: "negative" },
    { text: "D", label: "positive, negative" },
  ], "text", "label", ["positive", "negative"]);

  assert.equal(result?.numSamples, 4);
  assert.equal(result?.wrongPredictions, 2);
  assert.equal(result?.accuracy, 0.5);
  assert.equal(result?.perLabel?.positive.tp, 3);
  assert.equal(result?.perLabel?.negative.fn, 2);
  assert.equal(result?.macroF1, 3 / 7);
});

test("demo reference is unavailable without usable rows", () => {
  assert.equal(createDemoBaseline([{ text: "", label: "positive" }], "text", "label", ["positive"]), undefined);
  assert.equal(createDemoBaseline([{ text: "A", label: "other" }], "text", "label", ["positive"]), undefined);
});
