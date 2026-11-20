import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allScalarApplyFor } from "../components/function-definition/types";

// Each test reloads the services so their module-level caches start empty.
async function loadServices() {
  return {
    connection: await import("./database-connection-service"),
    schema: await import("./db-schema-service"),
    project: await import("./project-service"),
    dynamic: await import("./dynamic-query-service"),
    query: await import("./query-service"),
    functions: await import("./function-definition-service"),
    dataSource: await import("./data-source-service"),
  };
}

type Services = Awaited<ReturnType<typeof loadServices>>;
type FetchCall = { url: string; init?: RequestInit };

// `undefined` replies with 204 No Content; `text` replies with a plain-text body.
function respond(body: unknown, status = 200, text = false) {
  if (body === undefined) return new Response(null, { status: 204 });
  if (text) return new Response(String(body), { status });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(reply: (url: string, init?: RequestInit) => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return reply(url, init);
  });
  return calls;
}

const domainResponse = { id: "d1", name: "Demo", description: "", entities: [], relations: [], canDelete: true, isBuiltin: false };
const functionDefinition = { name: "Upper", arguments: [{ name: "x", dataType: "string" }] };

type Endpoint = {
  name: string;
  method: string;
  url: string;
  reply?: unknown;
  text?: boolean;
  call: (s: Services) => Promise<unknown>;
};

// Every endpoint used by the frontend services, with its expected method, URL and a valid reply.
const endpoints: Endpoint[] = [
  { name: "getConnectionOptions", method: "GET", url: "/db/connections",
    reply: { providers: ["Db2"] },
    call: (s) => s.connection.getConnectionOptions() },
  { name: "getProvider", method: "GET", url: "/db/connections/provider", reply: "Db2",
    call: (s) => s.connection.getProvider() },
  { name: "connect", method: "PUT", url: "/db/connection", reply: { provider: "Db2" },
    call: (s) => s.connection.connect({ provider: "Db2", connectionString: "Server=x" }) },
  { name: "disconnect", method: "POST", url: "/db/disconnect", call: (s) => s.connection.disconnect() },
  { name: "getSchema", method: "GET", url: "/db/schema", reply: { tables: [], relationships: [] },
    call: (s) => s.schema.getSchema() },
  { name: "getTablePreview", method: "GET", url: "/db/data/Users?schema=dbo&limit=10",
    reply: { name: "Users", columns: ["Id"], rows: [["1"]] },
    call: (s) => s.schema.getTablePreview("Users", "dbo") },
  { name: "listDomainNames", method: "GET", url: "/metadata/projects/p1/domains/names",
    reply: [{ id: "d1", name: "Demo" }],
    call: (s) => s.project.listDomainNames("p1") },
  { name: "getDomainConfig", method: "GET", url: "/metadata/projects/p1/domains/d1", reply: domainResponse,
    call: (s) => s.project.getDomainConfig("p1", "d1") },
  { name: "createDomain", method: "POST", url: "/metadata/projects/p1/domains", reply: { id: "d1" },
    call: (s) => s.project.createDomain("p1", { name: "Demo" }) },
  { name: "updateDomain", method: "PUT", url: "/metadata/projects/p1/domains/d1", reply: domainResponse,
    call: (s) => s.project.updateDomain("p1", "d1", { name: "Demo" }) },
  { name: "deleteDomain", method: "DELETE", url: "/metadata/projects/p1/domains/d1", call: (s) => s.project.deleteDomain("p1", "d1") },
  { name: "executeDefinition", method: "POST", url: "/dynamic-query/query?projectId=p1&domainId=d1", reply: { rows: [] },
    call: (s) => s.dynamic.executeDefinition({}, "p1", "d1") },
  { name: "executeOQueryText", method: "POST", url: "/dynamic-query/query/from-text?projectId=p1&domainId=d1", reply: { rows: [] },
    call: (s) => s.dynamic.executeOQueryText("Users:", "p1", "d1") },
  { name: "executeOQueryContext", method: "POST", url: "/dynamic-query/query/from-text/Managers?projectId=p1&domainId=d1", reply: { rows: [] },
    call: (s) => s.dynamic.executeOQueryContext("Managers:", "Managers", "p1", "d1") },
  { name: "definitionToSql", method: "POST", url: "/dynamic-query/query/to-string?projectId=p1&domainId=d1", reply: "SELECT 1", text: true,
    call: (s) => s.dynamic.definitionToSql({}, "p1", "d1") },
  { name: "oqueryTextToSql", method: "POST", url: "/dynamic-query/query/to-string-from-text?projectId=p1&domainId=d1", reply: "SELECT 1", text: true,
    call: (s) => s.dynamic.oqueryTextToSql("Users:", "p1", "d1") },
  { name: "oqueryContextToSql", method: "POST", url: "/dynamic-query/query/to-string-from-text/Managers?projectId=p1&domainId=d1", reply: "SELECT 1", text: true,
    call: (s) => s.dynamic.oqueryContextToSql("Managers:", "Managers", "p1", "d1") },
  { name: "definitionToOQuery", method: "POST", url: "/dynamic-query/query/to-oquery", reply: "Users:", text: true,
    call: (s) => s.dynamic.definitionToOQuery({}) },
  { name: "parseOQuery", method: "POST", url: "/dynamic-query/query/from-oquery", reply: {},
    call: (s) => s.dynamic.parseOQuery("Users:") },
  { name: "fetchQueryRequestPayload", method: "GET", url: "/query-request?projectId=p1&domainId=d1", reply: [],
    call: (s) => s.query.fetchQueryRequestPayload("p1", "d1") },
  { name: "saveQueryPayload (create)", method: "POST", url: "/query-request?projectId=p1", reply: { id: "q1" },
    call: (s) => s.query.saveQueryPayload("p1", "d1", {}) },
  { name: "saveQueryPayload (update)", method: "PUT", url: "/query-request/q1?projectId=p1", reply: { id: "q1" },
    call: (s) => s.query.saveQueryPayload("p1", "d1", {}, "q1") },
  { name: "deleteQueryRequestById", method: "DELETE", url: "/query-request/q1?projectId=p1",
    call: (s) => s.query.deleteQueryRequestById("q1", "p1", "d1") },
  { name: "getDefinitions", method: "GET", url: "/metadata/projects/p1/functions", reply: [functionDefinition],
    call: (s) => s.functions.getDefinitions("p1") },
  { name: "saveDefinition (create)", method: "POST", url: "/metadata/projects/p1/functions", reply: functionDefinition,
    call: (s) => s.functions.saveDefinition("p1", undefined, functionDefinition as never) },
  { name: "saveDefinition (update)", method: "PUT", url: "/metadata/projects/p1/functions/Upper", reply: functionDefinition,
    call: (s) => s.functions.saveDefinition("p1", "Upper", functionDefinition as never) },
  { name: "deleteDefinition", method: "DELETE", url: "/metadata/projects/p1/functions/Upper",
    call: (s) => s.functions.deleteDefinition("p1", "Upper") },
];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API endpoints used by the frontend services", () => {
  it.each(endpoints)("$name sends $method $url and resolves the reply", async (endpoint) => {
    const services = await loadServices();
    const calls = mockFetch(() => respond(endpoint.reply, 200, endpoint.text));

    await endpoint.call(services);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(endpoint.url);
    expect(calls[0].init?.method ?? "GET").toBe(endpoint.method);
  });

  it.each(endpoints)("$name surfaces the API error message", async (endpoint) => {
    const services = await loadServices();
    mockFetch(() => respond({ title: "Server failed" }, 500));

    await expect(endpoint.call(services)).rejects.toThrow("Server failed");
  });
});

describe("api-client transport", () => {
  it("returns null for 204 responses", async () => {
    const { requestJson } = await import("./api-client");
    mockFetch(() => respond(undefined));

    await expect(requestJson("/anything")).resolves.toBeNull();
  });

  it("wraps network failures with a readable message", async () => {
    const { requestJson } = await import("./api-client");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    await expect(requestJson("/anything")).rejects.toThrow("Could not reach the API: boom");
  });

  it("reports invalid JSON bodies", async () => {
    const { requestJson } = await import("./api-client");
    mockFetch(() => new Response("not json", { status: 200 }));

    await expect(requestJson("/anything")).rejects.toThrow("API returned invalid JSON.");
  });
});

describe("request bodies", () => {
  it("sends the connect request as JSON via PUT", async () => {
    const services = await loadServices();
    const calls = mockFetch(() => respond({ provider: "Db2" }));

    await services.connection.connect({ provider: "Db2", connectionString: "Server=x" });

    expect(calls[0].init?.method).toBe("PUT");
    expect(calls[0].init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ provider: "Db2", connectionString: "Server=x" });
  });

  it("sends OQuery text as text/plain and parses OQuery as a JSON text field", async () => {
    const services = await loadServices();
    const calls = mockFetch((url) => url.includes("from-oquery") ? respond({}) : respond("SELECT 1", 200, true));

    await services.dynamic.oqueryTextToSql("Users:", "p1", "d1");
    await services.dynamic.parseOQuery("Users:");

    expect(calls[0].init?.headers).toEqual({ "Content-Type": "text/plain" });
    expect(calls[0].init?.body).toBe("Users:");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ text: "Users:" });
  });

  it("encodes the project and domain ids in query-request URLs", async () => {
    const services = await loadServices();
    const calls = mockFetch(() => respond([]));

    await services.query.fetchQueryRequestPayload("my project", "my domain");

    expect(calls[0].url).toBe("/query-request?projectId=my%20project&domainId=my%20domain");
  });

  it("encodes the project id in function definition URLs", async () => {
    const services = await loadServices();
    const calls = mockFetch(() => respond([functionDefinition]));

    await services.functions.getDefinitions("my project");

    expect(calls[0].url).toBe("/metadata/projects/my%20project/functions");
  });
});

describe("caching and invalidation", () => {
  it("caches database schema until the connection changes", async () => {
    const services = await loadServices();
    const calls = mockFetch((url) => url === "/db/schema"
      ? respond({ tables: [], relationships: [] })
      : respond({ provider: "Db2" }));

    await services.schema.getSchema();
    await services.schema.getSchema();
    expect(calls).toHaveLength(1);

    await services.connection.connect({ provider: "Db2", connectionString: "Server=x" });
    await services.schema.getSchema();
    expect(calls.map((call) => call.url)).toEqual(["/db/schema", "/db/connection", "/db/schema"]);
  });

  it("clamps table preview rows to the maximum and truncates the reply", async () => {
    const services = await loadServices();
    const rows = Array.from({ length: 12 }, (_, index) => [String(index)]);
    const calls = mockFetch(() => respond({ name: "Users", columns: ["Id"], rows }));

    const preview = await services.schema.getTablePreview("Users", "", 50);

    expect(calls[0].url).toBe("/db/data/Users?limit=10");
    expect(preview.rows).toHaveLength(services.schema.MAX_TABLE_DATA_ROWS);
  });

  it("caches sub-domain metadata per project and invalidates it after an update", async () => {
    const services = await loadServices();
    const calls = mockFetch((url) => {
      if (url.endsWith("/resolved")) return respond({ entities: [], relations: [] });
      if (url.endsWith("/domains/names")) return respond([{ id: "d1", name: "Demo" }]);
      return respond(domainResponse);
    });

    await services.project.getDomain("p1", "d1");
    await services.project.getDomain("p1", "d1");
    await services.project.updateDomain("p1", "d1", { name: "Renamed" });
    await services.project.getDomain("p1", "d1");

    expect(calls.map((call) => call.url)).toEqual([
      "/metadata/projects/p1/domains/d1/resolved",
      "/metadata/projects/p1/domains/names",
      "/metadata/projects/p1/domains/d1",
      "/metadata/projects/p1/domains/d1/resolved",
      "/metadata/projects/p1/domains/names",
    ]);
  });

  it("keeps sub-domain metadata separate for the same domain id in another project", async () => {
    const services = await loadServices();
    const calls = mockFetch((url) => url.endsWith("/resolved")
      ? respond({ entities: [], relations: [] })
      : respond([{ id: "d1", name: "Demo" }]));

    await services.project.getDomain("p1", "d1");
    await services.project.getDomain("p2", "d1");

    expect(calls.filter((call) => call.url.endsWith("/resolved")).map((call) => call.url)).toEqual([
      "/metadata/projects/p1/domains/d1/resolved",
      "/metadata/projects/p2/domains/d1/resolved",
    ]);
  });

  it("caches function definitions per project and applies the scalar default receiver", async () => {
    const services = await loadServices();
    const calls = mockFetch(() => respond([functionDefinition]));

    const [first] = await services.functions.getDefinitions("p1");
    await services.functions.getDefinitions("p1");
    await services.functions.getDefinitions("p2");

    expect(calls.map((call) => call.url)).toEqual([
      "/metadata/projects/p1/functions",
      "/metadata/projects/p2/functions",
    ]);
    expect(first.applyFor).toBe(allScalarApplyFor);
  });

  it("caches saved query payloads per project and domain and refetches after a save", async () => {
    const services = await loadServices();
    const calls = mockFetch((url, init) => init?.method === "POST" ? respond({ id: "q1" }) : respond([]));

    await services.query.fetchQueryRequestPayload("p1", "d1");
    await services.query.fetchQueryRequestPayload("p1", "d1");
    await services.query.fetchQueryRequestPayload("p2", "d1");
    await services.query.saveQueryPayload("p1", "d1", {});
    await services.query.fetchQueryRequestPayload("p1", "d1");

    expect(calls.filter((call) => call.init?.method === undefined)).toHaveLength(3);
  });
});

describe("reply validation", () => {
  it("rejects a schema reply with malformed table metadata", async () => {
    const services = await loadServices();
    mockFetch(() => respond({ tables: [{ schema: "dbo", name: "Users", columns: [{ name: "Id" }] }], relationships: [] }));

    await expect(services.schema.getSchema()).rejects.toThrow("Database schema API returned invalid table or relationship metadata.");
  });

  it("rejects connection options whose providers are not strings", async () => {
    const services = await loadServices();
    mockFetch(() => respond({ providers: [1] }));

    await expect(services.connection.getConnectionOptions()).rejects.toThrow("Database connection API returned invalid provider data.");
  });

  it("rejects table previews whose rows are not strings", async () => {
    const services = await loadServices();
    mockFetch(() => respond({ name: "Users", columns: ["Id"], rows: [[1]] }));

    await expect(services.schema.getTablePreview("Users")).rejects.toThrow("Database table API must return");
  });

  it("throws when saving a function definition returns no body", async () => {
    const services = await loadServices();
    mockFetch(() => respond(undefined));

    await expect(services.functions.saveDefinition("p1", "Upper", functionDefinition as never))
      .rejects.toThrow("Function definition API did not return the saved definition.");
  });
});

describe("loadDataSource", () => {
  it("accepts an array reply and an object reply with a rows array", async () => {
    const { loadDataSource } = await import("./data-source-service");
    mockFetch((url) => url.endsWith("array") ? respond([{ id: 1 }]) : respond({ name: "Named", rows: [{ id: 2 }] }));

    await expect(loadDataSource("https://example.test/array")).resolves.toEqual({ rows: [{ id: 1 }], name: undefined });
    await expect(loadDataSource("https://example.test/object")).resolves.toEqual({ rows: [{ id: 2 }], name: "Named" });
  });

  it("reports a missing URL and HTTP failures", async () => {
    const { loadDataSource } = await import("./data-source-service");
    mockFetch(() => respond({ title: "Nope" }, 503));

    await expect(loadDataSource("")).rejects.toThrow("Set VITE_DATA_SOURCE_URL");
    await expect(loadDataSource("https://example.test/down")).rejects.toThrow("Datasource request failed (503).");
  });
});
