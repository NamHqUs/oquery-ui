import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useBlocker, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Icon, { getDatabaseIconName } from "./components/icon/icon";
import DataSources from "./components/data-sources/data-sources";
import DatabaseConnection from "./components/data-sources/database-connection/database-connection";
import { fetchDbProvider } from "./components/data-sources/database-slice";
import QueryBuilder from "./components/query-builder/query-builder";
import MetadataBuilder from "./components/metadata-builder/metadata-builder";
import FunctionDefinitionsWorkspace from "./components/function-definition/function-definition";
import Home from "./components/home/home";
import Documentation from "./components/documentation/documentation";
import AdminAnalytics from "./components/admin/admin-analytics";
import { documentationSubmenu } from "./components/documentation/doc-agenda";
import { GITHUB_URL, PRODUCT_NAME } from "./components/home/home-content";
import { MessageBoxProvider } from "./components/message-box/message-box";
import { readAnalyticsConsent } from "./services/api-client";
import ProjectOnboarding from "./components/metadata-builder/project/project-onboarding";
import CreateProjectPage from "./components/projects/create-project-page";
import WorkspacePage from "./components/workspace/workspace-page";
import { getProject, listProjects, type ProjectSummary } from "./services/project-service";
import { store, type RootState } from "./store/store";
import "./styles.css";
import "./components/app-shell/app-shell.css";
import PlaygroundWorkspace from "./components/prototype-workspace/prototype-workspace";

const PAGE_PATHS = {
  home: "/",
  builder: "/playground/:projectId",
  metadata: "/metadata",
  sources: "/data-sources",
  functions: "/function-definitions",
  security: "/security",
  documentation: "/documentation",
} as const;

const LEGACY_FUNCTIONS_PATH = "/functions";
// Playground URL: /playground/:projectId/:domainId/:queryId (domain and query segments are optional).
const PLAYGROUND_PATH = "/playground";
// The Query Builder moved from /query-builder to /playground/:projectId. The old URLs redirect.
const LEGACY_BUILDER_PATH = "/query-builder";
const WORKSPACE_PATH = "/workspace";
const PROJECT_CREATE_PATH = "/projects/create";
const LAST_BUILDER_PROJECT_STORAGE_KEY = "oquery.builder.last-project";
// Not linked from the navigation. Admins open it by URL; the page asks for the admin token.
const ADMIN_PATH = "/admin";
const PRIVACY_PATH = "/privacy";
const TERMS_PATH = "/terms";
const DOMAINS_PATH = "/metadata/domains";
const DIAGRAMS_PATH = "/metadata/diagrams";
const DATABASE_EXPLORER_PATH = "/metadata/explorer";
const METADATA_LAST_ROUTE_STORAGE_KEY = "oquery.metadata.last-route";

type Page = keyof typeof PAGE_PATHS;
type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;
type MetadataSection = "diagram" | "domains" | "explorer";

const HOME_SUBMENU = [
  { label: "Playground", target: "hp-playground" },
  { label: "Examples", target: "hp-examples" },
  { label: "Capabilities", target: "hp-capabilities" },
  { label: "How it works", target: "hp-how-it-works" },
  { label: "For developers", target: "hp-developers" },
] as const;

const PAGE_SUBMENUS: Record<Exclude<Page, "home">, readonly string[]> = {
  builder: [],
  sources: ["Connections", "Tables", "Schema"],
  metadata: ["Projects", "Diagram", "Explore database"],
  functions: [],
  security: ["Policies", "Query limits", "Audit log"],
  documentation: [],
};
const QUERY_DOMAIN_TONES = ["revenue", "customer", "product", "finance", "custom"] as const;

function saveAnalyticsConsent(value: "granted" | null) {
  try {
    if (value) window.localStorage.setItem("oquery.analytics.consent", value);
    else window.localStorage.removeItem("oquery.analytics.consent");
  } catch {
    // The preference remains valid for this render when storage is unavailable.
  }
}

function AnalyticsConsentNotice({
  onChoose,
  onOpenPrivacy,
}: {
  onChoose: (value: "granted" | "declined") => void;
  onOpenPrivacy: () => void;
}) {
  return (
    <aside className="analytics-consent" role="dialog" aria-labelledby="analytics-consent-title">
      <div>
        <strong id="analytics-consent-title">Help us improve Open Query</strong>
        <p>
          We use optional, aggregated analytics to understand API usage. Your saved data stays separate using a necessary section cookie.
          <button type="button" className="inline-policy-link" onClick={onOpenPrivacy}>Privacy Notice</button>
        </p>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="consent-secondary" onClick={() => onChoose("declined")}>Decline</button>
        <button type="button" className="consent-primary" onClick={() => onChoose("granted")}>Accept</button>
      </div>
    </aside>
  );
}

function ConnectionDialog({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="database-connection-dialog-backdrop" onClick={onClose}>
      <section
        className="database-connection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="database-connection-dialog-close" type="button" aria-label="Close database connection" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <DatabaseConnection onConnected={onClose} />
      </section>
    </div>,
    document.body,
  );
}

function PolicyPage({ kind }: { kind: "privacy" | "terms" }) {
  const isPrivacy = kind === "privacy";
  return (
    <article className="policy-page">
      <span className="eyebrow">{isPrivacy ? "PRIVACY" : "SERVICE TERMS"}</span>
      <h1>{isPrivacy ? "Privacy Notice" : "Terms of Service"}</h1>
      <p className="policy-lead">
        {isPrivacy
          ? "This notice explains how Open Query handles the information needed to provide custom data separation and optional usage analytics."
          : "These terms describe the expected use of the Open Query preview service."}
      </p>
      {isPrivacy ? (
        <>
          <h2>Section cookie</h2>
          <p>Open Query creates a random, pseudonymous section identifier so saved queries and other custom data remain separated between browsers. It is not an account ID and is not linked to your name or email address.</p>
          <h2>Optional analytics</h2>
          <p>Only after you choose “Accept analytics” do we count aggregated API activity by section and day. We record route templates and the frontend page path, not request bodies, query text, query results, IP addresses, or account details.</p>
          <h2>Your choices</h2>
          <p>You can decline analytics when prompted or change your choice with the Analytics settings link in the footer. Declining analytics does not prevent the core service from working.</p>
          <h2>Storage and retention</h2>
          <p>Custom data is stored by the configured application provider. Optional analytics is stored in the configured analytics database and daily analytics rows are retained for 365 days.</p>
        </>
      ) : (
        <>
          <h2>Use of the preview</h2>
          <p>Use the service lawfully and do not submit secrets, personal data, or content you are not authorized to process.</p>
          <h2>Availability</h2>
          <p>This is a preview service. Features, availability, and stored data may change without notice.</p>
          <h2>Questions</h2>
          <p>Publish a support contact here before making the service generally available.</p>
        </>
      )}
    </article>
  );
}

type PlaygroundRoute = { projectId: string; domainId: string; queryId: string };

function playgroundRouteOf(pathname: string): PlaygroundRoute | null {
  if (!pathname.startsWith(`${PLAYGROUND_PATH}/`)) return null;
  const [projectId = "", domainId = "", queryId = ""] = pathname
    .slice(PLAYGROUND_PATH.length + 1)
    .split("/")
    .map((segment) => decodeURIComponent(segment));
  return { projectId, domainId, queryId };
}

function builderProjectIdOf(pathname: string) {
  return playgroundRouteOf(pathname)?.projectId ?? "";
}

function builderDomainIdOf(pathname: string) {
  return playgroundRouteOf(pathname)?.domainId ?? "";
}

// Old /projects/:projectId?domain=... links are redirected to the playground URL.
function legacyProjectIdOf(pathname: string) {
  if (!pathname.startsWith("/projects/") || pathname === PROJECT_CREATE_PATH) return "";
  return decodeURIComponent(pathname.slice("/projects/".length).split("/")[0]);
}

function builderPath(projectId: string, domainId = "", from = "") {
  const segments = [projectId, domainId].filter(Boolean).map(encodeURIComponent).join("/");
  const query = from ? `?${new URLSearchParams({ from }).toString()}` : "";
  return `${PLAYGROUND_PATH}/${segments}${query}`;
}

function LegacyQueryBuilderRedirect() {
  const [params] = useSearchParams();
  const projectId = params.get("project")?.trim() ?? "";
  if (!projectId) return <Navigate to={WORKSPACE_PATH} replace />;
  return <Navigate to={builderPath(projectId, params.get("domain")?.trim() ?? "")} replace />;
}

function pageForPath(path: string): Page | null {
  if (builderProjectIdOf(path)) return "builder";
  if (path === DOMAINS_PATH || path === DIAGRAMS_PATH || path === DATABASE_EXPLORER_PATH) return "metadata";
  if (path === PAGE_PATHS.security) return "security";
  return (Object.keys(PAGE_PATHS) as Page[]).find((page) => PAGE_PATHS[page] === path) ?? null;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PageSubnav({
  page,
  onNavigateToPage,
  onBuilderDomainSelect,
  onMetadataSectionSelect,
}: {
  page: Page | null;
  onNavigateToPage: (nextPage: Page) => void;
  onBuilderDomainSelect: (projectId: string, domainId: string, requestName?: string) => void;
  onMetadataSectionSelect: (section: MetadataSection) => void;
}) {
  const location = useLocation();
  const [queryProjects, setQueryProjects] = useState<ProjectSummary[]>([]);
  const [queryDomains, setQueryDomains] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (page !== "builder") return;
    let active = true;
    const params = new URLSearchParams(location.search);
    const requestedProject = builderProjectIdOf(location.pathname);
    const requestedDomain = builderDomainIdOf(location.pathname);
    listProjects()
      .then(async (projects) => {
        const projectId = projects.find((project) => project.id === requestedProject)?.id ?? projects[0]?.id;
        if (!active) return;
        setQueryProjects(projects);
        if (!projectId) {
          setQueryDomains([]);
          return;
        }
        const details = await getProject(projectId);
        if (!active) return;
        const domains = details.domains.map((domain) => ({ id: domain.id, name: domain.name }));
        setQueryDomains(domains);
        const domainId = domains.find((domain) => domain.id === requestedDomain)?.id ?? domains[0]?.id;
        if (domainId && (requestedProject !== projectId || requestedDomain !== domainId)) {
          onBuilderDomainSelect(projectId, domainId);
        }
      })
      .catch((error: unknown) => {
        if (active) console.error(error instanceof Error ? error.message : "Unable to load query domains.");
      });
    return () => {
      active = false;
    };
  }, [location.pathname, location.search, onBuilderDomainSelect, page]);
  const metadataSection = location.pathname === DOMAINS_PATH
    ? "domains"
    : location.pathname === DATABASE_EXPLORER_PATH
      ? "explorer"
      : location.pathname === DIAGRAMS_PATH
        ? "diagram"
        : new URLSearchParams(location.search).get("section") ?? "diagram";
  const currentProjectId = builderProjectIdOf(location.pathname) || new URLSearchParams(location.search).get("project") || queryProjects[0]?.id || "";
  if (!page) return null;

  if (page === "home") {
    return (
      <nav className="hp-subnav app-subnav" aria-label="Home sections">
        <span className="hp-subnav-brand">{PRODUCT_NAME}</span>
        <div className="hp-subnav-links">
          {HOME_SUBMENU.map((item) => <button key={item.target} type="button" onClick={() => scrollToSection(item.target)}>{item.label}</button>)}
          <button type="button" onClick={() => onNavigateToPage("documentation")}>Documentation</button>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <button className="button primary hp-subnav-cta" type="button" onClick={() => onNavigateToPage("builder")}><Icon name="play" size={11} /> Try Playground</button>
      </nav>
    );
  }

  return (
    <>
      <nav className="hp-subnav app-subnav" aria-label={`${page} sections`}>
        <span className="hp-subnav-brand">{page === "builder" ? "QUERY BUILDER" : page.replace("-", " ").toUpperCase()}</span>
        <div className={`hp-subnav-links${page === "builder" ? " query-builder-subnav-links" : ""}`}>
          {page === "builder" ? <>
            <button type="button" className="active" aria-current="page">Plan text</button>
            <span className="query-builder-subnav-item" aria-disabled="true">Query Builder <small>Hide</small></span>
            <span className="query-builder-subnav-item" aria-disabled="true">AI Assistant <small>Roadmap</small></span>
          </> : <>
            {page === "documentation" && documentationSubmenu.map((item) => (
              <button key={item.target} type="button" onClick={() => scrollToSection(item.target)}>{item.label}</button>
            ))}
            {PAGE_SUBMENUS[page].map((item) => {
            const itemSection = item === "Diagram" ? "diagram" : item === "Projects" ? "domains" : undefined;
            const metadataItemSection = itemSection ?? (item === "Explore database" ? "explorer" : undefined);
            const isActive = page === "metadata" && metadataItemSection === metadataSection;
            return <button
              key={item}
              type="button"
              className={isActive ? "active" : undefined}
              aria-current={isActive ? "page" : undefined}
              onClick={page === "metadata" && metadataItemSection
                ? () => onMetadataSectionSelect(metadataItemSection)
                : undefined}
            >{item}</button>;
            })}
            {page === "functions" && (
              <div className="function-subnav-intro">
                <strong>Custom functions</strong>
                <span>Extend the OQuery vocabulary with reusable business logic.</span>
              </div>
            )}
          </>}
        </div>
        <div className={`app-subnav-actions${page === "metadata" || page === "functions" || page === "builder" ? "" : " app-subnav-actions-hidden"}`} id="metadata-toolbar-actions">
        </div>
      </nav>
      {page === "builder" && <div className="query-builder-domain-bar diagram-toolbar">
        <div>
          <span className="section-kicker">QUERY DOMAINS</span>
          <p>Choose a project and sub-domain to plan a query against its metadata.</p>
        </div>
        <div className="query-builder-domain-picker">
          <select
            aria-label="Project"
            value={currentProjectId}
            onChange={(event) => onBuilderDomainSelect(event.target.value, "")}
          >
            {queryProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <nav className="diagram-group-switch query-builder-domain-list" aria-label="Query domains">
            {queryDomains.map((domain, index) => {
              const isActive = new URLSearchParams(location.search).get("domain") === domain.id;
              return <button
                key={domain.id}
                type="button"
                className={`diagram-group-button tone-${QUERY_DOMAIN_TONES[index % QUERY_DOMAIN_TONES.length]}${isActive ? " active" : ""}`}
                aria-pressed={isActive}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onBuilderDomainSelect(currentProjectId, domain.id)}
              >
                <span className="diagram-group-mark" aria-hidden="true" />
                <strong>{domain.name}</strong>
              </button>;
            })}
          </nav>
        </div>
      </div>}
    </>
  );
}

function WorkspaceContextBar({
  page,
  projects,
  onNavigate,
}: {
  page: Page | null;
  projects: ProjectSummary[] | null;
  onNavigate: (path: string) => void;
}) {
  const location = useLocation();
  const [project, setProject] = useState<Awaited<ReturnType<typeof getProject>> | null>(null);
  const params = new URLSearchParams(location.search);
  const requestedProjectId = builderProjectIdOf(location.pathname) || params.get("project") || "";
  const domainId = builderDomainIdOf(location.pathname) || params.get("domain") || "";
  // The project must be chosen explicitly; an unknown or missing ID is never replaced by a default.
  const projectId = projects?.some((item) => item.id === requestedProjectId) ? requestedProjectId : "";

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let active = true;
    getProject(projectId)
      .then((details) => {
        if (active) setProject(details);
      })
      .catch(() => {
        if (active) setProject(null);
      });
    return () => {
      active = false;
    };
  }, [projectId, location.search]);

  if (!page || page === "home" || page === "documentation") return null;

  const selectProject = (nextProjectId: string) => {
    if (!nextProjectId) return;
    if (page === "builder") {
      onNavigate(builderPath(nextProjectId));
      return;
    }
    onNavigate(`${location.pathname}?${new URLSearchParams({ project: nextProjectId }).toString()}`);
  };
  const selectDomain = (nextDomainId: string) => {
    if (!projectId || !nextDomainId) return;
    onNavigate(builderPath(projectId, nextDomainId));
  };

  return (
    <section className="workspace-context" aria-label="Workspace context">
      <div className="workspace-context-main">
        <span className="workspace-context-kicker">CURRENT PROJECT</span>
        <label className="workspace-context-select">
          <Icon name="folder" size={15} />
          <select aria-label="Current project" value={projectId} onChange={(event) => selectProject(event.target.value)}>
            {projects && projects.length === 0 && <option value="">No projects yet</option>}
            {projects && projects.length > 0 && !projectId && <option value="">Choose a project</option>}
            {projects?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <span className="workspace-context-divider" aria-hidden="true" />
      <div className="workspace-context-main workspace-context-domain">
        <span className="workspace-context-kicker">ACTIVE DOMAIN</span>
        <label className="workspace-context-select">
          <Icon name="table" size={15} />
          <select aria-label="Active sub-domain" value={domainId} onChange={(event) => selectDomain(event.target.value)} disabled={!project?.domains.length}>
            {!project?.domains.length && <option value="">{projectId ? "Create a sub-domain to query" : "Choose a project first"}</option>}
            {project?.domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
          </select>
        </label>
      </div>
      <div className="workspace-context-actions">
        <span className="workspace-context-status"><span className="workspace-context-status-dot" /> Project workspace</span>
        <button type="button" className="workspace-context-create" onClick={() => onNavigate(`${DOMAINS_PATH}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`)}>
          <Icon name="plus" size={13} /> Manage domains
        </button>
      </div>
    </section>
  );
}

function useWorkspaceProjects(refreshKey: string) {
  const [state, setState] = useState<{ projects: ProjectSummary[] | null; failed: boolean }>({ projects: null, failed: false });
  useEffect(() => {
    let active = true;
    listProjects()
      .then((projects) => {
        if (active) setState({ projects, failed: false });
      })
      .catch(() => {
        if (active) setState({ projects: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);
  return state;
}

function WorkspaceGate({
  projects,
  failed,
  onSelectProject,
  onProjectCreated,
}: {
  projects: ProjectSummary[] | null;
  failed: boolean;
  onSelectProject: (projectId: string) => void;
  onProjectCreated: (projectId: string, domainId: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  if (failed) {
    return <section className="workspace-gate"><p className="metadata-alert" role="alert">Unable to load projects. Check the API connection and reload the page.</p></section>;
  }
  if (!projects) {
    return <section className="workspace-gate"><p className="metadata-message">Loading projects…</p></section>;
  }
  if (projects.length === 0 || creating) {
    return (
      <section className="workspace-gate">
        <ProjectOnboarding onCompleted={onProjectCreated} onCancel={projects.length ? () => setCreating(false) : undefined} />
      </section>
    );
  }
  return (
    <section className="workspace-gate">
      <div className="workspace-gate-head">
        <div>
          <span className="section-kicker">CHOOSE A PROJECT</span>
          <h2>Open a project workspace</h2>
          <p>Playground, domains, and custom functions all run inside one project.</p>
        </div>
        <button className="button primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> Create project</button>
      </div>
      <div className="workspace-gate-grid">
        {projects.map((item) => (
          <button key={item.id} type="button" className="workspace-gate-card" onClick={() => onSelectProject(item.id)}>
            <Icon name="folder" size={18} />
            <strong>{item.name}</strong>
            <small>{item.dbConnectionProfile || "No connection profile"}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function WorkspaceNavigation({
  page,
  onNavigate,
}: {
  page: Page | null;
  onNavigate: (path: string) => void;
}) {
  const location = useLocation();
  if (!page || page === "home" || page === "documentation") return null;

  const projectId = builderProjectIdOf(location.pathname) || new URLSearchParams(location.search).get("project");
  const domainId = builderDomainIdOf(location.pathname) || new URLSearchParams(location.search).get("domain");
  const withProject = (path: string, includeDomain = false) => {
    const params = new URLSearchParams();
    if (projectId) params.set("project", projectId);
    if (includeDomain && domainId) params.set("domain", domainId);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };
  const builderLink = projectId ? builderPath(projectId, domainId ?? "") : WORKSPACE_PATH;
  const items = [
    {
      group: "BUILD",
      links: [
        { label: "Overview", hint: "Project health", icon: "folder", path: withProject(DOMAINS_PATH) },
        { label: "Playground", hint: "Run OQuery", icon: "play", path: builderLink, active: page === "builder" },
        { label: "Queries", hint: "Saved requests", icon: "file-text", path: builderLink, active: page === "builder" },
      ],
    },
    {
      group: "DOMAIN STUDIO",
      links: [
        { label: "Full domain", hint: "Entities and relations", icon: "schema", path: withProject(DOMAINS_PATH), active: page === "metadata" && location.pathname === DOMAINS_PATH },
        { label: "Schema diagram", hint: "Visual map", icon: "schema", path: withProject(DIAGRAMS_PATH), active: page === "metadata" && location.pathname === DIAGRAMS_PATH },
        { label: "Database explorer", hint: "Source tables", icon: "database", path: withProject(DATABASE_EXPLORER_PATH), active: page === "metadata" && location.pathname === DATABASE_EXPLORER_PATH },
      ],
    },
    {
      group: "EXTEND",
      links: [
        { label: "Custom functions", hint: "Business vocabulary", icon: "function", path: PAGE_PATHS.functions, active: page === "functions" },
        { label: "Security", hint: "Policies and controls", icon: "sliders", path: PAGE_PATHS.security, active: page === "security" },
      ],
    },
  ] as const;

  return (
    <nav className="workspace-navigation" aria-label="Project workspace">
      {items.map((section) => (
        <div className="workspace-navigation-group" key={section.group}>
          <span className="workspace-navigation-label">{section.group}</span>
          <div className="workspace-navigation-links">
            {section.links.map((item) => (
              <button
                type="button"
                key={item.label}
                className={`workspace-navigation-link${item.active ? " active" : ""}`}
                aria-current={item.active ? "page" : undefined}
                onClick={() => onNavigate(item.path)}
              >
                <Icon name={item.icon} size={15} />
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SecurityPage() {
  const controls = [
    {
      title: "Access policies",
      description: "Define who can use a project and which domains each role can query.",
      status: "Design ready",
      icon: "sliders",
      tone: "purple",
    },
    {
      title: "Query limits",
      description: "Set row limits, execution timeouts, and allowed query operations.",
      status: "Coming next",
      icon: "schema",
      tone: "blue",
    },
    {
      title: "Audit log",
      description: "Review query activity and policy decisions for this project.",
      status: "Coming next",
      icon: "chart-line",
      tone: "green",
    },
  ] as const;

  return (
    <section className="security-page">
      <header className="page-heading security-heading">
        <div>
          <span className="eyebrow">PROJECT SECURITY</span>
          <h1>Security and access</h1>
          <p>Keep authorization close to the project and domain that it protects.</p>
        </div>
        <span className="security-preview-badge">UI preview</span>
      </header>
      <div className="security-intro">
        <div className="security-intro-mark"><Icon name="sliders" size={22} /></div>
        <div>
          <strong>One policy boundary for every query</strong>
          <p>Policies will be evaluated after the project, domain, and query metadata are resolved—before SQL is generated.</p>
        </div>
        <button type="button" className="button primary" disabled><Icon name="plus" size={14} /> Create policy</button>
      </div>
      <div className="security-grid">
        {controls.map((control) => (
          <article className={`security-card security-card-${control.tone}`} key={control.title}>
            <div className="security-card-icon"><Icon name={control.icon} size={18} /></div>
            <span className="security-card-status">{control.status}</span>
            <h2>{control.title}</h2>
            <p>{control.description}</p>
            <button type="button" className="security-card-link" disabled>Configure <span aria-hidden="true">→</span></button>
          </article>
        ))}
      </div>
      <div className="security-scope">
        <div>
          <span className="section-kicker">RECOMMENDED SCOPE</span>
          <h2>Start with project access, then narrow by domain</h2>
          <p>A project is the trust boundary. Sub-domains are the safe surface that users and applications query.</p>
        </div>
        <div className="security-scope-flow">
          <span>Project</span><b>→</b><span>Sub-domain</span><b>→</b><span>Query</span>
        </div>
      </div>
    </section>
  );
}

function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const database = useSelector((state: RootState) => state.database);
  const page = pageForPath(location.pathname);
  const workspaceProjects = useWorkspaceProjects(`${location.pathname}${location.search}`);
  const workspaceProjectId = builderProjectIdOf(location.pathname) || new URLSearchParams(location.search).get("project") || "";
  const workspaceNeedsProject = page === "builder" || page === "metadata" || page === "functions" || page === "security";
  const showWorkspaceGate = workspaceNeedsProject
    && !workspaceProjects.projects?.some((item) => item.id === workspaceProjectId);
  const [metadataVisited, setMetadataVisited] = useState(() => location.pathname === PAGE_PATHS.metadata || pageForPath(location.pathname) === "metadata");
  const [functionDefinitionsVisited, setFunctionDefinitionsVisited] = useState(() => location.pathname === PAGE_PATHS.functions);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState<"granted" | "declined" | null>(readAnalyticsConsent);
  const connectionPromptShown = useRef(false);
  const metadataNavigationGuard = useRef<NavigationGuard | null>(null);
  const metadataSectionNavigation = useRef<((section: MetadataSection) => void) | null>(null);
  const functionNavigationGuard = useRef<NavigationGuard | null>(null);
  const builderNavigationGuard = useRef<NavigationGuard | null>(null);
  const approvedNavigation = useRef<string | null>(null);
  const handledBlockedLocation = useRef<string | null>(null);
  const updateMetadataNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    metadataNavigationGuard.current = guard;
  }, []);
  const updateMetadataSectionNavigation = useCallback((handler: ((section: MetadataSection) => void) | null) => {
    metadataSectionNavigation.current = handler;
  }, []);
  const updateFunctionNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    functionNavigationGuard.current = guard;
  }, []);
  const updateBuilderNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    builderNavigationGuard.current = guard;
  }, []);
  const guardForPage = (targetPage: Page | null) => {
    if (targetPage === "metadata") return metadataNavigationGuard.current;
    if (targetPage === "functions") return functionNavigationGuard.current;
    if (targetPage === "builder") return builderNavigationGuard.current;
    return null;
  };

  useEffect(() => {
    void store.dispatch(fetchDbProvider());
  }, []);

  useEffect(() => {
    if (connectionPromptShown.current
      || database.providerCheckStatus === "loading"
      || database.providerCheckStatus === "idle"
      || database.connectionStatus === "loading"
      || database.connectionStatus === "succeeded"
      || database.connectedProvider) return;
    connectionPromptShown.current = true;
    setConnectionDialogOpen(true);
  }, [
    database.connectionStatus,
    database.connectedProvider,
    database.providerCheckStatus,
  ]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const currentPage = pageForPath(currentLocation.pathname);
    const nextPage = pageForPath(nextLocation.pathname);
    const target = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    if (approvedNavigation.current === target) {
      approvedNavigation.current = null;
      return false;
    }
    // Switching domain stays on the builder page, so it is guarded separately from page changes.
    const isBuilderDomainSwitch = currentPage === "builder"
      && nextPage === "builder"
      && builderDomainIdOf(currentLocation.pathname) !== builderDomainIdOf(nextLocation.pathname);
    if (isBuilderDomainSwitch) return builderNavigationGuard.current !== null;
    return currentPage !== null
      && nextPage !== null
      && currentPage !== nextPage
      && guardForPage(currentPage) !== null;
  });

  useEffect(() => {
    if (location.pathname === PAGE_PATHS.metadata || pageForPath(location.pathname) === "metadata") setMetadataVisited(true);
    if (location.pathname === PAGE_PATHS.functions) setFunctionDefinitionsVisited(true);
  }, [location.pathname]);
  useEffect(() => {
    if (page !== "metadata"
      || location.pathname === PAGE_PATHS.metadata) return;
    window.sessionStorage.setItem(
      METADATA_LAST_ROUTE_STORAGE_KEY,
      `${location.pathname}${location.search}${location.hash}`,
    );
  }, [location.hash, location.pathname, location.search, page]);

  const requestDatabaseConnection = useCallback(() => setConnectionDialogOpen(true), []);
  const navigateToBuilderDomain = useCallback(
    (projectId: string, domainId: string, requestName?: string) => {
      const params = new URLSearchParams();
      if (domainId) params.set("domain", domainId);
      if (requestName) params.set("request", requestName);
      const query = params.toString();
      routerNavigate(`${builderPath(projectId)}${query ? `?${query}` : ""}`);
    },
    [routerNavigate],
  );

  useEffect(() => {
    const projectId = builderProjectIdOf(location.pathname);
    if (projectId) window.sessionStorage.setItem(LAST_BUILDER_PROJECT_STORAGE_KEY, projectId);
  }, [location.pathname]);

  useEffect(() => {
    if (!connectionDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConnectionDialogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [connectionDialogOpen]);

  const navigateToPage = (nextPage: Page, fromHome = false, metadataPath?: string) => {
    if (nextPage === page && !(nextPage === "builder" && fromHome) && !(nextPage === "metadata" && metadataPath)) return;
    const rememberedMetadataRoute = window.sessionStorage.getItem(METADATA_LAST_ROUTE_STORAGE_KEY);
    const lastBuilderProject = window.sessionStorage.getItem(LAST_BUILDER_PROJECT_STORAGE_KEY) ?? "";
    const destination = nextPage === "builder"
      ? (lastBuilderProject ? builderPath(lastBuilderProject, "", fromHome ? "home" : "") : WORKSPACE_PATH)
      : nextPage === "metadata"
        ? metadataPath ?? (rememberedMetadataRoute?.startsWith(`${PAGE_PATHS.metadata}/`)
          ? rememberedMetadataRoute
          : DOMAINS_PATH)
      : PAGE_PATHS[nextPage];
    const continueNavigation = () => {
      if (nextPage === "metadata") setMetadataVisited(true);
      if (nextPage === "functions") setFunctionDefinitionsVisited(true);
      if (nextPage === "builder" || (nextPage === "metadata" && metadataPath)) window.scrollTo({ top: 0 });
      approvedNavigation.current = destination;
      routerNavigate(destination);
    };
    const guard = guardForPage(page);
    if (guard) {
      guard(continueNavigation);
      return;
    }
    continueNavigation();
  };

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const blockedLocation = `${blocker.location.key}:${blocker.location.pathname}${blocker.location.search}${blocker.location.hash}`;
    if (handledBlockedLocation.current === blockedLocation) return;
    handledBlockedLocation.current = blockedLocation;

    const guard = guardForPage(page);
    const continueNavigation = () => {
      handledBlockedLocation.current = null;
      blocker.proceed();
    };
    const cancelNavigation = () => {
      handledBlockedLocation.current = null;
      blocker.reset();
    };
    if (guard) guard(continueNavigation, cancelNavigation);
    else continueNavigation();
  }, [blocker, page]);

  const navigateWorkspace = useCallback((path: string) => routerNavigate(path), [routerNavigate]);

  if (legacyProjectIdOf(location.pathname)) {
    return <Navigate to={builderPath(legacyProjectIdOf(location.pathname), new URLSearchParams(location.search).get("domain")?.trim() ?? "")} replace />;
  }

  const playgroundRoute = playgroundRouteOf(location.pathname);
  if (playgroundRoute?.projectId) {
    if (workspaceProjects.projects && !workspaceProjects.projects.some((project) => project.id === playgroundRoute.projectId)) {
      return <Navigate to={workspaceProjects.projects.length === 0 ? PROJECT_CREATE_PATH : WORKSPACE_PATH} replace />;
    }
    return (
      <>
        <PlaygroundWorkspace
          projectId={playgroundRoute.projectId}
          domainId={playgroundRoute.domainId}
          queryId={playgroundRoute.queryId}
          projects={workspaceProjects.projects ?? []}
          connectionStatus={database.connectionStatus}
          provider={database.connectedProvider}
          onNavigate={navigateWorkspace}
          onOpenConnection={requestDatabaseConnection}
        />
        {connectionDialogOpen && <ConnectionDialog onClose={() => setConnectionDialogOpen(false)} />}
      </>
    );
  }

  return (
    <main className={`app-shell${page === "home" ? " home-shell" : " workspace-shell"}`}>
      <header className="topbar">
        <div className="header-brand-group">
          <button className="brand" type="button" aria-label="Open Query home" onClick={() => navigateToPage("home")}><img className="brand-logo" src="/brand-concepts/23-oquery-orbit-core.svg" alt="" /></button>
          <span className="header-product-tag">DATA QUERY ENGINE</span>
        </div>
        <div className="topbar-workspace-context">
          <WorkspaceContextBar page={page} projects={workspaceProjects.projects} onNavigate={navigateWorkspace} />
        </div>
        <div className="top-actions">
          {database.providerCheckStatus === "loading" ? (
            <button className="database-status connecting" type="button" onClick={() => setConnectionDialogOpen(true)} aria-live="polite">
              <span className="database-status-dot" />
              <Icon name="database" size={15} />
              <span>Checking connection…</span>
            </button>
          ) : database.providerCheckStatus === "failed" ? (
            <button className="database-status failed" type="button" onClick={() => setConnectionDialogOpen(true)} title={database.connectionError}>
              <span className="database-status-dot" />
              <Icon name="database" size={15} />
              <span>Connection status unavailable</span>
            </button>
          ) : database.connectionStatus === "loading" ? (
            <button className="database-status connecting" type="button" onClick={() => setConnectionDialogOpen(true)} aria-live="polite">
              <span className="database-status-dot" />
              <Icon name={getDatabaseIconName(database.connectingProvider)} size={15} />
              <span>Connecting{database.connectingProvider ? ` · ${database.connectingProvider}` : ""}</span>
            </button>
          ) : database.connectionStatus === "succeeded" ? (
            <button className="database-status connected" type="button" onClick={() => setConnectionDialogOpen(true)} title="Change database connection">
              <span className="database-status-dot" />
              <Icon name={getDatabaseIconName(database.connectedProvider)} size={15} />
              <span>{database.connectedProvider || "Connecting"}</span>
            </button>
          ) : (
            <button className={`database-status${database.connectionStatus === "failed" ? " failed" : ""}`} type="button" onClick={() => setConnectionDialogOpen(true)}>
              <span className="database-status-dot" />
              <Icon name="database" size={15} />
              <span>{database.connectionStatus === "failed" ? "Connection failed · Retry" : "Not connected"}</span>
            </button>
          )}
          <button className="avatar" type="button" aria-label="User profile">N</button>
        </div>
      </header>

      <WorkspaceNavigation page={page} onNavigate={navigateWorkspace} />
      <PageSubnav
        page={page}
        onNavigateToPage={navigateToPage}
        onBuilderDomainSelect={navigateToBuilderDomain}
        onMetadataSectionSelect={(section) => {
          if (section === "explorer") {
          if (metadataSectionNavigation.current) metadataSectionNavigation.current(section);
          else routerNavigate(DATABASE_EXPLORER_PATH);
          return;
          }
          if (metadataSectionNavigation.current) {
          metadataSectionNavigation.current(section);
          return;
          }
          routerNavigate(section === "domains" ? DOMAINS_PATH : DIAGRAMS_PATH);
        }}
      />
      <div className="page-content">
        {showWorkspaceGate && (
          <WorkspaceGate
            projects={workspaceProjects.projects}
            failed={workspaceProjects.failed}
            onSelectProject={(projectId) => navigateWorkspace(page === "builder"
              ? builderPath(projectId)
              : `${location.pathname}?${new URLSearchParams({ project: projectId }).toString()}`)}
            onProjectCreated={(projectId, domainId) => navigateWorkspace(`${DOMAINS_PATH}?${new URLSearchParams({ project: projectId, domain: domainId }).toString()}`)}
          />
        )}
        <Routes>
          <Route path={PAGE_PATHS.home} element={<div className="page-transition page-transition-no-slide"><Home onNavigateToPage={navigateToPage} onBuilderDomainSelect={navigateToBuilderDomain} onRequestConnection={requestDatabaseConnection} /></div>} />
          <Route path={PAGE_PATHS.documentation} element={<div className="page-transition page-transition-no-slide"><Documentation /></div>} />
          <Route path={PAGE_PATHS.builder} element={null} />
          <Route path={LEGACY_BUILDER_PATH} element={<LegacyQueryBuilderRedirect />} />
          <Route path={WORKSPACE_PATH} element={<div className="page-transition page-transition-no-slide"><WorkspacePage /></div>} />
          <Route path={PROJECT_CREATE_PATH} element={<div className="page-transition page-transition-no-slide"><CreateProjectPage /></div>} />
          <Route path={PAGE_PATHS.metadata} element={null} />
          <Route path={DOMAINS_PATH} element={null} />
          <Route path={DIAGRAMS_PATH} element={null} />
          <Route path={DATABASE_EXPLORER_PATH} element={null} />
          <Route path={PAGE_PATHS.functions} element={null} />
          <Route path={PAGE_PATHS.security} element={showWorkspaceGate ? null : <div className="page-transition page-transition-no-slide"><SecurityPage /></div>} />
          <Route path={LEGACY_FUNCTIONS_PATH} element={<Navigate to={PAGE_PATHS.functions} replace />} />
          <Route path={PAGE_PATHS.sources} element={<div className="page-transition page-transition-no-slide"><DataSources onRequestConnection={requestDatabaseConnection} /></div>} />
          <Route path={ADMIN_PATH} element={<div className="page-transition page-transition-no-slide"><AdminAnalytics /></div>} />
          <Route path={PRIVACY_PATH} element={<PolicyPage kind="privacy" />} />
          <Route path={TERMS_PATH} element={<PolicyPage kind="terms" />} />
          <Route path="*" element={<Navigate to={PAGE_PATHS.home} replace />} />
        </Routes>
      {analyticsConsent === null && (
        <AnalyticsConsentNotice
          onChoose={(value) => {
            if (value === "granted") saveAnalyticsConsent(value);
            setAnalyticsConsent(value);
          }}
          onOpenPrivacy={() => routerNavigate(PRIVACY_PATH)}
        />
      )}
      {connectionDialogOpen && <ConnectionDialog onClose={() => setConnectionDialogOpen(false)} />}
      {page === "builder" && !showWorkspaceGate && <QueryBuilder
        key={builderDomainIdOf(location.pathname) || "query-builder"}
        routeProjectId={builderProjectIdOf(location.pathname)}
        onRequestConnection={requestDatabaseConnection}
        onNavigationGuardChange={updateBuilderNavigationGuard}
        onBackToHome={new URLSearchParams(location.search).get("from") === "home"
          ? () => navigateToPage("home")
          : undefined}
      />}
      {metadataVisited && page === "metadata" && !showWorkspaceGate && location.pathname !== DATABASE_EXPLORER_PATH && <div className="page-transition page-transition-no-slide"><MetadataBuilder onNavigationGuardChange={updateMetadataNavigationGuard} onSectionNavigationChange={updateMetadataSectionNavigation} /></div>}
      {metadataVisited && page === "metadata" && !showWorkspaceGate && location.pathname === DATABASE_EXPLORER_PATH && <DataSources onRequestConnection={requestDatabaseConnection} />}
      {functionDefinitionsVisited && !showWorkspaceGate && <div hidden={page !== "functions"} className={page === "functions" ? "page-transition page-transition-no-slide" : undefined}>
        <FunctionDefinitionsWorkspace onNavigationGuardChange={updateFunctionNavigationGuard} />
      </div>}
      </div>
      <footer>
        <span><span className="footer-mark">✦</span> oQuery engine</span>
        <span>Metadata-driven queries · Client preview</span>
        <nav className="footer-links" aria-label="Legal">
          <button type="button" onClick={() => routerNavigate(PRIVACY_PATH)}>Privacy Notice</button>
          <button type="button" onClick={() => routerNavigate(TERMS_PATH)}>Terms</button>
          <button type="button" onClick={() => {
            saveAnalyticsConsent(null);
            setAnalyticsConsent(null);
          }}>Analytics settings</button>
        </nav>
        <span>© 2026 Your App</span>
      </footer>
    </main>
  );
}

// Without a host-provided <base href>, document.baseURI is the current deep link, which would hide the route.
const routerBasename = document.querySelector("base") ? new URL(document.baseURI).pathname.replace(/\/$/, "") : "";
const router = createBrowserRouter([{ path: "*", element: <App /> }], { basename: routerBasename });

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <MessageBoxProvider><RouterProvider router={router} /></MessageBoxProvider>
  </Provider>,
);
