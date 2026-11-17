import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";

// Raw saved-query payloads cached per domain. The Redux thunk normalizes and validates them.
const payloadCache = new Map<string, unknown>();
const payloadRequests = new Map<string, Promise<unknown>>();

export function fetchQueryRequestPayload(domainId: string): Promise<unknown> {
  const key = domainId.trim();
  if (payloadCache.has(key)) return Promise.resolve(payloadCache.get(key));
  let request = payloadRequests.get(key);
  if (!request) {
    request = requestJson(`${apiUrls.queryRequests.list}?domainId=${encodeURIComponent(key)}`).then((payload) => {
      payloadCache.set(key, payload);
      return payload;
    }).finally(() => {
      payloadRequests.delete(key);
    });
    payloadRequests.set(key, request);
  }
  return request;
}

export async function saveQueryPayload(domainId: string, body: object, id?: string): Promise<unknown> {
  const saved = await requestJson(id ? apiUrls.queryRequests.byId(id) : apiUrls.queryRequests.create, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  invalidate(domainId);
  return saved;
}

export async function deleteQueryRequestById(id: string, domainId: string): Promise<void> {
  await requestJson(apiUrls.queryRequests.byId(id), { method: "DELETE" });
  invalidate(domainId);
}

export function invalidate(domainId?: string) {
  if (domainId) payloadCache.delete(domainId.trim());
  else payloadCache.clear();
}
