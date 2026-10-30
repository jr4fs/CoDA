import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadAnalysis, loadAnalysisRecords, parsePredictedLabels, summarizeAnalysis } from "./dataAnalysis";

const temporary = mkdtempSync(path.join(os.tmpdir(), "data-analysis-test-"));
after(async () => fs.rm(temporary, { recursive: true, force: true }));

test("parses JSON and legacy pipe-delimited predictions without combining labels", () => {
  const labels = ["Legal", "Health", "Neither"];
  assert.deepEqual(parsePredictedLabels({ generated_labels_json: '["Legal","Health"]', generated_label: "Legal|Health" }, labels), ["Legal", "Health"]);
  assert.deepEqual(parsePredictedLabels({ generated_label: "legal|HEALTH|Legal" }, labels), ["Legal", "Health"]);
  assert.deepEqual(parsePredictedLabels({ generated_label: "ERROR" }, labels), []);
  assert.deepEqual(parsePredictedLabels({ generated_label: "unknown" }, labels), []);
});

test("summarizes D_all before inference and predicted multi-label prevalence afterward", async () => {
  const rawPath = path.join(temporary, "raw.csv");
  const outputPath = path.join(temporary, "output.csv");
  await fs.writeFile(rawPath, "Youth ID,Date,translated_text\nA,2026-01-01,First\nA,2026-01-02,Second\nB,2026-02-01,Third\n,2026-02-02,Fourth\n", "utf8");
  await fs.writeFile(outputPath, 'Youth ID,Date,translated_text,generated_label,generated_labels_json\nA,2026-01-01,First,Legal|Health,"[""Legal"",""Health""]"\nA,2026-01-02,Second,Legal,"[""Legal""]"\nB,2026-02-01,Third,ERROR,[]\n,2026-02-02,Fourth,Neither,"[""Neither""]"\n', "utf8");
  const names = ["Legal", "Health", "Neither"];
  const raw = await loadAnalysis(rawPath, names, "translated_text", false);
  const pending = summarizeAnalysis(raw, null);
  assert.equal(pending.source, "d_all");
  assert.equal(pending.predictionStatus, "pending");
  assert.equal(pending.overview.totalEntries, 4);
  assert.equal(pending.overview.uniqueIds, 2);
  assert.equal(pending.overview.missingIds, 1);
  assert.deepEqual(pending.distribution, []);

  const inferred = await loadAnalysis(outputPath, names, "translated_text", true);
  const ready = summarizeAnalysis(raw, inferred, { label: "Legal", pageSize: 1 });
  assert.equal(ready.predictionStatus, "ready");
  assert.equal(ready.classifiedCount, 3);
  assert.equal(ready.multiLabelCount, 1);
  assert.equal(ready.unclassifiedCount, 1);
  assert.deepEqual(ready.distribution.map(({ label, count }) => [label, count]), [["Legal", 2], ["Health", 1], ["Neither", 1]]);
  assert.equal(ready.distribution[0].proportion, 2 / 3);
  assert.equal(ready.totalIds, 1);
  assert.equal(ready.ids[0].id, "A");
  assert.equal(ready.overTime.length, 2);
  assert.equal(ready.overTime[0].counts.Legal, 2);
  const details = await loadAnalysisRecords(outputPath, inferred.columns, "A", names, true);
  assert.equal(details.length, 2);
  assert.deepEqual(details[0].labels, ["Legal", "Health"]);
  assert.equal(details[0].text, "First");
});
