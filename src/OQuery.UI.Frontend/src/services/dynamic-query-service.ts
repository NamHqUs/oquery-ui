import { apiUrls } from "../const/api-urls";
import { requestJson, requestText } from "./api-client";

// Query execution and OQuery/SQL conversion. Redux thunks only store the results of these calls.

function jsonBody(body: object): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function textBody(text: string): RequestInit {
  return { method: "POST", headers: { "Content-Type": "text/plain" }, body: text };
}

function withScope(url: string, projectId: string, domainId: string) {
  return `${url}?projectId=${encodeURIComponent(projectId)}&domainId=${encodeURIComponent(domainId)}`;
}

export function executeDefinition(definition: object, projectId: string, domainId: string) {
  return requestJson(withScope(apiUrls.dynamicQuery.execute, projectId, domainId), jsonBody(definition));
}

export function executeOQueryText(text: string, projectId: string, domainId: string) {
  return requestJson(withScope(apiUrls.dynamicQuery.executeText, projectId, domainId), textBody(text));
}

export function executeOQueryContext(text: string, context: string, projectId: string, domainId: string) {
  return requestJson(withScope(apiUrls.dynamicQuery.executeContextText(context), projectId, domainId), textBody(text));
}

export function definitionToSql(definition: object, projectId: string, domainId: string): Promise<string> {
  return requestText(withScope(apiUrls.dynamicQuery.toString, projectId, domainId), jsonBody(definition));
}

export function oqueryTextToSql(text: string, projectId: string, domainId: string): Promise<string> {
  return requestText(withScope(apiUrls.dynamicQuery.toStringText, projectId, domainId), textBody(text));
}

export function oqueryContextToSql(text: string, context: string, projectId: string, domainId: string): Promise<string> {
  return requestText(withScope(apiUrls.dynamicQuery.toStringContextText(context), projectId, domainId), textBody(text));
}

export function definitionToOQuery(definition: object): Promise<string> {
  return requestText(apiUrls.dynamicQuery.toOQuery, jsonBody(definition));
}

export function parseOQuery(text: string) {
  return requestJson(apiUrls.dynamicQuery.fromOQuery, jsonBody({ text }));
}

export type QueryResult = {
  name: string;
  columns: string[];
  rows: string[][];
  totalRecords: number;
};

/** Executes OQuery text and returns the result rows. */
export async function requestQueryResultFromText(text: string, projectId: string, domainId: string): Promise<QueryResult> {
  const payload = await executeOQueryText(text, projectId, domainId);
  if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.rows) || payload.rows.some((row: unknown) => typeof row !== "string") || typeof payload.totalRecords !== "number" || !Number.isFinite(payload.totalRecords) || payload.totalRecords < -1) {
    throw new Error("Query API must return a name, an array of row strings, and a valid total record count.");
  }
  const responseColumns = typeof payload.columns === "string"
    ? payload.columns.split(",").filter((column: string) => column.trim())
    : [];
  return {
    name: payload.name,
    columns: responseColumns,
    rows: payload.rows.map((row: string) => row.split(",")),
    totalRecords: payload.totalRecords,
  };
}

/** Executes one OQuery context and returns its result rows. */
export async function requestContextResultFromText(text: string, context: string, projectId: string, domainId: string): Promise<QueryResult> {
  const payload = await executeOQueryContext(text, context, projectId, domainId);
  if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.rows) || typeof payload.totalRecords !== "number") {
    throw new Error("Query API returned an invalid context result.");
  }
  const responseColumns = typeof payload.columns === "string"
    ? payload.columns.split(",").filter((column: string) => column.trim())
    : [];
  return {
    name: payload.name,
    columns: responseColumns,
    rows: payload.rows.map((row: string) => row.split(",")),
    totalRecords: payload.totalRecords,
  };
}

/** Returns the engine-generated SQL for OQuery text. */
export function requestSqlStatementFromText(text: string, projectId: string, domainId: string): Promise<string> {
  return oqueryTextToSql(text, projectId, domainId);
}
