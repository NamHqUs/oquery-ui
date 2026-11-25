import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon, { type IconName } from "../shared/icon/icon";
import PageHeaderActions, { type HeaderAction } from "../shared/page-header/page-header-actions";
import { getProject, type ProjectSummary } from "../../services/project-service";
import MainLayoutSelect from "./main-layout-select";
import MainLayoutSidebar, { useSidebarCollapse } from "./main-layout-sidebar";
import "./main-layout.css";
import "./main-layout-compat.css";

export type WorkspaceView = "overview" | "playground" | "queries" | "diagram" | "explorer" | "functions" | "workspace";
export type WorkspaceDomain = { id: string; name: string; entityCount?: number };
// Chip colors cycle through the diagram tones in the order the legacy domain chips used.
const DOMAIN_CHIP_TONES = ["customer", "product", "finance", "custom", "revenue"] as const;
// Custom functions is project-scoped data, but its URL carries no project or domain; the project is passed as ?project=.
export const CUSTOM_FUNCTIONS_PATH = "/sqlfunctions";
export const DATABASE_EXPLORER_PATH = "/database-explorer";
// The explorer is bound to a project through its path: /database-explorer/<projectId>.
export const databaseExplorerPath = (projectId: string) => (projectId ? `${DATABASE_EXPLORER_PATH}/${encodeURIComponent(projectId)}` : DATABASE_EXPLORER_PATH);
export const isDatabaseExplorerPath = (pathname: string) => pathname === DATABASE_EXPLORER_PATH || pathname.startsWith(`${DATABASE_EXPLORER_PATH}/`);
export const databaseExplorerProjectIdOf = (pathname: string) => {
  const match = pathname.match(/^\/database-explorer\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
};

// Domain lists per project, kept across MainLayout mounts so page changes don't flash an empty selector.
const projectDomainsCache = new Map<string, WorkspaceDomain[]>();
const domainListListeners = new Set<(projectId: string) => void>();

// Tells a mounted layout to refetch its domain selector after a domain is created or deleted.
export function notifyWorkspaceDomainsChanged(projectId: string) {
  domainListListeners.forEach((listener) => listener(projectId));
}

type HeaderProps = {
  onNavigateHome: () => void;
};

function Header({ onNavigateHome, setSlot }: HeaderProps & { setSlot: (element: HTMLDivElement | null) => void }) {
  return <header className="root-header">
    <button type="button" className="main-layout-logo" onClick={onNavigateHome} aria-label="Go to home"><img src="/brand-concepts/23-oquery-orbit-core.svg" alt="" /><small>DATA QUERY ENGINE</small></button>
    <div className="root-header-page"><div className="root-header-slot" ref={setSlot} /></div>
  </header>;
}

// The root header owns one stable slot. Pages render their header through PageHeader, which portals into it,
// so a page's header updates only re-render that page instead of looping through the layout.
const PageHeaderSlotContext = createContext<HTMLDivElement | null>(null);

export function PageHeader({ children }: { children: ReactNode }) {
  const slot = useContext(PageHeaderSlotContext);
  return slot ? createPortal(children, slot) : null;
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
  // Project-only pages (such as the database explorer) hide the Domain selector.
  hideDomainSelect?: boolean;
  // Scope selectors belong to the main content area for pages that work inside a project/domain.
  showWorkspaceContext?: boolean;
  children: (context: { domains: WorkspaceDomain[]; domainId: string }) => ReactNode;
};

const DOMAIN_CHIP_GAP = 6;

// Shows as many domain chips as fit on one line; the rest move into a "More..." menu.
function DomainSwitch({ domains, domainId, projectId, onSelectDomain }: { domains: WorkspaceDomain[]; domainId: string; projectId: string; onSelectDomain: (domainId: string) => void }) {
  const switchRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // An invisible copy of every chip gives natural widths, so the visible row can be fitted without reflowing.
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(domains.length);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const fit = () => {
      const chipWidths = Array.from(measure.querySelectorAll<HTMLElement>(".main-layout-domain-chip"), (chip) => chip.getBoundingClientRect().width);
      const moreWidth = measure.querySelector<HTMLElement>(".main-layout-domain-more-measure")?.getBoundingClientRect().width ?? 0;
      const total = chipWidths.reduce((sum, width) => sum + width + DOMAIN_CHIP_GAP, -DOMAIN_CHIP_GAP);
      if (total <= row.clientWidth) {
        setVisibleCount(chipWidths.length);
        return;
      }
      let used = moreWidth + DOMAIN_CHIP_GAP;
      let count = 0;
      for (const width of chipWidths) {
        if (used + width > row.clientWidth) break;
        used += width + DOMAIN_CHIP_GAP;
        count++;
      }
      setVisibleCount(count);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [domains]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!switchRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);

  const select = (id: string) => {
    setMenuOpen(false);
    onSelectDomain(id);
  };
  const renderChip = (domain: WorkspaceDomain, index: number, extraClass = "") => (
    <button
      type="button"
      key={domain.id}
      className={`main-layout-domain-chip tone-${DOMAIN_CHIP_TONES[index % DOMAIN_CHIP_TONES.length]}${domain.id === domainId ? " active" : ""}${extraClass}`}
      aria-pressed={domain.id === domainId}
      onClick={() => select(domain.id)}
    >
      <span className="main-layout-domain-mark" aria-hidden="true" />
      <strong>{domain.name}</strong>
      <span className="main-layout-domain-count">{domain.entityCount ?? 0}</span>
    </button>
  );
  const hidden = domains.slice(visibleCount);

  return <div className="main-layout-domain-switch" ref={switchRef} role="group" aria-label="Active domain">
    <div className="main-layout-domain-row" ref={rowRef}>
      {domains.slice(0, visibleCount).map((domain, index) => renderChip(domain, index))}
      {domains.length === 0 && <span className="main-layout-domain-empty">{projectId ? "No domains" : "Choose a project first"}</span>}
      {hidden.length > 0 && <button type="button" className="main-layout-domain-more" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>More...</button>}
    </div>
    {menuOpen && hidden.length > 0 && <div className="main-layout-domain-menu" role="menu">
      {hidden.map((domain, index) => renderChip(domain, visibleCount + index, " menu-item"))}
    </div>}
    <div className="main-layout-domain-measure" ref={measureRef} aria-hidden="true">
      {domains.map((domain, index) => renderChip(domain, index))}
      <span className="main-layout-domain-more-measure">More...</span>
    </div>
  </div>;
}

function WorkspaceContext({ projects, projectId, domains, domainId, connectionStatus, provider, onSelectProject, onSelectDomain, onOpenConnection, hideDomainSelect }: Pick<MainLayoutProps, "projects" | "projectId" | "connectionStatus" | "provider" | "onSelectProject" | "onSelectDomain" | "onOpenConnection"> & { domains: WorkspaceDomain[]; domainId: string; hideDomainSelect?: boolean }) {
  const connectionState = connectionStatus === "loading" ? "connecting"
    : connectionStatus === "failed" ? "failed"
      : connectionStatus === "succeeded" ? "connected" : "";
  const connectionLabel = connectionStatus === "loading" ? "Connecting…"
    : connectionStatus === "failed" ? "Connection failed · Retry"
      : connectionStatus === "succeeded" ? (provider || "Connecting") : "Not connected";
  return <div className="main-layout-context root-main-context">
    <div className="root-main-context-selectors">
      <MainLayoutSelect
        label="Current project"
        prefix="Project"
        icon="folder"
        value={projectId}
        placeholder={projects.length ? "Choose a project" : "No projects yet"}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={onSelectProject}
      />
      {!hideDomainSelect && <DomainSwitch domains={domains} domainId={domainId} projectId={projectId} onSelectDomain={onSelectDomain} />}
    </div>
    <button type="button" className={`database-status button${connectionState ? ` ${connectionState}` : ""}`} onClick={onOpenConnection} aria-live="polite">
      <span className="database-status-dot" />
      <Icon name={connectionState === "connected" ? "check" : "database"} size={15} />
      <span>{connectionLabel}</span>
    </button>
  </div>;
}

export default function MainLayout({ view, projects, projectId, domainId, connectionStatus, provider, onSelectView, onSelectProject, onSelectDomain, onOpenConnection, onNavigateHome, hideDomainSelect, showWorkspaceContext = true, children }: MainLayoutProps) {
  // Remounts (e.g. moving from another page) would otherwise render an empty Active Domain list until the fetch returns.
  const [domains, setDomains] = useState<WorkspaceDomain[]>(() => projectDomainsCache.get(projectId) ?? []);
  const [domainsVersion, setDomainsVersion] = useState(0);
  const sidebar = useSidebarCollapse();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
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
        const next = details.domains.map((domain) => ({ id: domain.id, name: domain.name, entityCount: domain.entities.length }));
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
  return <div className="root-workspace"><Header onNavigateHome={onNavigateHome} setSlot={setHeaderSlot} /><div ref={bodyRef} className={`root-body${view === "playground" ? " playground-body" : ""}`}><MainLayoutSidebar view={view} collapsed={sidebar.collapsed} onToggle={sidebar.toggle} onSelect={(next) => onSelectView(next, selectedDomainId)} /><main className={view === "playground" || view === "functions" || view === "explorer" ? "root-main-playground" : undefined}>{showWorkspaceContext && <WorkspaceContext projects={projects} projectId={projectId} domains={domains} domainId={selectedDomainId} connectionStatus={connectionStatus} provider={provider} onSelectProject={onSelectProject} onSelectDomain={onSelectDomain} onOpenConnection={onOpenConnection} hideDomainSelect={hideDomainSelect} />}<PageHeaderSlotContext.Provider value={headerSlot}>{children({ domains, domainId: selectedDomainId })}</PageHeaderSlotContext.Provider></main></div><footer className="root-footer"><Icon name="schema" size={13} /> oQuery engine</footer></div>;
}
