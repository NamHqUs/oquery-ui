import assert from "node:assert/strict";
import test from "node:test";
import { formatApiError } from "./api-error.ts";

const fallback = "Query request failed (400).";

test("shows every validation error with a readable context and field", () => {
  const message = formatApiError(JSON.stringify({
    title: "One or more validation errors occurred.",
    status: 400,
    errors: {
      "Contexts[0].Value.Sorts": ["The Sorts field is required."],
      "Contexts[1].Value.Sorts": ["The Sorts field is required."],
    },
    traceId: "internal-trace",
  }), fallback);
  assert.equal(message, [
    "The query request contains invalid values. Correct the fields below and try again.",
    "- Context 1 > Sorts: The Sorts field is required.",
    "- Context 2 > Sorts: The Sorts field is required.",
  ].join("\n"));
});

test("retains validation errors alongside server detail and named context paths", () => {
  const message = formatApiError(JSON.stringify({
    detail: "Unable to save this query.",
    errors: {
      "Contexts.Managers.Entity": ["Unknown entity.", "Choose an available entity."],
      "$.pageSize": "Must be greater than zero.",
    },
  }), fallback);
  assert.match(message, /Unable to save this query/);
  assert.match(message, /Context "Managers" > Entity: Unknown entity/);
  assert.match(message, /Choose an available entity/);
  assert.match(message, /pageSize: Must be greater than zero/);
});

test("preserves server details, titles, and plain-text or JSON-string errors", () => {
  assert.equal(formatApiError('{"detail":"Unknown field [Missing].","title":"Bad request"}', fallback),
    "Unknown field [Missing].");
  assert.equal(formatApiError('{"title":"Connection unavailable"}', fallback), "Connection unavailable");
  assert.equal(formatApiError("Entity cannot be changed.", fallback), "Entity cannot be changed.");
  assert.equal(formatApiError('"Invalid query."', fallback), "Invalid query.");
});

test("uses a useful fallback for empty, HTML, and unrecognized error bodies", () => {
  for (const body of ["", " ", "null", "[]", "123", "{}", "<html>Bad gateway</html>"]) {
    assert.equal(formatApiError(body, fallback), fallback);
  }
});

test("handles malformed validation entries without losing valid errors", () => {
  const message = formatApiError(JSON.stringify({
    errors: { Entity: [null, 42, "", "Required.", "Required."] },
  }), fallback);
  assert.equal(message.split("\n").filter((line) => line.startsWith("- ")).length, 1);
  assert.match(message, /Entity: Required/);
});
