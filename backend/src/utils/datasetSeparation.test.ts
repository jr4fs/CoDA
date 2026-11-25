import { strict as assert } from "node:assert";
import { test } from "node:test";
import { separateDatasets } from "./datasetSeparation";

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

test("removes matching case notes despite different IDs and whitespace", () => {
  const result = separateDatasets('id,note\na,"A  case note"\nb,"A case note"\nc,Other\nd,', 'id,note\nz," A case note "\ny,', "note", "note", [], true);
  assert.equal(result.removed, 2);
  assert.equal(result.missingAll, 1);
  assert.equal(result.missingVal, 1);
  assert.match(result.csv, /c,Other/);
  assert.doesNotMatch(result.csv, /case note/);
});

test("does not remove a different note just because IDs match", () => {
  const result = separateDatasets("id,note\na,First\nb,Second", "id,note\na,Different", "note", "note", [], true);
  assert.equal(result.removed, 0);
  assert.match(result.csv, /a,First/);
});

test("filters review and full datasets independently against the same D_val", () => {
  const val = "note,label\nShared,yes";
  const review = separateDatasets("note\nShared\nReview only", val, "note", "note", [], true);
  const full = separateDatasets("note\nShared\nReview only\nOutside review", val, "note", "note", [], true);
  assert.doesNotMatch(review.csv, /Shared/);
  assert.doesNotMatch(full.csv, /Shared/);
  assert.doesNotMatch(review.csv, /Outside review/);
  assert.match(full.csv, /Outside review/);
});
