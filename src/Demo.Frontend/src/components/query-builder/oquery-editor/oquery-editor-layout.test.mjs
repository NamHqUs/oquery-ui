import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("home OQuery highlighting resets example margins to align with the textarea caret", () => {
  const css = readFileSync(new URL("../../reports/reports.css", import.meta.url), "utf8");
  const highlightRule = css.match(/\.new-home-example-editor \.query-oquery-highlight\s*\{([^}]*)\}/)?.[1];
  assert.ok(highlightRule, "The home editor must override static example styling.");
  assert.match(highlightRule, /(?:^|;)\s*margin:\s*0\s*(?:;|$)/);
  assert.match(highlightRule, /(?:^|;)\s*border-left:\s*0\s*(?:;|$)/);
});
