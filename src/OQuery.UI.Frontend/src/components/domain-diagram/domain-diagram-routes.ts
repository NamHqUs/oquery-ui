export const DOMAIN_DIAGRAM_PATH = "/domains/diagrams";

export type DomainDiagramRoute =
  | { kind: "view"; projectId: string; domainId: string }
  | { kind: "create"; projectId: string }
  | { kind: "edit"; projectId: string; domainId: string };

function segmentsPath(...segments: string[]) {
  return segments.filter(Boolean).map(encodeURIComponent).join("/");
}

export function domainDiagramPath(projectId: string, domainId = "") {
  return `${DOMAIN_DIAGRAM_PATH}/${segmentsPath(projectId, domainId)}`;
}

export function domainCreatePath(projectId: string) {
  return `${DOMAIN_DIAGRAM_PATH}/create/${segmentsPath(projectId)}`;
}

export function domainEditPath(projectId: string, domainId: string) {
  return `${DOMAIN_DIAGRAM_PATH}/edit/${segmentsPath(projectId, domainId)}`;
}

export function isDomainDiagramPath(pathname: string) {
  return pathname.startsWith(`${DOMAIN_DIAGRAM_PATH}/`);
}

export function domainDiagramRouteOf(pathname: string): DomainDiagramRoute | null {
  if (!isDomainDiagramPath(pathname)) return null;
  const [first = "", second = "", third = ""] = pathname
    .slice(DOMAIN_DIAGRAM_PATH.length + 1)
    .split("/")
    .map((segment) => decodeURIComponent(segment));
  if (first === "create" && second) return { kind: "create", projectId: second };
  if (first === "edit" && second && third) return { kind: "edit", projectId: second, domainId: third };
  return { kind: "view", projectId: first, domainId: second };
}
