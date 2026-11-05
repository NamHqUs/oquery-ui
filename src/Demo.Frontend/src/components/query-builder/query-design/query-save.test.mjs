import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith("/const/api-urls")) {
      return {
        url: `data:text/javascript,${encodeURIComponent('export const apiUrls = { queryRequests: { create: "/query-request", byId: id => "/query-request/" + id } };')}`,
        shortCircuit: true,
      };
    }
    if (specifier === "./api-error") return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const { fromApiQueryDefinition, saveQueryRequest, toQueryBuilderSavedView, fromApiQuery } =
  await import("./query-builder-slice.ts");

test("saving, reloading, and saving again preserve null and explicit joins", async (t) => {
  for (const joinType of [null, 0, 1, 2, 3]) {
    const definition = fromApiQueryDefinition({
      entity: "User",
      projection: [],
      relations: [{ refContext: "Managers", joinType }],
      contexts: {
        Managers: {
          entity: "User",
          projection: [],
          relations: [{ refContext: "Departments", joinType }],
        },
        Departments: { entity: "Department", projection: [] },
      },
    });
    const payloads = [];
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      const payload = JSON.parse(options.body);
      payloads.push(payload);
      return new Response(JSON.stringify({ ...payload, id: "saved" }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const save = (query) => saveQueryRequest({ name: "Saved joins", definition: query })(
      () => {}, () => ({}), undefined,
    );
    const first = await save(definition);
    assert.equal(first.type, saveQueryRequest.fulfilled.type);
    const view = toQueryBuilderSavedView(first.payload);
    const second = await save(fromApiQuery(view.query, view.projectionRows));
    assert.equal(second.type, saveQueryRequest.fulfilled.type);
    for (const payload of payloads) {
      assert.equal(payload.joins[0].joinType, joinType);
      assert.equal(payload.contexts.Managers.joins[0].joinType, joinType);
    }
    t.mock.restoreAll();
  }
});
