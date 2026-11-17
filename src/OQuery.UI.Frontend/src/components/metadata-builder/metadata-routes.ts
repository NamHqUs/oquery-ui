const SECTION_PATHS = {
  domains: "/metadata/domains",
  diagram: "/metadata/diagrams",
  entities: "/metadata/entities",
} as const;

export type WizardSection = keyof typeof SECTION_PATHS;

export type WizardRoute =
  | { section: WizardSection; mode: "create" }
  | { section: WizardSection; mode: "edit"; domainId: string };

const SECTION_BY_SEGMENT: Record<string, WizardSection> = {
  domains: "domains",
  diagrams: "diagram",
  entities: "entities",
};

const WIZARD_ROUTE_PATTERN = /^\/metadata\/(domains|diagrams|entities)\/(create-domain|edit-domain\/([^/]+))$/;

export function createDomainPath(section: WizardSection) {
  return `${SECTION_PATHS[section]}/create-domain`;
}

export function editDomainPath(section: WizardSection, domainId: string) {
  return `${SECTION_PATHS[section]}/edit-domain/${encodeURIComponent(domainId)}`;
}

export const WIZARD_ROUTE_PATHS = (Object.keys(SECTION_PATHS) as WizardSection[]).flatMap((section) => [
  createDomainPath(section),
  `${SECTION_PATHS[section]}/edit-domain/:domainId`,
]);

export function parseWizardRoute(pathname: string): WizardRoute | null {
  const match = pathname.match(WIZARD_ROUTE_PATTERN);
  if (!match) return null;
  const section = SECTION_BY_SEGMENT[match[1]];
  return match[3] ? { section, mode: "edit", domainId: match[3] } : { section, mode: "create" };
}
