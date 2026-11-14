import assert from "node:assert/strict";
import test from "node:test";
import { getOqueryFolds } from "./oquery-folding.ts";

const oquery = [
  "Entity: User",
  "Contexts:",
  "  Managers:",
  "    Entity: User",
  "    Projection:",
  "      - Id",
  "      - Name",
  "Relations:",
  "  - RefContext: Managers",
  "    JoinType: Left",
  "Page: 1",
].join("\n");

test("finds nested mappings, arrays, and relation items", () => {
  const folds = getOqueryFolds(oquery);
  assert.deepEqual(folds.map(fold => [fold.start, fold.end]),
    [[1, 6], [2, 6], [4, 6], [7, 9], [8, 9]]);
});

test("handles empty documents and ignores blank and comment-only headers", () => {
  assert.deepEqual(getOqueryFolds(""), []);
  assert.deepEqual(getOqueryFolds("# Contexts:\n  Name: value"), []);
  assert.deepEqual(getOqueryFolds("Contexts:\r\n  # comment\r\n  A:\r\n    Entity: User\r\nPage: 1")
    .map(fold => [fold.start, fold.end]), [[0, 3], [2, 3]]);
});
