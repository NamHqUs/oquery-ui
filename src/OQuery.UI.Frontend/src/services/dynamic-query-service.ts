import { apiUrls } from "../const/api-urls";
import { requestJson, requestText } from "./api-client";

// Query execution and OQuery/SQL conversion. The Redux thunks in query-builder-slice
// only store the results of these calls.

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
