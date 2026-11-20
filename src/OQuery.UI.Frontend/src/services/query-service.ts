import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";

// Saved-query payloads are cached per project and sub-domain. The Redux thunk normalizes and validates them.
const payloadCache = new Map<string, unknown>();
const payloadRequests = new Map<string, Promise<unknown>>();

function scopeKey(projectId: string, domainId: string) {
  return `${projectId.trim()}\u0000${domainId.trim()}`;
}

export function fetchQueryRequestPayload(projectId: string, domainId: string): Promise<unknown> {
  const key = scopeKey(projectId, domainId);
  if (payloadCache.has(key)) return Promise.resolve(payloadCache.get(key));
  let request = payloadRequests.get(key);
  if (!request) {
    const url = `${apiUrls.queryRequests.list}?projectId=${encodeURIComponent(projectId.trim())}&domainId=${encodeURIComponent(domainId.trim())}`;
    request = requestJson(url).then((payload) => {
      payloadCache.set(key, payload);
      return payload;
    }).finally(() => {
      payloadRequests.delete(key);
    });
    payloadRequests.set(key, request);
  }
  return request;
}

export async function saveQueryPayload(projectId: string, domainId: string, body: object, id?: string): Promise<unknown> {
  const url = id
    ? `${apiUrls.queryRequests.byId(id)}?projectId=${encodeURIComponent(projectId.trim())}`
    : `${apiUrls.queryRequests.create}?projectId=${encodeURIComponent(projectId.trim())}`;
  const saved = await requestJson(url, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  invalidate(projectId, domainId);
  return saved;
}

export async function deleteQueryRequestById(id: string, projectId: string, domainId: string): Promise<void> {
  await requestJson(`${apiUrls.queryRequests.byId(id)}?projectId=${encodeURIComponent(projectId.trim())}`, { method: "DELETE" });
  invalidate(projectId, domainId);
}

export function invalidate(projectId?: string, domainId?: string) {
  if (projectId && domainId) payloadCache.delete(scopeKey(projectId, domainId));
  else payloadCache.clear();
}
