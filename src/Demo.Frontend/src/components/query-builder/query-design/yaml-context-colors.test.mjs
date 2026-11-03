import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getYamlContextKeys } from "./yaml-context-colors.ts";

test("identifies context keys without coloring query property keys", () => {
  const text = "Entity: User\nContexts:\n  Managers:\n    Entity: User\n  Departments:\n    Entity: Department\n";
  const keys = getYamlContextKeys(text);
  assert.deepEqual(keys.map(key => text.slice(key.start, key.end)), ["Managers", "Departments"]);
});

test("all context keys use one CSS color different from schema keywords", () => {
  const css = readFileSync(new URL("./query-design.css", import.meta.url), "utf8");
  const contextColor = css.match(/\.query-yaml-context-key\s*\{[^}]*color:\s*([^;]+)/)?.[1];
  const keywordColor = css.match(/\.query-yaml-protected-key\s*\{[^}]*color:\s*([^;]+)/)?.[1];
  assert.ok(contextColor);
  assert.ok(keywordColor);
  assert.notEqual(contextColor, keywordColor);
  assert.equal(contextColor, "#f2c14e");
  const functionColor = css.match(/\.query-yaml-function\s*\{[^}]*color:\s*([^;]+)/)?.[1];
  const editorFunctionColor = css.match(/\.query-yaml-highlight \.query-yaml-function\s*\{[^}]*color:\s*([^;]+)/)?.[1];
  assert.equal(functionColor, "#7296c7");
  assert.equal(editorFunctionColor, functionColor);
  assert.notEqual(functionColor, contextColor);
  const component = readFileSync(new URL("./query-design.tsx", import.meta.url), "utf8");
  assert.ok(component.includes('<span class="query-yaml-context-key">${name}</span>'));
});

test("fold controls use arrow CSS and do not render plus/minus text", () => {
  const css = readFileSync(new URL("./query-design.css", import.meta.url), "utf8");
  assert.match(css, /\.query-yaml-line-numbers:hover \.query-yaml-gutter-line button/);
  assert.match(css, /\.query-yaml-gutter-line button\.collapsed/);
  assert.match(css, /button::before\s*\{[^}]*border-left/);
  const component = readFileSync(new URL("./query-design.tsx", import.meta.url), "utf8");
  assert.ok(component.includes('className={`query-yaml-fold-button${collapsed.has(line) ? " collapsed" : ""}`}'));
  assert.ok(!component.includes('}>{collapsed.has(line) ? "+" : "-"}</button>'));
});

test("supports quoted keys and incomplete editor input", () => {
  const text = 'Contexts:\n  "Manager: primary": {Entity: User}\n  Other:\n';
  const keys = getYamlContextKeys(text);
  assert.equal(text.slice(keys[0].start, keys[0].end), '"Manager: primary"');
  assert.equal(keys.length, 2);
  assert.deepEqual(getYamlContextKeys("Entity: User\nContexts:"), []);
});

test("highlights root and nested RefContext values like context definition names", () => {
  const text = [
    "Entity: User",
    "Relations:",
    "  - RefContext: Managers",
    "Contexts:",
    "  Managers:",
    "    Entity: User",
    "    Relations:",
    '      - RefContext: "Departments"',
    "  Departments: {Entity: Department}",
  ].join("\n");
  assert.deepEqual(getYamlContextKeys(text).map(key => text.slice(key.start, key.end)),
    ["Managers", "Managers", '"Departments"', "Departments"]);
});

test("highlights only RefContext values that map to a Contexts key", () => {
  const text = [
    "Relations:",
    "  - RefContext: Managers",
    "  - RefContext: Missing",
    "Contexts:",
    "  Managers: {Entity: User}",
  ].join("\n");
  assert.deepEqual(getYamlContextKeys(text).map(key => text.slice(key.start, key.end)),
    ["Managers", "Managers"]);
});

test("uses the same context color for projection references", () => {
  const text = [
    "Relations:",
    "  - RefContext: PatientVisits",
    "Contexts:",
    "  PatientVisits:",
    "    Entity: Visits",
    "    Projection:",
    "      - PatientVisits.ChronicVisits",
  ].join("\n");
  assert.deepEqual(getYamlContextKeys(text).map(key => text.slice(key.start, key.end)),
    ["PatientVisits", "PatientVisits", "PatientVisits"]);
});

test("supports flow-style references and does not highlight null references", () => {
  const text = 'Contexts: {Managers: {Entity: User}}\nRelations: [{RefContext: Managers}, {RefContext: Missing}, {RefContext: null}]';
  assert.deepEqual(getYamlContextKeys(text).map(key => text.slice(key.start, key.end)), ["Managers", "Managers"]);
});
