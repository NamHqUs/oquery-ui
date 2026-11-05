import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("validation feedback reserves fixed space above the editor in every state", () => {
  const component = readFileSync(new URL("./query-design.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./query-design.css", import.meta.url), "utf8");
  const feedback = component.indexOf('className="query-oquery-feedback"');
  const editor = component.indexOf("<OQueryEditor");
  assert.ok(feedback >= 0 && feedback < editor);
  const header = component.slice(feedback, editor);
  assert.match(header, /Loading OQuery/);
  assert.match(header, /Checking OQuery/);
  assert.match(header, /oqueryValidationMessage/);
  assert.match(header, /oqueryError/);
  assert.match(css, /\.query-oquery-feedback\s*\{[^}]*height:\s*52px;[^}]*overflow:\s*auto;/);
  assert.ok(!component.slice(editor).includes('className="query-oquery-valid"'));
  assert.match(component, /onBlur=\{onApplyOquery\}/);
  assert.match(component, /aria-busy=\{oqueryStatus === "applying"\}/);
  assert.ok(!component.includes('? "Checking…" : "Check OQuery"'));
});

test("OQuery results have a row-count-independent scroll viewport", () => {
  const css = readFileSync(new URL("../query-builder.css", import.meta.url), "utf8");
  assert.match(css, /\.query-builder-sections\.oquery-layout \.query-result-section\s*\{[^}]*height:\s*clamp\(320px, 60vh, 640px\);[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;/);
});
