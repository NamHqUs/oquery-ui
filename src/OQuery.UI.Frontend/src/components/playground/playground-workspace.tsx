import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon, { type IconName } from "../shared/icon/icon";
import type { ProjectSummary } from "../../services/project-service";
import Playground from "./playground";
import { domainDiagramPath } from "../domains/domain-routes";
import MainLayout, { Heading, CUSTOM_FUNCTIONS_PATH, type WorkspaceView } from "../main-layout/main-layout";

// Views rendered inside the playground shell; custom functions and the diagram have their own routes.
const LOCAL_VIEWS: WorkspaceView[] = ["overview", "playground", "queries", "explorer", "security"];

const queries = ["Top customers by revenue", "Monthly order performance", "Unpaid orders audit", "Product conversion funnel", "Customer retention cohort"];

function Panel({ title, icon, children, className = "" }: { title: string; icon: IconName; children: React.ReactNode; className?: string }) {
  return <section className={`main-layout-panel ${className}`}><header><span><Icon name={icon} size={16} /><b>{title}</b></span><small>View all →</small></header>{children}</section>;
}

function Overview() {
  return <><Heading icon="grid" title="Overview" text="Your data workspace at a glance" /><div className="main-layout-stats">{[["schema", "Total entities", "24", "+2"], ["file-text", "Saved queries", "128", "+12"], ["check", "Query success rate", "98.6%", "+0.8%"], ["chart-line", "Data freshness", "2 min ago", "-6 min"]].map(([icon, label, value, change]) => <article key={label}><Icon name={icon as IconName} size={21} /><span>{label}<b>{value}</b><em>↑ {change} <small>vs. last 7 days</small></em></span></article>)}</div><div className="main-layout-overview-grid"><Panel title="Query activity" icon="chart-line" className="wide"><div className="main-layout-line-chart"><svg viewBox="0 0 700 180" preserveAspectRatio="none"><path d="M0 150 C70 130 90 145 140 105 S220 130 270 82 S350 110 400 62 S480 90 530 48 S610 78 700 20" /></svg></div></Panel><Panel title="Recent queries" icon="file-text"><div className="main-layout-list">{queries.slice(0, 4).map(q => <p key={q}><Icon name="chart-bar" size={15} /><b>{q}<small>Successful · 2 min ago</small></b><em>✓</em></p>)}</div></Panel><Panel title="Schema health" icon="schema"><div className="main-layout-health">{["Tables", "Views", "Functions", "Indexes", "Relations"].map(x => <p key={x}>{x}<b>Healthy</b></p>)}</div></Panel><Panel title="Quick actions" icon="play"><div className="main-layout-actions-list">{["New query", "Explore schema", "Add custom function"].map(x => <button type="button" key={x}>{x}<span>›</span></button>)}</div></Panel></div></>;
}

function Queries() {
  return <><Heading icon="file-text" title="Saved queries" text="Organize, reuse, and collaborate on your data questions" action="New query" /><div className="main-layout-toolbar"><input placeholder="⌕  Search queries..." /><span>All　5</span><span>☆ Favorites 1</span><span>♧ Shared with me 2</span><span>◷ Recent</span></div><div className="main-layout-query-layout"><section className="main-layout-panel query-list">{queries.map((q, i) => <article className={i === 0 ? "selected" : ""} key={q}><Icon name="chart-bar" size={19} /><div><b>{q}</b><p>Find insights and track business performance across your data</p></div><small>{["Sarah Johnson", "Michael Chen", "Emily Rodriguez", "David Kim", "Laura Garcia"][i]}<br />Analyst</small><em>{["Revenue", "Operations", "Finance", "Marketing", "Analytics"][i]}</em><button className="main-layout-primary" type="button">▷ Run</button></article>)}</section><Panel title="Top customers by revenue" icon="chart-bar" className="query-inspector"><p>Find the top 10 customers by revenue in the last 3 months</p><b className="main-layout-badge">Healthy</b><h3>Query code</h3><pre>{`SELECT c.customer_id,\n  c.first_name,\n  SUM(o.total_amount) AS total_revenue\nFROM customer c\nJOIN order o ON c.customer_id = o.customer_id\nORDER BY total_revenue DESC\nLIMIT 10;`}</pre><h3>Entities used</h3><div className="main-layout-chips"><span>Customer</span><span>Order</span><span>Payment</span></div><button className="main-layout-primary" type="button">Open in playground</button><button type="button">Share query</button></Panel></div></>;
}

function Explorer() {
  return <><Heading icon="database" title="Database explorer" text="Browse source tables and inspect your connected data" /><div className="main-layout-toolbar"><input placeholder="⌕  Search tables, columns or keywords..." /><span>Schema · public⌄</span><span>All tables　6</span><span>☆ Recently viewed</span></div><div className="main-layout-explorer"><Panel title="Table catalog" icon="database" className="catalog">{["customers", "orders", "products", "payments", "addresses", "inventory"].map(x => <button className={x === "orders" ? "selected" : ""} type="button" key={x}><Icon name="table" size={16} /><b>{x}<small>1,248,763 rows</small></b>›</button>)}</Panel><section className="main-layout-panel table-detail"><h2>▣　orders <small>Table</small></h2><p>Order transactions and purchase details</p><header><b>Columns</b><span>Data　 Indexes　 Relationships</span></header><h3>Table columns <small>8 columns</small></h3><table><thead><tr><th>#</th><th>Column name</th><th>Data type</th><th>Key</th><th>Nullable</th></tr></thead><tbody>{[["1", "id", "bigint", "PK", "No"], ["2", "customer_id", "bigint", "FK", "No"], ["3", "order_date", "timestamp", "-", "No"], ["4", "status", "varchar(20)", "-", "No"], ["5", "total_amount", "decimal(10,2)", "-", "No"]].map(row => <tr key={row[1]}>{row.map(x => <td key={x}>{x}</td>)}</tr>)}</tbody></table></section><Panel title="Table metadata" icon="database" className="metadata"><button className="main-layout-primary" type="button">◉ Preview data</button>{["Table size|182.4 MB", "Row count|1,248,763", "Indexes|3", "Relationships|3", "Last sync|2 min ago"].map(x => { const [a, b] = x.split("|"); return <p key={a}>{a}<b>{b}</b></p>; })}</Panel></div></>;
}

function Security() {
  return <><Heading icon="shield" title="Security & access" text="Control who can discover, query, and share your data" /><div className="main-layout-stats">{[["check", "Policy coverage", "100%", "+2%"], ["eye-off", "Active policies", "12", "+3"], ["group", "Access requests", "3", "+1"], ["file-text", "Audit events", "1,248", "+18"]].map(([icon, label, value, change]) => <article key={label}><Icon name={icon as IconName} size={21} /><span>{label}<b>{value}</b><em>↑ {change}</em></span></article>)}</div><div className="main-layout-query-layout"><section className="main-layout-panel policy-list"><header><b>Policies</b><span>Roles　 Access requests　 Audit log</span></header>{["Row-level customer access", "Finance revenue protection", "PII masking", "Production read-only"].map((x, i) => <article className={i === 2 ? "selected" : ""} key={x}><Icon name={i === 2 ? "eye-off" : "shield"} size={18} /><div><b>{x}</b><p>{["Users can only see their assigned customers", "Restrict access to revenue and financial metrics", "Mask personally identifiable information", "Prevent write operations in production"][i]}</p></div><strong>Active</strong><small>{["Customers", "Finance", "All tables", "Production"][i]}</small><Icon name="edit" size={14} /></article>)}</section><Panel title="PII masking" icon="eye-off" className="query-inspector"><p>Mask personally identifiable information in query results and exports.</p><h3>Protected fields</h3><div className="main-layout-chips"><span>customer_email · MASK</span><span>customer_phone · MASK</span><span>customer_name · MASK</span><span>address · MASK</span></div><h3>Rule preview</h3><pre>{`CASE\n WHEN current_role IN ('analytics', 'marketing')\n THEN customer_email\n ELSE '***MASKED***'\nEND AS customer_email`}</pre><button className="main-layout-primary" type="button">Edit policy</button><button type="button">Test policy</button></Panel></div></>;
}

export default function PlaygroundWorkspace({ projectId, domainId, queryId, projects, connectionStatus, provider, onNavigate, onOpenConnection }: {
  projectId: string;
  domainId: string;
  queryId: string;
  projects: ProjectSummary[];
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
}) {
  const [searchParams] = useSearchParams();
  // Other pages open a specific view with ?view=<name>, such as the menu on the Domain Diagram page.
  const [view, setView] = useState<WorkspaceView>(() => {
    const requested = searchParams.get("view") as WorkspaceView | null;
    return requested && LOCAL_VIEWS.includes(requested) ? requested : "playground";
  });
  const selectView = (next: WorkspaceView, selectedDomainId: string) => {
    if (next === "diagram") onNavigate(domainDiagramPath(projectId, selectedDomainId));
    else if (next === "functions") onNavigate(`${CUSTOM_FUNCTIONS_PATH}?${new URLSearchParams({ project: projectId }).toString()}`);
    else setView(next);
  };
  return <MainLayout
    view={view}
    projects={projects}
    projectId={projectId}
    domainId={domainId}
    connectionStatus={connectionStatus}
    provider={provider}
    onSelectView={selectView}
    onSelectProject={(id) => { if (id) onNavigate(`/playground/${encodeURIComponent(id)}`); }}
    onSelectDomain={(id) => { if (id) onNavigate(`/playground/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`); }}
    onOpenConnection={onOpenConnection}
    onNavigateHome={() => onNavigate("/")}
  >
    {({ domainId: selectedDomainId }) => view === "overview" ? <Overview /> : view === "playground" ? <Playground queryId={queryId} projectId={projectId} domainId={selectedDomainId} /> : view === "queries" ? <Queries /> : view === "explorer" ? <Explorer /> : <Security />}
  </MainLayout>;
}
