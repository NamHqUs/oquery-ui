import assert from "node:assert/strict";
import test from "node:test";
import { toggleOqueryComments } from "./oquery-comments.ts";
import { normalizeOqueryEditorText } from "./oquery-editor-text.ts";

test("replaces only the current line and preserves its indentation", () => {
  const text = "Products:\n  WHERE Id = 1\nOrders:";
  const edit = toggleOqueryComments(text, 15, 15);
  assert.deepEqual(edit, {
    text: "Products:\n  # WHERE Id = 1\nOrders:",
    start: 10,
    end: 24,
    replacement: "  # WHERE Id = 1",
  });
});

test("uncomments an indented line", () => {
  const text = "Products:\n  # WHERE Id = 1";
  assert.equal(toggleOqueryComments(text, text.length, text.length).text,
    "Products:\n  WHERE Id = 1");
});

test("toggles only the cursor line within a multiline context", () => {
  const text = "Products:\n  WHERE Id = 1\n  TAKE 10\nOrders:";
  const position = text.indexOf("TAKE");
  const commented = toggleOqueryComments(text, position, position);
  assert.equal(commented.text, "Products:\n  WHERE Id = 1\n  # TAKE 10\nOrders:");
  assert.equal(commented.replacement, "  # TAKE 10");
  const nextPosition = commented.text.indexOf("TAKE");
  assert.equal(toggleOqueryComments(commented.text, nextPosition, nextPosition).text, text);
});

test("toggles explicitly selected lines without including the next line", () => {
  const text = "Products:\n  WHERE Id = 1\n  TAKE 10\nOrders:";
  const commented = toggleOqueryComments(text, 10, text.indexOf("Orders:"));
  assert.equal(commented.text, "Products:\n  # WHERE Id = 1\n  # TAKE 10\nOrders:");
  assert.equal(commented.replacement, "  # WHERE Id = 1\n  # TAKE 10");
  assert.equal(toggleOqueryComments(commented.text, 10, commented.text.indexOf("Orders:")).text, text);
});

test("leaves blank lines unchanged", () => {
  const text = "Products:\n  \nOrders:";
  assert.equal(toggleOqueryComments(text, 10, 10).text, text);
  assert.equal(toggleOqueryComments("", 0, 0).text, "");
});

test("comments the first empty line without skipping to the next line", () => {
  const text = "\nProducts:";
  assert.equal(toggleOqueryComments(text, 0, 0).text, text);
  assert.equal(toggleOqueryComments(text, 0, text.length).start, 0);
  assert.equal(toggleOqueryComments(text, 0, text.length).text, "\n# Products:");
});

test("first comment on CRLF-bound text preserves the next context and indentation", () => {
  const lines = [
    "User: Id, Name, Ref1.Name Manager1, Ref2.ManagerName Manager2",
    "  Inner Join Ref1 On ManagerId = Ref1.Id",
    "  Inner Join Ref2 On ManagerId = Ref2.Id",
    "Ref1 is User: Id, Name",
    "Ref2 is User: Id, Name, Ref1.Name ManagerName",
    "  Inner Join Ref1 On ManagerId = Ref1.Id",
  ];
  const text = normalizeOqueryEditorText(lines.join("\r\n"));
  const position = text.indexOf("Inner Join Ref2");
  const edit = toggleOqueryComments(text, position, position);
  assert.equal(edit.text, lines.map((line, index) => index === 2
    ? "  # Inner Join Ref2 On ManagerId = Ref2.Id"
    : line).join("\n"));
  assert.equal(text.slice(0, edit.start) + edit.replacement + text.slice(edit.end), edit.text);
});

test("editor line endings match textarea normalization without trimming whitespace", () => {
  assert.equal(normalizeOqueryEditorText("  User:\r\n\r  Ref1:\r\n"), "  User:\n\n  Ref1:\n");
  assert.equal(normalizeOqueryEditorText("  User:\n\n"), "  User:\n\n");
});
