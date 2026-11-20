export const DOMAINS_PATH = "/metadata/domains";
export const DIAGRAMS_PATH = "/metadata/diagrams";
export const DATABASE_EXPLORER_PATH = "/metadata/explorer";

export type MetadataSection = "domains" | "diagram" | "explorer";

export function metadataPath(pathname: string, selection: { projectId?: string; domainId?: string } = {}) {
  const params = new URLSearchParams();
  if (selection.projectId) params.set("project", selection.projectId);
  if (selection.domainId) params.set("domain", selection.domainId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
