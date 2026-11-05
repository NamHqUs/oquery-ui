import { useEffect, useRef, useState } from "react";
import Icon from "../../icon/icon";
import type { FunctionDefinition } from "../../function-definition/types";
import OQueryEditor from "../../query-builder/oquery-editor/oquery-editor";
import ToastNotice from "../../toast-notice/toast-notice";
import type { QueryResult, ReportDto } from "../../query-builder/query-design/query-builder-slice";
import ReportDetail from "../report-detail/report-detail";
import ReportItem from "../report-item/report-item";
import BarChart from "../charts/bar-chart/bar-chart";
import DonutChart from "../charts/donut-chart/donut-chart";
import type { SimpleChartData } from "../charts/chart-types";
import type { ReportDemoExampleKey } from "../report-demo-examples";
import {
  categoryTone,
  defaultReportChartSettings,
  presentationFor,
  reportTitle,
  type ChartType,
  type ReportChartSettings,
} from "../report-model";

type ReportGroup = { name: string; reports: ReportDto[] };
type DropPosition = "before" | "after";
type DemoResultView = "grid" | "orgchart" | "report";
const REPORT_COLUMN_STORAGE_KEY = "OQuery-report-columns";
const PRODUCTS_OQUERY = "Products:";
const TRAVERSAL_OQUERY = "Orders: Id, OrderDate, User.FirstName, User.LastName";
const PRODUCT_SALES_OQUERY = `OrderItems: ProductId, Product.Name,
    Sum(Quantity * UnitPrice) TotalRevenue,
    AverageOver(TotalRevenue) Average
WHERE TotalRevenue > Average`;
const PRODUCT_SALES_SQL = `SELECT *
FROM (
    SELECT oi.ProductId, p.Name,
        SUM(oi.Quantity * oi.UnitPrice) AS TotalRevenue,
        AVG(SUM(oi.Quantity * oi.UnitPrice)) OVER () AS Average
    FROM sa.OrderItems oi
    JOIN sa.Products p ON p.Id = oi.ProductId
    GROUP BY oi.ProductId, p.Name
) ProductSales
WHERE ProductSales.TotalRevenue > ProductSales.Average;`;
const EMPLOYEE_TREE_OQUERY = `EmployeeTree is Employees:
    FirstName ManagerName,
    member.FirstName MemberName,
    CountOver(member.Id, manager.Id) TotalMembers
  INNER JOIN EmployeeTree member on Id = member.ManagerId`;
const EMPLOYEE_TREE_SQL = `WITH EmployeeTree AS
(
    SELECT
        e.Id,
        e.ManagerId
    FROM Main.Employees AS e
    WHERE e.ManagerId IS NULL

    UNION ALL

    SELECT
        e.Id,
        e.ManagerId
    FROM Main.Employees AS e
    INNER JOIN EmployeeTree AS tree
        ON e.ManagerId = tree.Id
)
SELECT
    manager.FirstName AS ManagerName,
    member.FirstName AS MemberName,
    COUNT(member.Id) OVER (
        PARTITION BY manager.Id
    ) AS TotalMembers
FROM EmployeeTree AS tree
INNER JOIN Main.Employees AS member
    ON member.Id = tree.Id
LEFT JOIN Main.Employees AS manager
    ON manager.Id = tree.ManagerId;`;

type DemoQueryLanguage = "sql";

const demoQueryPatterns: Record<DemoQueryLanguage, RegExp> = {
  sql: /\b(EmployeeTree|Employees|ProductSales|OrderItems|Products|AVG|SUM|COUNT|WITH|AS|SELECT|FROM|WHERE|GROUP|BY|HAVING|ORDER|LIMIT|OFFSET|ASC|DESC|AND|OR|IN|IS|NULL|LIKE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|DISTINCT|TOP|UNION|ALL|OVER|PARTITION)\b/gi,
};

function highlightDemoQuery(query: string, language: DemoQueryLanguage) {
  const pattern = demoQueryPatterns[language];
  const keywordPattern = new RegExp(pattern.source, "i");
  return query.split(pattern).map((token, index) => (
    keywordPattern.test(token)
      ? <span className={["employeetree", "productsales", "revenuebymonth", "products"].includes(token.toLocaleLowerCase())
        ? "demo-query-reference"
        : "demo-query-keyword"} key={`${token}-${index}`}>{token}</span>
      : token
  ));
}

function readReportColumns(): Record<string, number> {
  const savedColumns = window.sessionStorage.getItem(REPORT_COLUMN_STORAGE_KEY);
  if (!savedColumns) return {};
  const parsedColumns: unknown = JSON.parse(savedColumns);
  if (typeof parsedColumns !== "object" || parsedColumns === null || Array.isArray(parsedColumns)) {
    throw new Error("Invalid report columns in browser session storage.");
  }

  const columns: Record<string, number> = {};
  Object.entries(parsedColumns).forEach(([fileName, column]) => {
    if (typeof column !== "number" || !Number.isSafeInteger(column) || column < 0) {
      throw new Error("Invalid report column index in browser session storage.");
    }
    columns[fileName] = column;
  });
  return columns;
}

type ReportDashboardProps = {
  onNavigateToPage: (page: "sources" | "metadata" | "builder") => void;
  groups: ReportGroup[];
  sortedReports: ReportDto[];
  filteredReports: ReportDto[];
  category: string;
  search: string;
  numberOfBuiltins: number;
  numberOfCustom: number;
  reportsStatus: string;
  reportsError: string | null;
  metadataStatus: string;
  metadataError: string | null;
  functionDefinitions: FunctionDefinition[];
  reportResults: Record<string, QueryResult>;
  reportLoading: Record<string, boolean>;
  reportErrors: Record<string, string>;
  demoResults: Partial<Record<ReportDemoExampleKey, QueryResult>>;
  demoLoading: Partial<Record<ReportDemoExampleKey, boolean>>;
  demoErrors: Partial<Record<ReportDemoExampleKey, string>>;
  chartTypeOverrides: Record<string, ChartType>;
  chartSettingsOverrides: Record<string, ReportChartSettings>;
  detailReport: ReportDto | null;
  detailResult?: QueryResult;
  detailChartType: ChartType;
  detailChartSettings: ReportChartSettings;
  detailLoading: boolean;
  detailError?: string;
  message: string;
  messageIsError: boolean;
  onCreateReport: () => void;
  onSelectCategory: (category: string) => void;
  onSearchChange: (search: string) => void;
  onDismissMessage: () => void;
  onRun: (report: ReportDto) => void;
  onRunDemo: (example: ReportDemoExampleKey, query: string) => void;
  onCloseDemo: (example: ReportDemoExampleKey) => void;
  onOpenDetails: (report: ReportDto) => void;
  onReorderReports: (sourceFileName: string, targetFileName: string, position: DropPosition) => void;
  onCloseDetails: () => void;
  onRunDetails: () => void;
  onApplyLayout: (report: ReportDto) => string | null;
  onChartTypeChange: (report: ReportDto, chartType: ChartType) => void;
  onChartSettingsChange: (report: ReportDto, settings: ReportChartSettings) => void;
  onEdit: (report: ReportDto) => void;
  onEditQuery: (report: ReportDto) => void;
  onDelete: (report: ReportDto) => void;
};

export default function ReportDashboard({
  onNavigateToPage,
  groups, sortedReports, filteredReports, category, search, numberOfBuiltins, numberOfCustom,
  reportsStatus, reportsError, metadataStatus, metadataError, reportResults, reportLoading,
  functionDefinitions,
  reportErrors, demoResults, demoLoading, demoErrors, chartTypeOverrides, chartSettingsOverrides, detailReport, detailResult, detailChartType, detailChartSettings, detailLoading, detailError,
  message, messageIsError, onCreateReport, onSelectCategory, onSearchChange,
  onDismissMessage, onRun, onRunDemo, onCloseDemo, onOpenDetails, onReorderReports, onCloseDetails, onRunDetails, onApplyLayout, onChartTypeChange, onChartSettingsChange, onEdit, onEditQuery, onDelete,
}: ReportDashboardProps) {
  const draggedReport = useRef<string | null>(null);
  const dragPreview = useRef<HTMLElement | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ fileName: string; position: DropPosition } | null>(null);
  const [columnByFileName, setColumnByFileName] = useState(readReportColumns);
  const [showProductsSql, setShowProductsSql] = useState(false);
  const [showTraversalSql, setShowTraversalSql] = useState(false);
  const [showRevenueSql, setShowRevenueSql] = useState(false);
  const [showRecursiveSql, setShowRecursiveSql] = useState(false);
  const [expandedHierarchyNodes, setExpandedHierarchyNodes] = useState<Set<string> | null>(null);
  const [expandedHierarchyLists, setExpandedHierarchyLists] = useState<Set<string>>(new Set());
  const [demoResultViews, setDemoResultViews] = useState<Partial<Record<ReportDemoExampleKey, DemoResultView>>>({});
  const [openDemoViewMenu, setOpenDemoViewMenu] = useState<ReportDemoExampleKey | null>(null);
  const [activeDemoPopup, setActiveDemoPopup] = useState<ReportDemoExampleKey | null>(null);
  const [demoQueries, setDemoQueries] = useState<Record<ReportDemoExampleKey, string>>({
    products: PRODUCTS_OQUERY,
    traversal: TRAVERSAL_OQUERY,
    recursive: EMPLOYEE_TREE_OQUERY,
    revenue: PRODUCT_SALES_OQUERY,
  });
  const demoSelectionsRef = useRef<Partial<Record<ReportDemoExampleKey, string>>>({});
  const [columnCount, setColumnCount] = useState(() => {
    const width = window.innerWidth;
    return width <= 600 ? 1 : width <= 860 ? 2 : 3;
  });

  useEffect(() => {
    const updateColumnCount = () => {
      const width = window.innerWidth;
      setColumnCount(width <= 600 ? 1 : width <= 860 ? 2 : 3);
    };
    window.addEventListener("resize", updateColumnCount);
    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(REPORT_COLUMN_STORAGE_KEY, JSON.stringify(columnByFileName));
  }, [columnByFileName]);

  useEffect(() => {
    setExpandedHierarchyNodes(null);
    setExpandedHierarchyLists(new Set());
  }, [demoResults.recursive]);

  const clearDragPreview = () => {
    dragPreview.current?.remove();
    dragPreview.current = null;
    draggedReport.current = null;
    setDropIndicator(null);
  };

  const runDemo = (example: ReportDemoExampleKey, query: string) => {
    setActiveDemoPopup(example);
    onRunDemo(example, query);
  };
  const closeDemo = (example: ReportDemoExampleKey) => {
    if (activeDemoPopup === example) setActiveDemoPopup(null);
    onCloseDemo(example);
  };

  const renderRecursiveHierarchyChart = (result: QueryResult) => {
    const normalizeColumn = (column: string) => column.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const managerIndex = result.columns.findIndex((column) => normalizeColumn(column) === "managername");
    const memberIndex = result.columns.findIndex((column) => normalizeColumn(column) === "membername");
    const totalIndex = result.columns.findIndex((column) => normalizeColumn(column) === "totalmembers");
    if (managerIndex < 0 || memberIndex < 0 || totalIndex < 0) return null;

    const groups = new Map<string, { total: number; members: string[] }>();
    result.rows.slice(0, 20).forEach((row) => {
      const manager = row[managerIndex]?.trim();
      const member = row[memberIndex]?.trim();
      if (!manager || !member) return;
      const total = Number(row[totalIndex]);
      const group = groups.get(manager) || { total: Number.isFinite(total) ? total : 0, members: [] };
      if (!group.members.includes(member)) group.members.push(member);
      groups.set(manager, group);
    });
    type HierarchyNode = { name: string; total?: number; members: HierarchyNode[] };
    const memberNames = new Set([...groups.values()].flatMap((group) => group.members));
    const roots = [...groups.keys()].filter((manager) => !memberNames.has(manager));
    const buildNode = (name: string, path: Set<string>): HierarchyNode => {
      const group = groups.get(name);
      if (!group || path.has(name)) return { name, members: [] };
      const nextPath = new Set(path).add(name);
      return {
        name,
        total: group.total,
        members: group.members
          .map((member) => buildNode(member, nextPath))
          .sort((left, right) => Number(right.members.length > 0) - Number(left.members.length > 0)),
      };
    };
    const rootName = (roots.length ? roots : [...groups.keys()])[0];
    if (!rootName) return null;
    const hierarchyRoot = buildNode(rootName, new Set());
    const expandedNodes = expandedHierarchyNodes ?? new Set([rootName]);
    const toggleNode = (path: string) => setExpandedHierarchyNodes((current) => {
      const next = new Set(current ?? [rootName]);
      if (next.has(path)) {
        if (expandedHierarchyLists.has(path)) {
          setExpandedHierarchyLists((lists) => {
            const nextLists = new Set(lists);
            nextLists.delete(path);
            return nextLists;
          });
          return next;
        }
        next.delete(path);
        setExpandedHierarchyLists((lists) => {
          const nextLists = new Set(lists);
          nextLists.delete(path);
          return nextLists;
        });
      } else {
        next.add(path);
      }
      return next;
    });
    const toggleMemberList = (path: string) => {
      const next = new Set(expandedHierarchyLists);
      if (next.has(path)) next.delete(path); else next.add(path);
      setExpandedHierarchyLists(next);
    };
    const renderNode = (node: HierarchyNode, path: string): ReactNode => {
      const hasMembers = node.members.length > 0;
      const isExpanded = expandedNodes.has(path);
      const isMemberListExpanded = expandedHierarchyLists.has(path);
      const visibleMembers = node.members.slice(0, 6);
      const additionalMembers = isMemberListExpanded ? node.members.slice(6) : [];
      const hasMoreMembers = node.members.length > visibleMembers.length;
      const nodeContent = <><strong>{node.name}</strong>{node.total !== undefined && <span>{node.total} members</span>}</>;
      return (
      <div className="new-home-hierarchy-branch" key={path}>
        {hasMembers
          ? <button type="button" className={`new-home-hierarchy-node${isExpanded ? " expanded" : ""}`} aria-expanded={isExpanded} onClick={() => toggleNode(path)}>{nodeContent}</button>
          : <div className="new-home-hierarchy-node">{nodeContent}</div>}
        {hasMembers && isExpanded && <div className="new-home-hierarchy-children">
          <div className="new-home-hierarchy-visible-children">
            {visibleMembers.map((member, index) => renderNode(member, `${path}.${index}:${member.name}`))}
          </div>
          {hasMoreMembers && <div className="new-home-hierarchy-overflow">
            {additionalMembers.map((member, index) => renderNode(member, `${path}.${index + 6}:${member.name}`))}
            <button type="button" className="new-home-hierarchy-more" onClick={() => toggleMemberList(path)}>{isMemberListExpanded ? "Show less" : `+ ${node.members.length - visibleMembers.length} More`}</button>
          </div>}
        </div>}
      </div>
      );
    };

    return (
      <div className="new-home-hierarchy-chart" role="img" aria-label="Members grouped by organization hierarchy">
        <div className="new-home-hierarchy-chart-body">
          <div className="new-home-hierarchy-tree">{renderNode(hierarchyRoot, rootName)}</div>
        </div>
      </div>
    );
  };

  const renderDemoReport = (example: ReportDemoExampleKey, result: QueryResult) => {
    const normalizeColumn = (column: string) => column.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const labelIndex = result.columns.findIndex((column) => normalizeColumn(column) === "name");
    const preferredMetric = result.columns.findIndex((column) => normalizeColumn(column) === "totalrevenue");
    const metricIndex = preferredMetric >= 0
      ? preferredMetric
      : result.columns.findIndex((_, index) =>
        result.rows.some((row) => Number.isFinite(Number(row[index]))));
    if (metricIndex < 0) {
      return <div className="new-home-demo-report-empty">No numeric result field is available for this report.</div>;
    }
    const data: SimpleChartData = {
      kind: "simple",
      points: result.rows.slice(0, 12).flatMap((row, index) => {
        const value = Number(row[metricIndex]);
        return Number.isFinite(value)
          ? [{ label: row[labelIndex >= 0 ? labelIndex : 0] || `Record ${index + 1}`, value, xValue: index + 1 }]
          : [];
      }),
    };
    return <div className="new-home-demo-report">{example === "revenue" ? <DonutChart data={data} /> : <BarChart data={data} />}</div>;
  };

  const renderDemoResult = (example: ReportDemoExampleKey) => {
    if (activeDemoPopup !== example) return null;
    const result = demoResults[example];
    const loading = Boolean(demoLoading[example]);
    const error = demoErrors[example];
    const hierarchyChart = result && example === "recursive"
      ? renderRecursiveHierarchyChart(result)
      : null;
    const selectedView = demoResultViews[example] ?? (example === "recursive" ? "orgchart" : example === "revenue" ? "report" : "grid");
    const viewOptions: { value: DemoResultView; label: string }[] = [
      { value: "grid", label: "DataGrid" },
      { value: "orgchart", label: "OrgChart" },
      { value: "report", label: "Report" },
    ];
    return (
      <div className="new-home-example-result">
        {error && <p className="query-message error" role="alert">{error}</p>}
        {loading && !result
          ? <p className="new-home-example-result-status">Loading the first 20 records…</p>
          : result
            ? <div className="new-home-example-view-container">
              <div className="new-home-example-result-head">
                <span>{result.totalRecords > Math.min(result.rows.length, 20) ? `Top ${Math.min(result.rows.length, 20)} of ${result.totalRecords} records · partial result` : `Top ${Math.min(result.rows.length, 20)} records`}</span>
                <div className="new-home-example-result-actions">
                  <div className="new-home-example-view-menu">
                    <button type="button" className="new-home-example-view-trigger" aria-haspopup="menu" aria-expanded={openDemoViewMenu === example} onClick={() => setOpenDemoViewMenu(openDemoViewMenu === example ? null : example)}>
                      {viewOptions.find((option) => option.value === selectedView)?.label} <span aria-hidden="true">⌄</span>
                    </button>
                    {openDemoViewMenu === example && <div className="new-home-example-view-popup" role="menu">
                      {viewOptions.map((option) => <button key={option.value} type="button" role="menuitem" className={option.value === selectedView ? "active" : ""} onClick={() => {
                        setDemoResultViews((current) => ({ ...current, [example]: option.value }));
                        setOpenDemoViewMenu(null);
                      }}>{option.label}</button>)}
                    </div>}
                  </div>
                  <button className="report-icon-button" type="button" aria-label="Close query result" title="Close query result" onClick={() => closeDemo(example)}><Icon name="close" size={13} /></button>
                </div>
              </div>
              {selectedView === "orgchart" && hierarchyChart}
              {selectedView === "report" && renderDemoReport(example, result)}
              {selectedView === "grid" && <div className="new-home-example-table"><div className="table-wrap"><table><thead><tr>{result.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{result.rows.slice(0, 20).map((row, rowIndex) => <tr key={rowIndex}>{result.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ""}</td>)}</tr>)}</tbody></table>{!result.rows.length && <p className="empty-state">No records matched this query.</p>}</div></div>}
            </div>
            : null}
      </div>
    );
  };

  const demoRunQuery = (example: ReportDemoExampleKey) =>
    demoSelectionsRef.current[example]?.trim() || demoQueries[example];

  const renderDemoQuery = (
    example: ReportDemoExampleKey,
    query: string,
    sqlQuery: string,
    sqlSelected: boolean,
  ) => sqlSelected
    ? <pre><code>{highlightDemoQuery(sqlQuery, "sql")}</code></pre>
    : <div className="new-home-example-editor"><OQueryEditor
      aria-label={`${example} OQuery example`}
      oquery
      compact
      showLineNumbers={false}
      showContextRunAlways
      showFoldControls={false}
      rows={Math.max(1, query.split("\n").length)}
      initialText={query}
      functionDefinitions={functionDefinitions}
      onTextChange={(text) => setDemoQueries((current) => ({ ...current, [example]: text }))}
      onSelectionChange={(text) => {
        demoSelectionsRef.current[example] = text;
      }}
      onExecuteContext={() => runDemo(example, demoRunQuery(example))}
      onExecuteSelectedText={(text) => runDemo(example, text)}
    /></div>;

  const dropPositionFor = (target: HTMLElement, clientY: number): DropPosition => {
    const bounds = target.getBoundingClientRect();
    return clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  if (detailReport) {
    return <ReportDetail
      key={detailReport.fileName}
      report={detailReport}
      result={detailResult}
      chartType={detailChartType}
      chartSettings={detailChartSettings}
      loading={detailLoading}
      error={detailError}
      onApplyLayout={() => onApplyLayout(detailReport)}
      onClose={onCloseDetails}
      onRun={onRunDetails}
      onChartTypeChange={(chartType) => onChartTypeChange(detailReport, chartType)}
      onChartSettingsChange={(settings) => onChartSettingsChange(detailReport, settings)}
    />;
  }

  const reportColumns = Array.from({ length: columnCount }, () => [] as ReportDto[]);
  filteredReports.forEach((report, index) => {
    const preferredColumn = columnByFileName[report.fileName] ?? index % columnCount;
    reportColumns[preferredColumn % columnCount].push(report);
  });

  return (
    <div className="reports-workspace">
    <section className="new-home-intro" aria-labelledby="reports-hero-title">
      <div className="new-home-hero">
        <div className="new-home-copy">
          <h1 id="reports-hero-title">Your data has a shape.<br /><span>Give it a language.</span></h1>
          <p>Stop writing queries as nested SQL structures. Start building them as independent, reusable components.</p>
          <div className="new-home-actions">
            <button className="button primary" type="button" onClick={() => onNavigateToPage("sources")}><Icon name="database" size={15} /> Connect a data source</button>
            <button className="new-home-text-action" type="button" onClick={() => onNavigateToPage("metadata")}>Read the model <Icon name="arrow-right" size={13} /></button>
          </div>
        </div>
        <div className="new-home-signal" aria-label="OQuery architecture">
          <span className="new-home-signal-label">ONE FOUNDATION · MANY SURFACES</span>
          <div className="new-home-signal-line"><span className="new-home-signal-node"><Icon name="database" size={17} /><b>Physical data</b><small>Tables · providers</small></span><i /><span className="new-home-signal-node primary"><Icon name="schema" size={17} /><b>OQuery</b><small>Entities · contexts</small></span><i /><span className="new-home-signal-node output"><Icon name="query" size={17} /><b>Product features</b><small>APIs · reports · apps</small></span></div>
          <p>Keep the database you have. Add a vocabulary your application can share.</p>
        </div>
      </div>
      <div className="new-home-principles">
        <div><span>01</span><strong>Define once</strong><small>Reusable entities and relationships</small></div>
        <div><span>02</span><strong>Compose safely</strong><small>Contexts that match business meaning</small></div>
        <div><span>03</span><strong>Deliver anywhere</strong><small>Dialect-aware SQL for each provider</small></div>
      </div>
    </section>
    <section className="new-home-examples" aria-labelledby="new-home-examples-title">
      <div className="new-home-examples-heading">
        <div><span className="eyebrow">OQUERY SYNTAX</span><h2 id="new-home-examples-title">Build from reusable components.</h2><p>Compose business questions from clear, independent parts.</p></div>
      </div>
      <div className="new-home-example-rail">
        <article className="new-home-example">
          <div className="new-home-example-marker">01</div>
          <div className="new-home-example-copy"><div className="new-home-example-copy-head"><strong>How do I explore a product?</strong><div className="new-home-example-toggle" role="tablist" aria-label="Product example representation"><button type="button" role="tab" aria-selected={!showProductsSql} className={!showProductsSql ? "active" : ""} onClick={() => setShowProductsSql(false)}>OQuery</button><button type="button" role="tab" aria-selected={showProductsSql} className={showProductsSql ? "active" : ""} onClick={() => setShowProductsSql(true)}>SQL</button></div></div><p>A business entity is enough to begin exploring its exposed data.</p></div>
          {renderDemoQuery("products", demoQueries.products, "SELECT *\nFROM sa.Products;", showProductsSql)}
          {renderDemoResult("products")}
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">02</div>
          <div className="new-home-example-copy"><div className="new-home-example-copy-head"><strong>Who placed each order?</strong><div className="new-home-example-toggle" role="tablist" aria-label="Order customer example representation"><button type="button" role="tab" aria-selected={!showTraversalSql} className={!showTraversalSql ? "active" : ""} onClick={() => setShowTraversalSql(false)}>OQuery</button><button type="button" role="tab" aria-selected={showTraversalSql} className={showTraversalSql ? "active" : ""} onClick={() => setShowTraversalSql(true)}>SQL</button></div></div><p>Follow an order’s customer relationship without writing the join by hand.</p></div>
          {renderDemoQuery("traversal", demoQueries.traversal, `SELECT
    o.Id,
    o.OrderDate,
    u.FirstName,
    u.LastName
FROM sa.Orders AS o
LEFT JOIN Main.Users AS u
    ON o.UserId = u.Id;`, showTraversalSql)}
          {renderDemoResult("traversal")}
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">03</div>
          <div className="new-home-example-copy"><div className="new-home-example-copy-head"><strong>Do you know the total members at each hierarchy level?</strong><div className="new-home-example-toggle" role="tablist" aria-label="Recursive hierarchy example representation"><button type="button" role="tab" aria-selected={!showRecursiveSql} className={!showRecursiveSql ? "active" : ""} onClick={() => setShowRecursiveSql(false)}>OQuery</button><button type="button" role="tab" aria-selected={showRecursiveSql} className={showRecursiveSql ? "active" : ""} onClick={() => setShowRecursiveSql(true)}>SQL</button></div></div><p>The engine detects the self-reference and generates the recursive SQL automatically.</p></div>
          {renderDemoQuery("recursive", demoQueries.recursive, EMPLOYEE_TREE_SQL, showRecursiveSql)}
          {renderDemoResult("recursive")}
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">04</div>
          <div className="new-home-example-copy"><div className="new-home-example-copy-head"><strong>Which products sell above average?</strong><div className="new-home-example-toggle" role="tablist" aria-label="Product sales example representation"><button type="button" role="tab" aria-selected={!showRevenueSql} className={!showRevenueSql ? "active" : ""} onClick={() => setShowRevenueSql(false)}>OQuery</button><button type="button" role="tab" aria-selected={showRevenueSql} className={showRevenueSql ? "active" : ""} onClick={() => setShowRevenueSql(true)}>SQL</button></div></div><p>Build product sales from a reusable context, calculate the overall average, and filter in an outer query.</p></div>
          {renderDemoQuery("revenue", demoQueries.revenue, PRODUCT_SALES_SQL, showRevenueSql)}
          {renderDemoResult("revenue")}
        </article>
      </div>
    </section>
    <section className="report-group-browser" id="report-group-browser" aria-labelledby="report-groups-title">
      <div className="report-groups-heading">
        <div><span className="eyebrow">QUERY BUILDER IN ACTION</span><h2 id="report-groups-title">What can the Query Builder do?</h2><p>Explore live sales reports to see how metadata, relationships, and filters become useful results. Open a report to inspect and customize its query.</p></div>
        <span className="report-group-total">{numberOfBuiltins} curated <i /> {numberOfCustom} custom</span>
      </div>
      <div className="report-group-grid" aria-label="Report groups">
        {groups.map((group) => <button className={`report-group-filter tone-${categoryTone(group.name)}${category === group.name ? " active" : ""}`} type="button" aria-pressed={category === group.name} key={group.name} onClick={() => onSelectCategory(group.name)}>
          <span className="report-group-filter-mark" aria-hidden="true" />
          <strong>{group.name}</strong>
          <span className="report-group-filter-count">{group.reports.length}</span>
        </button>)}
        <button className={`report-group-filter all${category === "All reports" ? " active" : ""}`} type="button" aria-pressed={category === "All reports"} onClick={() => onSelectCategory("All reports")}>
          <span className="report-group-filter-mark"><Icon name="folder" size={13} /></span><strong>All reports</strong><span className="report-group-filter-count">{sortedReports.length}</span>
        </button>
      </div>
      <div className="report-group-dashboard" id="report-group-dashboard">
          <div className="report-group-dashboard-heading">
            <div><span className="eyebrow">REPORT DASHBOARD</span><h3>{category}</h3><p>{filteredReports.length} {filteredReports.length === 1 ? "report" : "reports"}{search ? " matching your search" : " for this sales question"}</p></div>
            <label className="report-search group-report-search"><Icon name="search" size={14} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Find a report in this group…" /></label>
          </div>
          <ToastNotice message={message} isError={messageIsError} onDismiss={onDismissMessage} />
          {reportsStatus === "loading" && <p className="report-list-status">Loading your reports…</p>}
          {reportsStatus === "failed" && <p className="report-list-status error" role="alert">{reportsError}</p>}
          {metadataStatus === "failed" && <p className="report-metadata-error" role="alert">Could not load report datasets: {metadataError}</p>}
          {reportsStatus !== "loading" && reportsStatus !== "failed" && filteredReports.length > 0 && <div className="report-dashboard-grid">
            {reportColumns.map((column, columnIndex) => <div className="report-dashboard-column" key={`column-${columnIndex}`}>
              {column.map((report) => {
              const presentation = presentationFor(report);
              return <ReportItem
                key={report.fileName}
                report={report}
                chartType={chartTypeOverrides[report.fileName] || presentation.chartType}
                chartSettings={chartSettingsOverrides[report.fileName]
                  || (reportResults[report.fileName]
                    ? defaultReportChartSettings(report, reportResults[report.fileName])
                    : { metrics: [], axes: {} })}
                result={reportResults[report.fileName]}
                loading={Boolean(reportLoading[report.fileName])}
                error={reportErrors[report.fileName]}
                onOpenDetails={() => onOpenDetails(report)}
                dropPosition={dropIndicator?.fileName === report.fileName ? dropIndicator.position : undefined}
                onDragStart={(event) => {
                  if (event.target instanceof Element && event.target.closest(".report-dashboard-card-tools")) {
                    event.preventDefault();
                    return;
                  }
                  draggedReport.current = report.fileName;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", report.fileName);
                  const card = event.currentTarget.closest(".report-dashboard-card");
                  if (card instanceof HTMLElement) {
                    const preview = card.cloneNode(true) as HTMLElement;
                    preview.classList.add("report-dashboard-drag-preview");
                    preview.setAttribute("aria-hidden", "true");
                    preview.style.position = "fixed";
                    preview.style.top = "-10000px";
                    preview.style.left = "-10000px";
                    preview.style.width = `${card.offsetWidth}px`;
                    preview.style.pointerEvents = "none";
                    document.body.append(preview);
                    dragPreview.current = preview;
                    const bounds = card.getBoundingClientRect();
                    event.dataTransfer.setDragImage(preview, event.clientX - bounds.left, event.clientY - bounds.top);
                  }
                }}
                onDragEnd={clearDragPreview}
                onDragOver={(event) => {
                  if (!draggedReport.current || draggedReport.current === report.fileName) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const position = dropPositionFor(event.currentTarget, event.clientY);
                  setDropIndicator((current) => (
                    current?.fileName === report.fileName && current.position === position
                      ? current
                      : { fileName: report.fileName, position }
                  ));
                }}
                onDragLeave={(event) => {
                  if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                  setDropIndicator((current) => current?.fileName === report.fileName ? null : current);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceFileName = draggedReport.current;
                  const position = dropPositionFor(event.currentTarget, event.clientY);
                  draggedReport.current = null;
                  if (sourceFileName && sourceFileName !== report.fileName) {
                    onReorderReports(sourceFileName, report.fileName, position);
                    setColumnByFileName((current) => {
                      const next = { ...current };
                      filteredReports.forEach((item, index) => {
                        if (next[item.fileName] === undefined) {
                          next[item.fileName] = index % columnCount;
                        }
                      });
                      next[sourceFileName] = columnIndex;
                      return next;
                    });
                  }
                  setDropIndicator(null);
                }}
                onRun={() => onRun(report)}
                onEdit={() => onEdit(report)}
                onEditQuery={() => onEditQuery(report)}
                onDelete={() => onDelete(report)}
              />;
              })}
            </div>)}
          </div>}
          {reportsStatus !== "loading" && reportsStatus !== "failed" && !filteredReports.length && <p className="report-group-empty">No reports match this group and search.</p>}
      </div>
    </section>
    </div>
  );
}
