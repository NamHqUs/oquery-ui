import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon, { type IconName } from "../icon/icon";
import { getDomain, getProject, type DomainDetails, type ProjectSummary } from "../../services/project-service";
import WorkspaceSelect from "./prototype-select";
import Playground from "../playground/playground";
import DomainDiagram from "../domain-diagram/domain-diagram";
import { domainDiagramPath } from "../domain-diagram/domain-diagram-routes";
import "./prototype-workspace.css";
import "./prototype-workspace-compat.css";

type View = "overview" | "playground" | "queries" | "diagram" | "explorer" | "functions" | "security";
const items: Array<[View, string, IconName]> = [
  ["overview", "Overview", "grid"], ["playground", "Playground", "play"], ["queries", "Queries", "file-text"],
  ["diagram", "Domain Diagram", "schema"], ["explorer", "Database explorer", "database"],
  ["functions", "Custom functions", "function"], ["security", "Security", "shield"],
];
const queries = ["Top customers by revenue", "Monthly order performance", "Unpaid orders audit", "Product conversion funnel", "Customer retention cohort"];

type HeaderProps = {
  projects: ProjectSummary[];
  projectId: string;
  domains: { id: string; name: string }[];
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
    <button type="button" className="prototype-logo" onClick={onNavigateHome} aria-label="Go to home"><img src="/brand-concepts/23-oquery-orbit-core.svg" alt="" /><small>DATA QUERY ENGINE</small></button>
    <div className="prototype-context">
      <WorkspaceSelect
        label="CURRENT PROJECT"
        icon="folder"
        value={projectId}
        placeholder={projects.length ? "Choose a project" : "No projects yet"}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={onSelectProject}
      />
      <i />
      <WorkspaceSelect
        label="ACTIVE DOMAIN"
        icon="table"
        value={domainId}
        placeholder={projectId ? "No domains" : "Choose a project first"}
        disabled={domains.length === 0}
        options={domains.map((domain) => ({ value: domain.id, label: domain.name }))}
        onChange={onSelectDomain}
      />
    </div>
    <div className="prototype-actions">
      <button type="button" className={`database-status${connectionState ? ` ${connectionState}` : ""}`} onClick={onOpenConnection} aria-live="polite">
        <span className="database-status-dot" />
        <Icon name={connectionState === "connected" ? "check" : "database"} size={15} />
        <span>{connectionLabel}</span>
      </button>
      <button type="button" className="prototype-notification" aria-label="Notifications"><Icon name="bell" size={15} /><em>3</em></button>
      <button type="button" className="prototype-avatar" aria-label="User profile">N</button>
    </div>
  </header>;
}


function Sidebar({ view, setView, collapsed, onToggle }: { view: View; setView: (view: View) => void; collapsed: boolean; onToggle: () => void }) {
  return <aside className={`root-sidebar${collapsed ? " collapsed" : ""}`}>
    <button type="button" className="root-sidebar-toggle" aria-label={collapsed ? "Expand main menu" : "Collapse main menu"} onClick={onToggle}>
      <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={14} />
    </button>
    <nav>{items.map(([id, label, icon]) => <button key={id} type="button" className={view === id ? "active" : ""} title={label} aria-label={label} onClick={() => setView(id)}><Icon name={icon} size={19} /><span>{label}</span></button>)}</nav>
    {!collapsed && <p>Smarter queries.<br />Deeper insights.</p>}
  </aside>;
}

function Heading({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: string }) {
  return <div className="prototype-heading"><div><span className="prototype-heading-icon"><Icon name={icon} size={23} /></span><span><h1>{title}</h1><p>{text}</p></span></div>{action && <button className="prototype-primary" type="button"><Icon name="plus" size={14} /> {action}</button>}</div>;
}

function Panel({ title, icon, children, className = "" }: { title: string; icon: IconName; children: React.ReactNode; className?: string }) {
  return <section className={`prototype-panel ${className}`}><header><span><Icon name={icon} size={16} /><b>{title}</b></span><small>View all →</small></header>{children}</section>;
}

function Overview() {
  return <><Heading icon="grid" title="Overview" text="Your data workspace at a glance" /><div className="prototype-stats">{[["schema", "Total entities", "24", "+2"], ["file-text", "Saved queries", "128", "+12"], ["check", "Query success rate", "98.6%", "+0.8%"], ["chart-line", "Data freshness", "2 min ago", "-6 min"]].map(([icon, label, value, change]) => <article key={label}><Icon name={icon as IconName} size={21} /><span>{label}<b>{value}</b><em>↑ {change} <small>vs. last 7 days</small></em></span></article>)}</div><div className="prototype-overview-grid"><Panel title="Query activity" icon="chart-line" className="wide"><div className="prototype-line-chart"><svg viewBox="0 0 700 180" preserveAspectRatio="none"><path d="M0 150 C70 130 90 145 140 105 S220 130 270 82 S350 110 400 62 S480 90 530 48 S610 78 700 20" /></svg></div></Panel><Panel title="Recent queries" icon="file-text"><div className="prototype-list">{queries.slice(0, 4).map(q => <p key={q}><Icon name="chart-bar" size={15} /><b>{q}<small>Successful · 2 min ago</small></b><em>✓</em></p>)}</div></Panel><Panel title="Schema health" icon="schema"><div className="prototype-health">{["Tables", "Views", "Functions", "Indexes", "Relations"].map(x => <p key={x}>{x}<b>Healthy</b></p>)}</div></Panel><Panel title="Quick actions" icon="play"><div className="prototype-actions-list">{["New query", "Explore schema", "Add custom function"].map(x => <button type="button" key={x}>{x}<span>›</span></button>)}</div></Panel></div></>;
}

function Queries() {
  return <><Heading icon="file-text" title="Saved queries" text="Organize, reuse, and collaborate on your data questions" action="New query" /><div className="prototype-toolbar"><input placeholder="⌕  Search queries..." /><span>All　5</span><span>☆ Favorites 1</span><span>♧ Shared with me 2</span><span>◷ Recent</span></div><div className="prototype-query-layout"><section className="prototype-panel query-list">{queries.map((q, i) => <article className={i === 0 ? "selected" : ""} key={q}><Icon name="chart-bar" size={19} /><div><b>{q}</b><p>Find insights and track business performance across your data</p></div><small>{["Sarah Johnson", "Michael Chen", "Emily Rodriguez", "David Kim", "Laura Garcia"][i]}<br />Analyst</small><em>{["Revenue", "Operations", "Finance", "Marketing", "Analytics"][i]}</em><button className="prototype-primary" type="button">▷ Run</button></article>)}</section><Panel title="Top customers by revenue" icon="chart-bar" className="query-inspector"><p>Find the top 10 customers by revenue in the last 3 months</p><b className="prototype-badge">Healthy</b><h3>Query code</h3><pre>{`SELECT c.customer_id,\n  c.first_name,\n  SUM(o.total_amount) AS total_revenue\nFROM customer c\nJOIN order o ON c.customer_id = o.customer_id\nORDER BY total_revenue DESC\nLIMIT 10;`}</pre><h3>Entities used</h3><div className="prototype-chips"><span>Customer</span><span>Order</span><span>Payment</span></div><button className="prototype-primary" type="button">Open in playground</button><button type="button">Share query</button></Panel></div></>;
}

function DomainDiagramView({ projectId, domainId, domains, onSelectDomain }: { projectId: string; domainId: string; domains: { id: string; name: string }[]; onSelectDomain: (domainId: string) => void }) {
  const [details, setDetails] = useState<DomainDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!projectId || !domainId) {
      setDetails(null);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    getDomain(projectId, domainId)
      .then((resolved) => {
        if (active) setDetails(resolved);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setDetails(null);
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, domainId]);
  return <>
    <Heading icon="schema" title="Domain Diagram" text="Explore your data model, understand relationships, and get AI-powered insights" />
    {!domainId
      ? <div className="entity-diagram-state">Choose a domain to view its diagram.</div>
      : error
        ? <div className="entity-diagram-state error">{error}</div>
        : <DomainDiagram entities={details?.entities ?? []} relations={details?.relations ?? []} domainOptions={domains} activeDomainId={domainId} loading={loading} onSelectDomain={onSelectDomain} />}
  </>;
}

function Explorer() {
  return <><Heading icon="database" title="Database explorer" text="Browse source tables and inspect your connected data" /><div className="prototype-toolbar"><input placeholder="⌕  Search tables, columns or keywords..." /><span>Schema · public⌄</span><span>All tables　6</span><span>☆ Recently viewed</span></div><div className="prototype-explorer"><Panel title="Table catalog" icon="database" className="catalog">{["customers", "orders", "products", "payments", "addresses", "inventory"].map(x => <button className={x === "orders" ? "selected" : ""} type="button" key={x}><Icon name="table" size={16} /><b>{x}<small>1,248,763 rows</small></b>›</button>)}</Panel><section className="prototype-panel table-detail"><h2>▣　orders <small>Table</small></h2><p>Order transactions and purchase details</p><header><b>Columns</b><span>Data　 Indexes　 Relationships</span></header><h3>Table columns <small>8 columns</small></h3><table><thead><tr><th>#</th><th>Column name</th><th>Data type</th><th>Key</th><th>Nullable</th></tr></thead><tbody>{[["1", "id", "bigint", "PK", "No"], ["2", "customer_id", "bigint", "FK", "No"], ["3", "order_date", "timestamp", "-", "No"], ["4", "status", "varchar(20)", "-", "No"], ["5", "total_amount", "decimal(10,2)", "-", "No"]].map(row => <tr key={row[1]}>{row.map(x => <td key={x}>{x}</td>)}</tr>)}</tbody></table></section><Panel title="Table metadata" icon="database" className="metadata"><button className="prototype-primary" type="button">◉ Preview data</button>{["Table size|182.4 MB", "Row count|1,248,763", "Indexes|3", "Relationships|3", "Last sync|2 min ago"].map(x => { const [a, b] = x.split("|"); return <p key={a}>{a}<b>{b}</b></p>; })}</Panel></div></>;
}

function Functions() {
  return <><Heading icon="function" title="Custom functions" text="Extend your business vocabulary with reusable query logic" action="New function" /><div className="prototype-toolbar"><input placeholder="⌕  Search functions..." /><span>All　5</span><span>● Published 4</span><span>○ Drafts 1</span></div><div className="prototype-query-layout"><section className="prototype-panel function-list">{["revenue_growth", "safe_divide", "customer_segment", "days_since_order", "format_currency"].map((x, i) => <article className={i === 0 ? "selected" : ""} key={x}><Icon name="function" size={19} /><div><b>{x}</b><p>{["Calculate revenue growth rate between two periods", "Safely divide two numbers with zero handling", "Classify customers into segments", "Calculate days since last order", "Format amount as currency"][i]}</p></div><em>{i === 0 ? "DECIMAL(10,4)" : "TEXT"}</em><small>{1200 - i * 153} usages</small><strong>{i === 4 ? "Draft" : "Published"}</strong><button className="prototype-primary" type="button">Run test</button></article>)}</section><Panel title="revenue_growth" icon="function" className="query-inspector"><p>Calculate revenue growth rate between two periods</p><h3>Signature</h3><pre>revenue_growth(current_revenue NUMERIC, previous_revenue NUMERIC) → DECIMAL(10,4)</pre><h3>SQL syntax</h3><pre>{`CREATE OR REPLACE FUNCTION revenue_growth(\n current_revenue NUMERIC,\n previous_revenue NUMERIC\n) RETURNS DECIMAL(10,4) AS $$\nBEGIN\n RETURN ((current_revenue - previous_revenue)\n / previous_revenue) * 100;\nEND;`}</pre><button className="prototype-primary" type="button">Save changes</button><button type="button">Test function</button><button type="button">Publish</button></Panel></div></>;
}

function Security() {
  return <><Heading icon="shield" title="Security & access" text="Control who can discover, query, and share your data" /><div className="prototype-stats">{[["check", "Policy coverage", "100%", "+2%"], ["eye-off", "Active policies", "12", "+3"], ["group", "Access requests", "3", "+1"], ["file-text", "Audit events", "1,248", "+18"]].map(([icon, label, value, change]) => <article key={label}><Icon name={icon as IconName} size={21} /><span>{label}<b>{value}</b><em>↑ {change}</em></span></article>)}</div><div className="prototype-query-layout"><section className="prototype-panel policy-list"><header><b>Policies</b><span>Roles　 Access requests　 Audit log</span></header>{["Row-level customer access", "Finance revenue protection", "PII masking", "Production read-only"].map((x, i) => <article className={i === 2 ? "selected" : ""} key={x}><Icon name={i === 2 ? "eye-off" : "shield"} size={18} /><div><b>{x}</b><p>{["Users can only see their assigned customers", "Restrict access to revenue and financial metrics", "Mask personally identifiable information", "Prevent write operations in production"][i]}</p></div><strong>Active</strong><small>{["Customers", "Finance", "All tables", "Production"][i]}</small><Icon name="edit" size={14} /></article>)}</section><Panel title="PII masking" icon="eye-off" className="query-inspector"><p>Mask personally identifiable information in query results and exports.</p><h3>Protected fields</h3><div className="prototype-chips"><span>customer_email · MASK</span><span>customer_phone · MASK</span><span>customer_name · MASK</span><span>address · MASK</span></div><h3>Rule preview</h3><pre>{`CASE\n WHEN current_role IN ('analytics', 'marketing')\n THEN customer_email\n ELSE '***MASKED***'\nEND AS customer_email`}</pre><button className="prototype-primary" type="button">Edit policy</button><button type="button">Test policy</button></Panel></div></>;
}

export default function PlaygroundWorkspace({ projectId, domainId, queryId, projects, connectionStatus, provider, diagramRoute, onNavigate, onOpenConnection }: {
  projectId: string;
  domainId: string;
  queryId: string;
  projects: ProjectSummary[];
  connectionStatus: string;
  provider: string;
  diagramRoute: boolean;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
}) {
  const [view, setView] = useState<View>(diagramRoute ? "diagram" : "playground");
  useEffect(() => {
    if (diagramRoute) setView("diagram");
    else setView((current) => (current === "diagram" ? "playground" : current));
  }, [diagramRoute]);
  const [domains, setDomains] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let active = true;
    if (!projectId) {
      setDomains([]);
      return;
    }
    getProject(projectId)
      .then((details) => {
        if (active) setDomains(details.domains.map((domain) => ({ id: domain.id, name: domain.name })));
      })
      .catch(() => {
        if (active) setDomains([]);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  const selectedDomainId = domains.length === 0
    ? domainId
    : (domains.some((domain) => domain.id === domainId) ? domainId : (domains[0]?.id ?? ""));
  const selectView = (next: View) => {
    if (next === "diagram") {
      if (!diagramRoute) onNavigate(domainDiagramPath(projectId, selectedDomainId));
    } else if (diagramRoute) {
      onNavigate(`/playground/${encodeURIComponent(projectId)}${selectedDomainId ? `/${encodeURIComponent(selectedDomainId)}` : ""}`);
    }
    setView(next);
  };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
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
  return <div className="root-workspace"><Header projects={projects} projectId={projectId} domains={domains} domainId={selectedDomainId} connectionStatus={connectionStatus} provider={provider} onSelectProject={(id) => { if (id) onNavigate(`/playground/${encodeURIComponent(id)}`); }} onSelectDomain={(id) => { if (!id) return; onNavigate(diagramRoute ? domainDiagramPath(projectId, id) : `/playground/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`); }} onOpenConnection={onOpenConnection} onNavigateHome={() => onNavigate("/")} /><div ref={bodyRef} className={`root-body${view === "playground" ? " playground-body" : ""}`}><Sidebar view={view} setView={selectView} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)} /><main className={view === "playground" ? "root-main-playground" : undefined}>{view === "overview" ? <Overview /> : view === "playground" ? <Playground queryId={queryId} projectId={projectId} domainId={selectedDomainId} /> : view === "queries" ? <Queries /> : view === "diagram" ? <DomainDiagramView projectId={projectId} domainId={selectedDomainId} domains={domains} onSelectDomain={(id) => onNavigate(domainDiagramPath(projectId, id))} /> : view === "explorer" ? <Explorer /> : view === "functions" ? <Functions /> : <Security />}</main></div><footer className="root-footer"><Icon name="schema" size={13} /> oQuery engine <span>Phase one</span><span>Data binding planned for phase two</span></footer></div>;
}
