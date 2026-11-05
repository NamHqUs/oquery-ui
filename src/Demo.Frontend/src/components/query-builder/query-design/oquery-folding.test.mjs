import assert from "node:assert/strict";
import test from "node:test";
import { getOqueryFolds, getFoldedOquery, applyFoldedOqueryEdit } from "./oquery-folding.ts";

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

test("folding preserves original source line numbers and never changes OQUERY", () => {
  const view = getFoldedOquery(oquery, new Set([1]));
  assert.deepEqual(view.visible.map(row => row.line), [0, 1, 7, 8, 9, 10]);
  assert.ok(!view.text.includes("Projection"));
  assert.equal(applyFoldedOqueryEdit(oquery, new Set([1]), view.text), oquery);
  assert.equal(getFoldedOquery(oquery, new Set()).text, oquery);
});

test("backspace edits work normally when no lines are collapsed", () => {
  const value = "User: Id, Name";
  assert.equal(applyFoldedOqueryEdit(value, new Set(), "User: Id, Nam"), "User: Id, Nam");
});

test("collapsing every fold keeps each fold header visible", () => {
  const collapsed = new Set(getOqueryFolds(oquery).map(fold => fold.start));
  assert.deepEqual(getFoldedOquery(oquery, collapsed).visible.map(row => row.line), [0, 1, 7, 10]);
});

test("visible edits preserve hidden mappings and arrays", () => {
  const collapsed = new Set([1, 7]);
  const view = getFoldedOquery(oquery, collapsed);
  const changed = applyFoldedOqueryEdit(oquery, collapsed, view.text.replace("Page: 1", "Page: 2"));
  assert.equal(changed, oquery.replace("Page: 1", "Page: 2"));
  assert.equal(applyFoldedOqueryEdit(oquery, collapsed, view.text.replace("User", "Users")),
    oquery.replace("User", "Users"));
});

test("edits spanning hidden content are rejected instead of deleting it", () => {
  const collapsed = new Set([1]);
  const view = getFoldedOquery(oquery, collapsed);
  assert.equal(applyFoldedOqueryEdit(oquery, collapsed,
    view.text.replace("Contexts:\nRelations:", "Other:")), null);
});

test("handles empty documents, trailing lines, comments, and CRLF", () => {
  assert.deepEqual(getOqueryFolds(""), []);
  assert.equal(applyFoldedOqueryEdit("", new Set(), "Entity: User"), "Entity: User");
  assert.equal(getFoldedOquery("Entity: User\n", new Set()).text, "Entity: User\n");
  const value = "Contexts:\r\n  # comment\r\n  A:\r\n    Entity: User\r\nPage: 1";
  assert.equal(getFoldedOquery(value, new Set([0])).text, "Contexts:\r\nPage: 1");
});
