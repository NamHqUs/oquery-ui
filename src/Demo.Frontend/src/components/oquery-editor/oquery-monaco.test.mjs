import assert from "node:assert/strict";
import test from "node:test";
import { getOqueryEnterEdit } from "./oquery-editor-enter.ts";
import {
  contextNameAtLine,
  getMinimalTextEdit,
  getOqueryContextLenses,
  getOqueryErrorRange,
  getOqueryFoldingRanges,
  toMonacoCompletionInsert,
} from "./oquery-monaco-adapters.ts";
import { getOqueryMonarchLanguage } from "./oquery-monaco-language.ts";

test("completion inserts escape snippet syntax and place the caret stop where requested", () => {
  assert.deepEqual(toMonacoCompletionInsert({ label: "Name", kind: "field", insertText: "Name" }),
    { insertText: "Name", isSnippet: false });
  assert.deepEqual(toMonacoCompletionInsert({ label: "Sum", kind: "function", insertText: "Sum($ })", cursorOffset: 4 }),
    { insertText: "Sum($0\\$ \\})", isSnippet: true });
});

test("minimal edits replace only the changed middle section", () => {
  assert.equal(getMinimalTextEdit("Entity: User", "Entity: User"), null);
  assert.deepEqual(getMinimalTextEdit("Entity: User\nPage: 1", "Entity: User\nPage: 2"),
    { start: 19, end: 20, text: "2" });
  assert.deepEqual(getMinimalTextEdit("ab", "abc"), { start: 2, end: 2, text: "c" });
});

test("folding ranges are 1-based and comment headers do not start folds", () => {
  assert.deepEqual(getOqueryFoldingRanges("Contexts:\n  A:\n    Entity: User\n# Page:\n  x: 1"),
    [{ start: 1, end: 3 }, { start: 2, end: 3 }]);
});

test("context lenses are found for every context header line", () => {
  assert.deepEqual(getOqueryContextLenses("Entity: User\nManagers is Employees:"),
    [{ lineNumber: 1, contextName: "Entity" }, { lineNumber: 2, contextName: "Managers" }]);
  assert.equal(contextNameAtLine("  Projection:"), "Projection");
});

test("error ranges use the 1-based position reported by validation", () => {
  assert.deepEqual(getOqueryErrorRange({ line: 2, column: 5, length: 3 }), {
    startLineNumber: 2,
    startColumn: 5,
    endLineNumber: 2,
    endColumn: 8,
  });
});

test("function highlighting lists longer names first so a shorter prefix cannot win", () => {
  const language = getOqueryMonarchLanguage(["Avg", "AverageAll", "Avg"]);
  const functionRule = language.tokenizer.root.find(([, token]) => token === "function");
  assert.match(functionRule[0].source, /\(AverageAll\|Avg\)/);
  assert.equal(language.tokenizer.root.some(([, token]) => token === "function"), true);
  assert.equal(getOqueryMonarchLanguage([]).tokenizer.root.some(([, token]) => token === "function"), false);
});

test("Enter inside a list section starts a new list item with the same indentation", () => {
  const value = "Projection:\n  - Id";
  const edit = getOqueryEnterEdit(value, value.length, value.length);
  assert.equal(edit.value, "Projection:\n  - Id\n  - ");
  assert.equal(edit.caret, edit.value.length);
});

test("Enter on an empty list item removes the marker and outdents", () => {
  const value = "Projection:\n  -";
  const edit = getOqueryEnterEdit(value, value.length, value.length);
  assert.equal(edit.value, "Projection:\n");
});
