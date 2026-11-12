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

function withDomain(url: string, domainId: string) {
  return `${url}?domainId=${encodeURIComponent(domainId)}`;
}

export function executeDefinition(definition: object, domainId: string) {
  return requestJson(withDomain(apiUrls.dynamicQuery.execute, domainId), jsonBody(definition));
}

export function executeOQueryText(text: string, domainId: string) {
  return requestJson(withDomain(apiUrls.dynamicQuery.executeText, domainId), textBody(text));
}

export function executeOQueryContext(text: string, context: string, domainId: string) {
  return requestJson(withDomain(apiUrls.dynamicQuery.executeContextText(context), domainId), textBody(text));
}

export function definitionToSql(definition: object, domainId: string): Promise<string> {
  return requestText(withDomain(apiUrls.dynamicQuery.toString, domainId), jsonBody(definition));
}

export function oqueryTextToSql(text: string, domainId: string): Promise<string> {
  return requestText(withDomain(apiUrls.dynamicQuery.toStringText, domainId), textBody(text));
}

export function definitionToOQuery(definition: object): Promise<string> {
  return requestText(apiUrls.dynamicQuery.toOQuery, jsonBody(definition));
}

export function parseOQuery(text: string) {
  return requestJson(apiUrls.dynamicQuery.fromOQuery, jsonBody({ text }));
}
