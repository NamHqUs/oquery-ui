import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";

export const MAX_TABLE_DATA_ROWS = 10;

type TablePreviewPayload = { name: string; columns: string[]; rows: string[][] };

let schemaCache: unknown = null;
let schemaRequest: Promise<unknown> | null = null;
const tablePreviewRequests = new Map<string, Promise<TablePreviewPayload>>();

function toDatabaseSchema(payload) {
  if (!payload || !Array.isArray(payload.tables) || !Array.isArray(payload.relationships)
    || payload.tables.some((table) => typeof table.schema !== "string"
      || typeof table.name !== "string"
      || !Array.isArray(table.columns)
      || table.columns.some((column) => typeof column.name !== "string"
        || typeof column.dataType !== "string"
        || typeof column.isPrimaryKey !== "boolean"
        || typeof column.isNullable !== "boolean"))
    || payload.relationships.some((relation) => typeof relation.name !== "string"
      || typeof relation.sourceSchema !== "string"
      || typeof relation.sourceTable !== "string"
      || !Array.isArray(relation.sourceColumns)
      || typeof relation.targetSchema !== "string"
      || typeof relation.targetTable !== "string"
      || !Array.isArray(relation.targetColumns)
      || typeof relation.isUnique !== "boolean")) {
    throw new Error("Database schema API returned invalid table or relationship metadata.");
  }
  return payload;
}

function toTablePreview(payload): TablePreviewPayload {
  if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.columns)
    || payload.columns.some((column) => typeof column !== "string")
    || !Array.isArray(payload.rows)
    || payload.rows.some((row) => !Array.isArray(row) || row.some((value) => typeof value !== "string"))) {
    throw new Error("Database table API must return a table name, column names, and rows of string values.");
  }
  return {
    name: payload.name,
    columns: payload.columns,
    rows: payload.rows.slice(0, MAX_TABLE_DATA_ROWS),
  };
}

export function getSchema(): Promise<unknown> {
  if (schemaCache) return Promise.resolve(schemaCache);
  if (!schemaRequest) {
    schemaRequest = requestJson(apiUrls.database.schema).then((payload) => {
      schemaCache = toDatabaseSchema(payload);
      return schemaCache;
    }).finally(() => {
      schemaRequest = null;
    });
  }
  return schemaRequest;
}

// Called whenever the database connection changes so the next metadata or explorer read fetches fresh schema.
export function invalidateSchema() {
  schemaCache = null;
}

export function getTablePreview(tableName: string, schema = "", limit = MAX_TABLE_DATA_ROWS): Promise<TablePreviewPayload> {
  const rowLimit = Math.min(limit, MAX_TABLE_DATA_ROWS);
  const key = `${schema}.${tableName}:${rowLimit}`;
  let request = tablePreviewRequests.get(key);
  if (!request) {
    request = requestJson(apiUrls.database.tableData(tableName, schema, rowLimit)).then(toTablePreview).finally(() => {
      tablePreviewRequests.delete(key);
    });
    tablePreviewRequests.set(key, request);
  }
  return request;
}

