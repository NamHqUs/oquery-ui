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

// A project owns one FullDomain and any number of sub-domains. A sub-domain is identified by its ID within its project,
// so every sub-domain lookup needs both IDs.
export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  dbConnectionProfile: string;
  /** Present for projects created from a database. The connection string is never returned. */
  connection?: { provider: string } | null;
};

export type FullDomain = {
  entities: DomainEntityDto[];
  relations: DomainRelation[];
};

export type SubDomainFieldName = { field: string; fieldName: string };
export type SubDomainRelationName = { relation: string; relationName: string };

// Overrides are keyed by original names. Only names can change.
export type SubDomainEntity = {
  entity: string;
  entityName?: string | null;
  fieldNames: SubDomainFieldName[];
  excludedFields: string[];
  relationNames: SubDomainRelationName[];
};

export type SubDomainConfig = {
  id: string;
  name: string;
  description: string;
  entities: SubDomainEntity[];
};

export type ProjectDetails = ProjectSummary & {
  fullDomain: FullDomain;
  domains: SubDomainConfig[];
};

export type DomainName = {
  id: string;
  name: string;
  description: string;
};

// The resolved sub-domain: what queries and the diagram actually see, with overrides applied.
export type DomainDetails = DomainName & {
  projectId: string;
  entities: MetadataEntity[];
  relations: DomainRelation[];
};

const domainDetailsCache = new Map<string, DomainDetails>();
const domainDetailsRequests = new Map<string, Promise<DomainDetails>>();

function cacheKey(projectId: string, domainId: string) {
  return `${projectId.trim()}\u0000${domainId.trim()}`;
}

function publishDomainMetadata(details: DomainDetails) {
  store.dispatch(setQueryMetadata({ entities: details.entities, relations: details.relations }));
}

function toDomainDetails(projectId: string, domainId: string, resolved: FullDomain): DomainDetails {
  return {
    id: domainId,
    name: "",
    description: "",
    projectId,
    entities: resolved.entities.map(metadataEntityFromDto),
    relations: resolved.relations,
  };
}

function jsonRequest(method: "POST" | "PUT", body: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return requestJson<ProjectSummary[]>(apiUrls.metadata.projects);
}

export function getProject(projectId: string): Promise<ProjectDetails> {
  return requestJson<ProjectDetails>(apiUrls.metadata.projectById(projectId.trim()));
}

// The server ignores the incoming ID on create, but its request DTO still requires the field to be present.
export async function createProject(body: object): Promise<ProjectDetails> {
  return requestJson<ProjectDetails>(apiUrls.metadata.projects, jsonRequest("POST", { id: "", ...body }));
}

export async function updateProject(projectId: string, body: object): Promise<ProjectDetails> {
  return requestJson<ProjectDetails>(apiUrls.metadata.projectById(projectId.trim()), jsonRequest("PUT", body));
}

export async function deleteProject(projectId: string): Promise<void> {
  await requestJson(apiUrls.metadata.projectById(projectId.trim()), { method: "DELETE" });
  invalidateDomain(projectId);
}

export type DatabaseProjectRequest = {
  name: string;
  description: string;
  provider: string;
  connectionString: string;
};

// Opens the connection without saving anything. Failures reject with the database's error details.
export async function testDatabaseConnection(provider: string, connectionString: string): Promise<void> {
  await requestJson(apiUrls.database.testConnection, jsonRequest("POST", { provider, connectionString }));
}

// The server creates the project, its encrypted connection, the FullDomain and the Main domain, or nothing at all.
export function createProjectFromDatabase(body: DatabaseProjectRequest): Promise<ProjectDetails> {
  return requestJson<ProjectDetails>(apiUrls.metadata.createFromDatabase, jsonRequest("POST", body));
}

export function generateFullDomain(projectId: string): Promise<FullDomain> {
  return requestJson<FullDomain>(apiUrls.metadata.generateFullDomain(projectId.trim()), { method: "POST" });
}

export function getFullDomain(projectId: string): Promise<FullDomain> {
  return requestJson<FullDomain>(apiUrls.metadata.fullDomain(projectId.trim()));
}

export async function listDomainNames(projectId: string): Promise<DomainName[]> {
  const domains = await requestJson<Array<{ id: string; name: string }>>(apiUrls.metadata.domainNames(projectId.trim()));
  return domains.map((domain) => ({ id: domain.id, name: domain.name, description: "" }));
}

export function getDomainConfig(projectId: string, domainId: string): Promise<SubDomainConfig> {
  return requestJson<SubDomainConfig>(apiUrls.metadata.domainById(projectId.trim(), domainId.trim()));
}

export async function createDomain(projectId: string, body: object): Promise<SubDomainConfig> {
  const created = await requestJson<SubDomainConfig>(apiUrls.metadata.domains(projectId.trim()), jsonRequest("POST", body));
  invalidateDomain(projectId);
  return created;
}

// Saves the edited FullDomain (field and relation mappings). The server rejects edits that break an existing sub-domain.
export async function updateFullDomain(projectId: string, body: FullDomain): Promise<FullDomain> {
  const saved = await requestJson<FullDomain>(apiUrls.metadata.fullDomain(projectId.trim()), jsonRequest("PUT", body));
  invalidateDomain(projectId);
  return saved;
}

export async function updateDomain(projectId: string, domainId: string, body: object): Promise<SubDomainConfig> {
  const saved = await requestJson<SubDomainConfig>(
    apiUrls.metadata.domainById(projectId.trim(), domainId.trim()),
    jsonRequest("PUT", body),
  );
  invalidateDomain(projectId, domainId);
  return saved;
}

export async function deleteDomain(projectId: string, domainId: string): Promise<void> {
  await requestJson(apiUrls.metadata.domainById(projectId.trim(), domainId.trim()), { method: "DELETE" });
  invalidateDomain(projectId, domainId);
}

// Resolved metadata is cached per project and sub-domain. Concurrent calls share one request.
export async function getDomain(projectId: string, domainId: string): Promise<DomainDetails> {
  const normalizedProjectId = projectId.trim();
  const normalizedDomainId = domainId.trim();
  if (!normalizedProjectId || !normalizedDomainId) throw new Error("A project ID and a domain ID are required.");
  const key = cacheKey(normalizedProjectId, normalizedDomainId);
  const cached = domainDetailsCache.get(key);
  if (cached) {
    publishDomainMetadata(cached);
    return cached;
  }
  const pending = domainDetailsRequests.get(key);
  if (pending) return pending;

  const request = requestJson<FullDomain>(apiUrls.metadata.domainResolved(normalizedProjectId, normalizedDomainId))
    .then(async (resolved) => {
      const names = await listDomainNames(normalizedProjectId);
      const name = names.find((item) => item.id === normalizedDomainId)?.name ?? normalizedDomainId;
      const details = { ...toDomainDetails(normalizedProjectId, normalizedDomainId, resolved), name };
      domainDetailsCache.set(key, details);
      publishDomainMetadata(details);
      return details;
    })
    .finally(() => {
      domainDetailsRequests.delete(key);
    });
  domainDetailsRequests.set(key, request);
  return request;
}

export function invalidateDomain(projectId: string, domainId?: string) {
  if (domainId) domainDetailsCache.delete(cacheKey(projectId, domainId));
  else for (const key of [...domainDetailsCache.keys()]) if (key.startsWith(`${projectId.trim()}\u0000`)) domainDetailsCache.delete(key);
}
