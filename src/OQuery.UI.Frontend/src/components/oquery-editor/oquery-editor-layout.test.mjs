// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { readFileSync } from "node:fs";
  const css = readFileSync(new URL("../reports/reports.css", import.meta.url), "utf8");
  const highlightRule = css.match(/\.new-home-example-editor \.query-oquery-highlight\s*\{([^}]*)\}/)?.[1];
  assert.ok(highlightRule, "The home editor must override static example styling.");
  assert.match(highlightRule, /(?:^|;)\s*margin:\s*0\s*(?:;|$)/);
  assert.match(highlightRule, /(?:^|;)\s*border-left:\s*0\s*(?:;|$)/);
});
