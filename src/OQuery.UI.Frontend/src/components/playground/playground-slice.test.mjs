import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "vitest";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith("/const/api-urls")) {
      return {
        url: "data:text/javascript,export const apiUrls = {};",
        shortCircuit: true,
      };
    }
    if (specifier === "./api-error") return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const { default: reducer, executeContextFromText, executeQueryFromText, clearInlineResult } = await import("./playground-slice.ts");

test("whole-text run keys its result by the entry context name returned by the API", () => {
  const meta = { arg: { text: "Customer:\nId", projectId: "p1", domainId: "d1" } };
  const pending = reducer(undefined, { type: executeQueryFromText.pending.type, meta });
  assert.equal(pending.run.status, "running");
  const result = { name: "Customer", columns: ["Id"], rows: [["1"]], totalRecords: 1 };
  const fulfilled = reducer(pending, { type: executeQueryFromText.fulfilled.type, meta, payload: { result, sql: "SELECT 1" } });
  assert.deepEqual(fulfilled.inlineResults.Customer, { status: "succeeded", result, sql: "SELECT 1", error: "" });
  assert.equal(fulfilled.run.status, "idle");
  const rejected = reducer(pending, { type: executeQueryFromText.rejected.type, meta, payload: "No entry point", error: {} });
  assert.deepEqual(rejected.run, { status: "failed", error: "No entry point" });
  assert.deepEqual(rejected.inlineResults, {});
});

test("inline context run retains the displayed result while loading and replaces it on success", () => {
  const previous = { name: "Previous", columns: ["Id"], rows: [["1"]], totalRecords: 1 };
  const meta = { arg: { text: "Managers", context: "Managers", projectId: "p1", domainId: "d1" } };
  const state = {
    ...reducer(undefined, { type: "init" }),
    inlineResults: { Managers: { status: "succeeded", result: previous, sql: "SELECT 1", error: "" } },
  };
  const pending = reducer(state, { type: executeContextFromText.pending.type, meta });
  assert.equal(pending.inlineResults.Managers.status, "loading");
  assert.deepEqual(pending.inlineResults.Managers.result, previous);
  assert.equal(pending.inlineResults.Managers.sql, "SELECT 1");
  const next = { ...previous, name: "Next", rows: [["2"]] };
  const fulfilled = reducer(pending, { type: executeContextFromText.fulfilled.type, meta, payload: { result: next, sql: null } });
  assert.deepEqual(fulfilled.inlineResults.Managers, { status: "succeeded", result: next, sql: null, error: "" });
  const rejected = reducer(pending, { type: executeContextFromText.rejected.type, meta, payload: "Query failed", error: {} });
  assert.deepEqual(rejected.inlineResults.Managers, { status: "failed", result: previous, sql: "SELECT 1", error: "Query failed" });
  assert.deepEqual(reducer(pending, clearInlineResult("Managers")).inlineResults, {});
});
