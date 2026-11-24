import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Icon, { type IconName } from "../shared/icon/icon";
import PageHeaderActions, { type HeaderAction } from "../shared/page-header/page-header-actions";
import { getProject, type ProjectSummary } from "../../services/project-service";
import MainLayoutSelect from "./main-layout-select";
import MainLayoutSidebar, { useSidebarCollapse } from "./main-layout-sidebar";
import "./main-layout.css";
import "./main-layout-compat.css";

export type WorkspaceView = "overview" | "playground" | "queries" | "diagram" | "explorer" | "functions" | "security";
export type WorkspaceDomain = { id: string; name: string };
// Custom functions is project-scoped data, but its URL carries no project or domain; the project is passed as ?project=.
export const CUSTOM_FUNCTIONS_PATH = "/sqlfunctions";
export const DATABASE_EXPLORER_PATH = "/metadata/explorer";

// Domain lists per project, kept across MainLayout mounts so page changes don't flash an empty selector.
const projectDomainsCache = new Map<string, WorkspaceDomain[]>();
const domainListListeners = new Set<(projectId: string) => void>();

// Tells a mounted layout to refetch its domain selector after a domain is created or deleted.
export function notifyWorkspaceDomainsChanged(projectId: string) {
  domainListListeners.forEach((listener) => listener(projectId));
}

type HeaderProps = {
  projects: ProjectSummary[];
  projectId: string;
  domains: WorkspaceDomain[];
  domainId: string;
  connectionStatus: string;
  provider: string;
  onSelectProject: (projectId: string) => void;
  onSelectDomain: (domainId: string) => void;
  onOpenConnection: () => void;
  onNavigateHome: () => void;
  // Replaces the default Project/Domain selectors when a page is not project-scoped.
  headerContext?: ReactNode;
};

function Header({ projects, projectId, domains, domainId, connectionStatus, provider, onSelectProject, onSelectDomain, onOpenConnection, onNavigateHome, headerContext }: HeaderProps) {
  const connectionState = connectionStatus === "loading" ? "connecting"
    : connectionStatus === "failed" ? "failed"
      : connectionStatus === "succeeded" ? "connected" : "";
  const connectionLabel = connectionStatus === "loading" ? "Connecting…"
    : connectionStatus === "failed" ? "Connection failed · Retry"
      : connectionStatus === "succeeded" ? (provider || "Connecting") : "Not connected";
  return <header className="root-header">
    <button type="button" className="main-layout-logo" onClick={onNavigateHome} aria-label="Go to home"><img src="/brand-concepts/23-oquery-orbit-core.svg" alt="" /><small>DATA QUERY ENGINE</small></button>
    {headerContext ?? <div className="main-layout-context">
      <MainLayoutSelect
        label="Current project"
        prefix="Project"
        icon="folder"
        value={projectId}
        placeholder={projects.length ? "Choose a project" : "No projects yet"}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={onSelectProject}
      />
      <MainLayoutSelect
        label="Active domain"
        prefix="Domain"
        icon="table"
        value={domainId}
        placeholder={projectId ? "No domains" : "Choose a project first"}
        disabled={domains.length === 0}
        options={domains.map((domain) => ({ value: domain.id, label: domain.name }))}
        onChange={onSelectDomain}
      />
    </div>}
    <div className="main-layout-actions">
      <button type="button" className={`database-status${connectionState ? ` ${connectionState}` : ""}`} onClick={onOpenConnection} aria-live="polite">
        <span className="database-status-dot" />
        <Icon name={connectionState === "connected" ? "check" : "database"} size={15} />
        <span>{connectionLabel}</span>
      </button>
      <button type="button" className="main-layout-notification" aria-label="Notifications"><Icon name="bell" size={15} /><em>3</em></button>
      <button type="button" className="main-layout-avatar" aria-label="User profile">N</button>
    </div>
  </header>;
}

export function Heading({ icon, title, text, action, onAction, actions, actionItems, status }: { icon: IconName; title: string; text: string; action?: string; onAction?: () => void; actions?: React.ReactNode; actionItems?: HeaderAction[]; status?: React.ReactNode }) {
  return <div className="page-header"><div className="main-layout-heading"><div><span className="main-layout-heading-icon"><Icon name={icon} size={23} /></span><span><h1>{title}</h1><p>{text}</p></span></div>{actions && <div className="main-layout-heading-actions">{actions}</div>}{actionItems && <div className="main-layout-heading-actions is-fluid"><PageHeaderActions actions={actionItems} status={status} /></div>}{action && <button className="main-layout-primary" type="button" onClick={onAction}><Icon name="plus" size={14} /> {action}</button>}</div></div>;
}

type MainLayoutProps = {
  view: WorkspaceView;
  projects: ProjectSummary[];
  projectId: string;
  domainId: string;
  connectionStatus: string;
  provider: string;
  onSelectView: (view: WorkspaceView, domainId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectDomain: (domainId: string) => void;
  onOpenConnection: () => void;
  onNavigateHome: () => void;
  headerContext?: ReactNode;
  children: (context: { domains: WorkspaceDomain[]; domainId: string }) => ReactNode;
};

export default function MainLayout({ view, projects, projectId, domainId, connectionStatus, provider, onSelectView, onSelectProject, onSelectDomain, onOpenConnection, onNavigateHome, headerContext, children }: MainLayoutProps) {
  // Remounts (e.g. moving from another page) would otherwise render an empty Active Domain list until the fetch returns.
  const [domains, setDomains] = useState<WorkspaceDomain[]>(() => projectDomainsCache.get(projectId) ?? []);
  const [domainsVersion, setDomainsVersion] = useState(0);
  const sidebar = useSidebarCollapse();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listener = (changedProjectId: string) => {
      if (changedProjectId !== projectId) return;
      projectDomainsCache.delete(changedProjectId);
      setDomainsVersion((version) => version + 1);
    };
    domainListListeners.add(listener);
    return () => {
      domainListListeners.delete(listener);
    };
  }, [projectId]);
  useEffect(() => {
    let active = true;
    if (!projectId) {
      setDomains([]);
      return;
    }
    setDomains(projectDomainsCache.get(projectId) ?? []);
    getProject(projectId)
      .then((details) => {
        if (!active) return;
        const next = details.domains.map((domain) => ({ id: domain.id, name: domain.name }));
        projectDomainsCache.set(projectId, next);
        setDomains(next);
      })
      .catch(() => {
        if (!active) return;
        setDomains([]);
      });
    return () => {
      active = false;
    };
  }, [projectId, domainsVersion]);
  const selectedDomainId = domains.length === 0
    ? domainId
    : (domains.some((domain) => domain.id === domainId) ? domainId : (domains[0]?.id ?? ""));
  // The main menu stays on screen while the page scrolls. Its height runs from its current top to the viewport
  // bottom, capped at the body's bottom, so it never extends past the body or grows the page as it scrolls.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const sidebar = body?.querySelector<HTMLElement>(".root-sidebar");
    if (!body || !sidebar) return;
    const update = () => {
      if (window.innerWidth <= 760) {
        sidebar.style.height = "";
        return;
      }
      const top = Math.max(0, sidebar.getBoundingClientRect().top);
      const bottom = Math.min(window.innerHeight, body.getBoundingClientRect().bottom);
      sidebar.style.height = `${Math.max(0, bottom - top)}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(body);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return <div className="root-workspace"><Header projects={projects} projectId={projectId} domains={domains} domainId={selectedDomainId} connectionStatus={connectionStatus} provider={provider} onSelectProject={onSelectProject} onSelectDomain={onSelectDomain} onOpenConnection={onOpenConnection} onNavigateHome={onNavigateHome} headerContext={headerContext} /><div ref={bodyRef} className={`root-body${view === "playground" ? " playground-body" : ""}`}><MainLayoutSidebar view={view} collapsed={sidebar.collapsed} onToggle={sidebar.toggle} onSelect={(next) => onSelectView(next, selectedDomainId)} /><main className={view === "playground" || view === "functions" || view === "explorer" ? "root-main-playground" : undefined}>{children({ domains, domainId: selectedDomainId })}</main></div><footer className="root-footer"><Icon name="schema" size={13} /> oQuery engine <span>Phase one</span><span>Data binding planned for phase two</span></footer></div>;
}
