import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Icon, { type IconName } from "../shared/icon/icon";
import { getProject, type ProjectSummary } from "../../services/project-service";
import MainLayoutSelect from "./main-layout-select";
import "./main-layout.css";
import "./main-layout-compat.css";

export type WorkspaceView = "overview" | "playground" | "queries" | "diagram" | "explorer" | "functions" | "security";
export type WorkspaceDomain = { id: string; name: string };

// Domain lists per project, kept across MainLayout mounts so page changes don't flash an empty selector.
const projectDomainsCache = new Map<string, WorkspaceDomain[]>();
const domainListListeners = new Set<(projectId: string) => void>();

// Tells a mounted layout to refetch its domain selector after a domain is created or deleted.
export function notifyWorkspaceDomainsChanged(projectId: string) {
  domainListListeners.forEach((listener) => listener(projectId));
}

const items: Array<[WorkspaceView, string, IconName]> = [
  ["overview", "Overview", "grid"], ["playground", "Playground", "play"], ["queries", "Queries", "file-text"],
  ["diagram", "Domain Diagram", "schema"], ["explorer", "Database explorer", "database"],
  ["functions", "Custom functions", "function"], ["security", "Security", "shield"],
];

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
};

function Header({ projects, projectId, domains, domainId, connectionStatus, provider, onSelectProject, onSelectDomain, onOpenConnection, onNavigateHome }: HeaderProps) {
  const connectionState = connectionStatus === "loading" ? "connecting"
    : connectionStatus === "failed" ? "failed"
      : connectionStatus === "succeeded" ? "connected" : "";
  const connectionLabel = connectionStatus === "loading" ? "Connecting…"
    : connectionStatus === "failed" ? "Connection failed · Retry"
      : connectionStatus === "succeeded" ? (provider || "Connecting") : "Not connected";
  return <header className="root-header">
    <button type="button" className="main-layout-logo" onClick={onNavigateHome} aria-label="Go to home"><img src="/brand-concepts/23-oquery-orbit-core.svg" alt="" /><small>DATA QUERY ENGINE</small></button>
    <div className="main-layout-context">
      <MainLayoutSelect
        label="CURRENT PROJECT"
        icon="folder"
        value={projectId}
        placeholder={projects.length ? "Choose a project" : "No projects yet"}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={onSelectProject}
      />
      <i />
      <MainLayoutSelect
        label="ACTIVE DOMAIN"
        icon="table"
        value={domainId}
        placeholder={projectId ? "No domains" : "Choose a project first"}
        disabled={domains.length === 0}
        options={domains.map((domain) => ({ value: domain.id, label: domain.name }))}
        onChange={onSelectDomain}
      />
    </div>
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

function Sidebar({ view, setView, collapsed, onToggle }: { view: WorkspaceView; setView: (view: WorkspaceView) => void; collapsed: boolean; onToggle: () => void }) {
  return <aside className={`root-sidebar${collapsed ? " collapsed" : ""}`}>
    <button type="button" className="root-sidebar-toggle" aria-label={collapsed ? "Expand main menu" : "Collapse main menu"} onClick={onToggle}>
      <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={14} />
    </button>
    <nav>{items.map(([id, label, icon]) => <button key={id} type="button" className={view === id ? "active" : ""} title={label} aria-label={label} onClick={() => setView(id)}><Icon name={icon} size={19} /><span>{label}</span></button>)}</nav>
    {!collapsed && <p>Smarter queries.<br />Deeper insights.</p>}
  </aside>;
}

export function Heading({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: string }) {
  return <div className="main-layout-heading"><div><span className="main-layout-heading-icon"><Icon name={icon} size={23} /></span><span><h1>{title}</h1><p>{text}</p></span></div>{action && <button className="main-layout-primary" type="button"><Icon name="plus" size={14} /> {action}</button>}</div>;
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
  children: (context: { domains: WorkspaceDomain[]; domainId: string }) => ReactNode;
};

export default function MainLayout({ view, projects, projectId, domainId, connectionStatus, provider, onSelectView, onSelectProject, onSelectDomain, onOpenConnection, onNavigateHome, children }: MainLayoutProps) {
  // Remounts (e.g. moving from another page) would otherwise render an empty Active Domain list until the fetch returns.
  const [domains, setDomains] = useState<WorkspaceDomain[]>(() => projectDomainsCache.get(projectId) ?? []);
  const [domainsVersion, setDomainsVersion] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
        if (active) setDomains([]);
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
  return <div className="root-workspace"><Header projects={projects} projectId={projectId} domains={domains} domainId={selectedDomainId} connectionStatus={connectionStatus} provider={provider} onSelectProject={onSelectProject} onSelectDomain={onSelectDomain} onOpenConnection={onOpenConnection} onNavigateHome={onNavigateHome} /><div ref={bodyRef} className={`root-body${view === "playground" ? " playground-body" : ""}`}><Sidebar view={view} setView={(next) => onSelectView(next, selectedDomainId)} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)} /><main className={view === "playground" ? "root-main-playground" : undefined}>{children({ domains, domainId: selectedDomainId })}</main></div><footer className="root-footer"><Icon name="schema" size={13} /> oQuery engine <span>Phase one</span><span>Data binding planned for phase two</span></footer></div>;
}
