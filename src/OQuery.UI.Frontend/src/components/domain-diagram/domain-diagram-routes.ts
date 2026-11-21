export const DOMAIN_DIAGRAM_PATH = "/domains/diagram";

export function domainDiagramPath(projectId: string, domainId = "") {
  const segments = [projectId, domainId].filter(Boolean).map(encodeURIComponent).join("/");
  return `${DOMAIN_DIAGRAM_PATH}/${segments}`;
}

export function isDomainDiagramPath(pathname: string) {
  return pathname.startsWith(`${DOMAIN_DIAGRAM_PATH}/`);
}

export function domainDiagramRouteOf(pathname: string) {
  if (!isDomainDiagramPath(pathname)) return null;
  const [projectId = "", domainId = ""] = pathname
    .slice(DOMAIN_DIAGRAM_PATH.length + 1)
    .split("/")
    .map((segment) => decodeURIComponent(segment));
  return { projectId, domainId };
}
