import { apiUrls } from "../const/api-urls";
import {
  metadataEntityFromDto,
  setQueryMetadata,
  type DomainEntityDto,
  type DomainRelation,
  type MetadataEntity,
} from "../components/query-builder/query-design/query-builder-slice";
import { store } from "../store/store";
import { requestJson } from "./api-client";

export type DomainName = {
  id: string;
  name: string;
  description: string;
};

export type DomainDetails = DomainName & {
  entities: MetadataEntity[];
  relations: DomainRelation[];
  canDelete: boolean;
  isBuiltin: boolean;
};

let domainNamesCache: DomainName[] | null = null;
let domainNamesRequest: Promise<DomainName[]> | null = null;
const domainDetailsCache = new Map<string, DomainDetails>();
const domainDetailsRequests = new Map<string, Promise<DomainDetails>>();

export async function listDomainNames(): Promise<DomainName[]> {
  if (domainNamesCache) return domainNamesCache;
  if (domainNamesRequest) return domainNamesRequest;
  domainNamesRequest = requestJson<Array<{ id: string; name: string; description?: string }>>(
    apiUrls.metadata.domainNamesWithDescriptions,
  ).then((domains) => {
    domainNamesCache = domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      description: domain.description || "",
    }));
    return domainNamesCache;
  }).finally(() => {
    domainNamesRequest = null;
  });
  return domainNamesRequest;
}

export async function getDomain(domainId: string): Promise<DomainDetails> {
  const normalizedId = domainId.trim();
  if (!normalizedId) throw new Error("A domain ID is required.");
  const cached = domainDetailsCache.get(normalizedId);
  if (cached) return cached;
  const pending = domainDetailsRequests.get(normalizedId);
  if (pending) return pending;

  const request = requestJson<{
    id: string;
    name: string;
    description: string;
    entities: DomainEntityDto[];
    relations: DomainRelation[];
    canDelete: boolean;
    isBuiltin: boolean;
  }>(apiUrls.metadata.domainById(normalizedId)).then((domain) => {
    const details: DomainDetails = {
      id: domain.id,
      name: domain.name,
      description: domain.description || "",
      entities: domain.entities.map(metadataEntityFromDto),
      relations: domain.relations,
      canDelete: domain.canDelete,
      isBuiltin: domain.isBuiltin,
    };
    domainDetailsCache.set(normalizedId, details);
    domainNamesCache = domainNamesCache?.map((item) =>
      item.id === details.id
        ? { id: details.id, name: details.name, description: details.description }
        : item);
    store.dispatch(setQueryMetadata({ entities: details.entities, relations: details.relations }));
    return details;
  }).finally(() => {
    domainDetailsRequests.delete(normalizedId);
  });
  domainDetailsRequests.set(normalizedId, request);
  return request;
}

export function invalidateDomain(domainId?: string) {
  if (domainId) domainDetailsCache.delete(domainId);
  else domainDetailsCache.clear();
}

function jsonRequest(method: "POST" | "PUT", body: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// Creating or deleting a domain changes the name list. Updating one changes its detail and name entry.
export async function createDomain(body: object) {
  const created = await requestJson(apiUrls.metadata.createDomain, jsonRequest("POST", body));
  domainNamesCache = null;
  return created;
}

export async function generateDomain(body: object) {
  const created = await requestJson(apiUrls.metadata.generateDomain, jsonRequest("POST", body));
  domainNamesCache = null;
  return created;
}

export async function updateDomain(domainId: string, body: object) {
  const saved = await requestJson(apiUrls.metadata.domainById(domainId), jsonRequest("PUT", body));
  invalidateDomain(domainId);
  domainNamesCache = null;
  return saved;
}

export async function deleteDomain(domainId: string): Promise<void> {
  await requestJson(apiUrls.metadata.domainById(domainId), { method: "DELETE" });
  invalidateDomain(domainId);
  domainNamesCache = null;
}
