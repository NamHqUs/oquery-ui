import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

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

const { default: reducer, executeQuery, executeQueryFromText, executeContextFromText, clearQueryResult } =
  await import("./query-builder-slice.ts");

for (const action of [executeQuery, executeQueryFromText, executeContextFromText]) {
  test(`${action.typePrefix} retains displayed content while loading and replaces it on success`, () => {
    const result = { name: "Previous", columns: ["Id"], rows: [["1"]], totalRecords: 1 };
    const state = { ...reducer(undefined, { type: "init" }), result, sqlStatement: "SELECT 1", resultView: "sql" };
    const pending = reducer(state, { type: action.pending.type });
    assert.equal(pending.queryStatus, "loading");
    assert.deepEqual(pending.result, result);
    assert.equal(pending.sqlStatement, "SELECT 1");
    assert.equal(pending.resultView, "sql");
    const next = { ...result, name: "Next", rows: [["2"]] };
    const fulfilled = reducer(pending, { type: action.fulfilled.type, payload: next });
    assert.deepEqual(fulfilled.result, next);
    assert.equal(fulfilled.sqlStatement, null);
    assert.equal(fulfilled.resultView, "data");
    const rejected = reducer(pending, { type: action.rejected.type, payload: "Query failed", error: {} });
    assert.equal(rejected.result, null);
    assert.equal(rejected.sqlStatement, null);
    assert.equal(rejected.queryError, "Query failed");
    assert.equal(rejected.queryStatus, "failed");
    assert.equal(reducer(pending, clearQueryResult()).result, null);
  });
}
