import assert from "node:assert/strict";
import test from "node:test";
import { getYamlFolds, getFoldedYaml, applyFoldedYamlEdit } from "./yaml-folding.ts";

const yaml = [
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
  const folds = getYamlFolds(yaml);
  assert.deepEqual(folds.map(fold => [fold.start, fold.end]),
    [[1, 6], [2, 6], [4, 6], [7, 9], [8, 9]]);
});

test("folding preserves original source line numbers and never changes YAML", () => {
  const view = getFoldedYaml(yaml, new Set([1]));
  assert.deepEqual(view.visible.map(row => row.line), [0, 1, 7, 8, 9, 10]);
  assert.ok(!view.text.includes("Projection"));
  assert.equal(applyFoldedYamlEdit(yaml, new Set([1]), view.text), yaml);
  assert.equal(getFoldedYaml(yaml, new Set()).text, yaml);
});

test("collapsing every fold keeps each fold header visible", () => {
  const collapsed = new Set(getYamlFolds(yaml).map(fold => fold.start));
  assert.deepEqual(getFoldedYaml(yaml, collapsed).visible.map(row => row.line), [0, 1, 7, 10]);
});

test("visible edits preserve hidden mappings and arrays", () => {
  const collapsed = new Set([1, 7]);
  const view = getFoldedYaml(yaml, collapsed);
  const changed = applyFoldedYamlEdit(yaml, collapsed, view.text.replace("Page: 1", "Page: 2"));
  assert.equal(changed, yaml.replace("Page: 1", "Page: 2"));
  assert.equal(applyFoldedYamlEdit(yaml, collapsed, view.text.replace("User", "Users")),
    yaml.replace("User", "Users"));
});

test("edits spanning hidden content are rejected instead of deleting it", () => {
  const collapsed = new Set([1]);
  const view = getFoldedYaml(yaml, collapsed);
  assert.equal(applyFoldedYamlEdit(yaml, collapsed,
    view.text.replace("Contexts:\nRelations:", "Other:")), null);
});

test("handles empty documents, trailing lines, comments, and CRLF", () => {
  assert.deepEqual(getYamlFolds(""), []);
  assert.equal(applyFoldedYamlEdit("", new Set(), "Entity: User"), "Entity: User");
  assert.equal(getFoldedYaml("Entity: User\n", new Set()).text, "Entity: User\n");
  const value = "Contexts:\r\n  # comment\r\n  A:\r\n    Entity: User\r\nPage: 1";
  assert.equal(getFoldedYaml(value, new Set([0])).text, "Contexts:\r\nPage: 1");
});
