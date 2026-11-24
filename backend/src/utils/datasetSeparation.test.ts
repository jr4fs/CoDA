import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findIdColumn, separateDatasets } from "./datasetSeparation";

test("detects an unambiguous ID column", () => {
  assert.equal(findIdColumn(["text", "ID", "user_id"]), "ID");
  assert.equal(findIdColumn(["text", "record_id"]), "record_id");
  assert.throws(() => findIdColumn(["text", "user_id", "post_id"]));
  assert.throws(() => findIdColumn(["text", "valid"]));
});

test("removes all matching IDs and preserves rows with missing IDs", () => {
  const result = separateDatasets("id,text\na,one\na,two\nb,three\n,unknown", "key,label\na,yes\n,unknown", "id", "key");
  assert.equal(result.removed, 2);
  assert.equal(result.missingAll, 1);
  assert.equal(result.missingVal, 1);
  assert.match(result.csv, /b,three/);
  assert.match(result.csv, /,unknown/);
});

test("rejects missing ID columns and datasets with no remaining rows", () => {
  assert.throws(() => separateDatasets("id,text\na,one", "key,label\na,yes", "missing", "key"));
  assert.throws(() => separateDatasets("id,text\na,one", "key,label\na,yes", "id", "key"));
});

test("preserves all rows when IDs do not overlap", () => {
  const result = separateDatasets('id,text\n001,"note, one"\n002,second', "id,label\n003,yes", "id", "id");
  assert.equal(result.removed, 0);
  assert.equal(result.missingAll, 0);
  assert.match(result.csv, /001,"note, one"/);
  assert.match(result.csv, /002,second/);
});

test("excludes known held-out row positions even when IDs are missing", () => {
  const result = separateDatasets("id,text\n,held out\n,keep\na,other", "id,label\n,yes", "id", "id", [0]);
  assert.equal(result.removed, 1);
  assert.doesNotMatch(result.csv, /held out/);
  assert.match(result.csv, /,keep/);
});
