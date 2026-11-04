import { useEffect, useRef, useState } from "react";
import Icon from "../../icon/icon";
import ToastNotice from "../../toast-notice/toast-notice";
import type { QueryResult, ReportDto } from "../../query-builder/query-design/query-builder-slice";
import ReportDetail from "../report-detail/report-detail";
import ReportItem from "../report-item/report-item";
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
const REPORT_COLUMN_STORAGE_KEY = "OQuery-report-columns";
const PRODUCT_SALES_OQUERY = `ProductSales is OrderItems: ProductId,
     SUM(Quantity * UnitPrice) | TotalRevenue
  GROUP BY ProductId

Products: Id, Name,
     ProductSales.TotalRevenue
  INNER JOIN ProductSales on Id = ProductSales.ProductId
  WHERE ProductSales.TotalRevenue >
    (AVG(ProductSales.TotalRevenue))`;
const PRODUCT_SALES_SQL = `SELECT p.Id, p.Name, ps.TotalRevenue
FROM sa.Products p
JOIN (
    SELECT ProductId, SUM(Quantity * UnitPrice) AS TotalRevenue
    FROM sa.OrderItems
    GROUP BY ProductId
) ps ON p.Id = ps.ProductId
WHERE ps.TotalRevenue > (
    SELECT AVG(TotalRevenue)
    FROM (
        SELECT SUM(Quantity * UnitPrice) AS TotalRevenue
        FROM sa.OrderItems
        GROUP BY ProductId
    ) t
);`;
const EMPLOYEE_TREE_OQUERY = `EmployeeTree is Employees: FirstName | ManagerName,
    member.FirstName | MemberName
  INNER JOIN EmployeeTree member on Id = member.ManagerId`;
const EMPLOYEE_TREE_SQL = `WITH EmployeeTree AS
(
    SELECT e.Id, e.ManagerId
    FROM Main.Employees e
    WHERE e.ManagerId IS NULL

    UNION ALL

    SELECT e.Id, e.ManagerId
    FROM Main.Employees e
    JOIN EmployeeTree t ON e.ManagerId = t.Id
)
SELECT member.FirstName AS MemberName,
       manager.FirstName AS ManagerName
FROM EmployeeTree tree
JOIN Main.Employees member ON member.Id = tree.Id
LEFT JOIN Main.Employees manager ON manager.Id = tree.ManagerId;`;

type DemoQueryLanguage = "oquery" | "sql";

const demoQueryPatterns: Record<DemoQueryLanguage, RegExp> = {
  oquery: /\b(EmployeeTree|Employees|Manager|ProductSales|SaleItems|Products|AVG|SUM|Left\s+Join|Join|Is|On|Order|Desc|Asc|Take|Where|And|Or|Group|By|Having|Skip|Full|Inner|Right|Recursive)\b/gi,
  sql: /\b(EmployeeTree|Employees|ProductSales|SaleItems|Products|AVG|SUM|WITH|AS|SELECT|FROM|WHERE|GROUP|BY|HAVING|ORDER|LIMIT|OFFSET|ASC|DESC|AND|OR|IN|IS|NULL|LIKE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|DISTINCT|TOP|UNION|ALL)\b/gi,
};
const demoQueryFunctionNames = new Set(["avg", "sum"]);

function highlightDemoQuery(query: string, language: DemoQueryLanguage) {
  const pattern = demoQueryPatterns[language];
  const keywordPattern = new RegExp(pattern.source, "i");
  return query.split(pattern).map((token, index) => (
    keywordPattern.test(token)
      ? <span className={demoQueryFunctionNames.has(token.toLocaleLowerCase())
        ? "demo-query-function"
        : ["employeetree", "productsales", "revenuebymonth", "products"].includes(token.toLocaleLowerCase())
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
  reportResults: Record<string, QueryResult>;
  reportLoading: Record<string, boolean>;
  reportErrors: Record<string, string>;
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
  reportErrors, chartTypeOverrides, chartSettingsOverrides, detailReport, detailResult, detailChartType, detailChartSettings, detailLoading, detailError,
  message, messageIsError, onCreateReport, onSelectCategory, onSearchChange,
  onDismissMessage, onRun, onOpenDetails, onReorderReports, onCloseDetails, onRunDetails, onApplyLayout, onChartTypeChange, onChartSettingsChange, onEdit, onEditQuery, onDelete,
}: ReportDashboardProps) {
  const draggedReport = useRef<string | null>(null);
  const dragPreview = useRef<HTMLElement | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ fileName: string; position: DropPosition } | null>(null);
  const [columnByFileName, setColumnByFileName] = useState(readReportColumns);
  const [showProductsSql, setShowProductsSql] = useState(false);
  const [showTraversalSql, setShowTraversalSql] = useState(false);
  const [showRevenueSql, setShowRevenueSql] = useState(false);
  const [showRecursiveSql, setShowRecursiveSql] = useState(false);
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

  const clearDragPreview = () => {
    dragPreview.current?.remove();
    dragPreview.current = null;
    draggedReport.current = null;
    setDropIndicator(null);
  };

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
          <pre><code>{highlightDemoQuery(showProductsSql ? "SELECT *\nFROM sa.Products;" : "Products", showProductsSql ? "sql" : "oquery")}</code></pre>
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">02</div>
          <div className="new-home-example-copy"><div className="new-home-example-copy-head"><strong>How do I follow a relationship?</strong><div className="new-home-example-toggle" role="tablist" aria-label="Relationship example representation"><button type="button" role="tab" aria-selected={!showTraversalSql} className={!showTraversalSql ? "active" : ""} onClick={() => setShowTraversalSql(false)}>OQuery</button><button type="button" role="tab" aria-selected={showTraversalSql} className={showTraversalSql ? "active" : ""} onClick={() => setShowTraversalSql(true)}>SQL</button></div></div><p>Declare a relationship, and the join becomes an implementation detail.</p></div>
          <pre><code>{highlightDemoQuery(showTraversalSql ? `SELECT
    p.Id,
    p.Name,
    c.Name AS CategoryName
FROM sa.Products AS p
LEFT JOIN sa.Categories AS c
    ON p.CategoryId = c.Id;` : "Products: Id, Name, Category.Name", showTraversalSql ? "sql" : "oquery")}</code></pre>
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">03</div>
          <div className="new-home-example-copy"><div className="new-home-example-copy-head"><strong>How big is your organization really?</strong><div className="new-home-example-toggle" role="tablist" aria-label="Recursive hierarchy example representation"><button type="button" role="tab" aria-selected={!showRecursiveSql} className={!showRecursiveSql ? "active" : ""} onClick={() => setShowRecursiveSql(false)}>OQuery</button><button type="button" role="tab" aria-selected={showRecursiveSql} className={showRecursiveSql ? "active" : ""} onClick={() => setShowRecursiveSql(true)}>SQL</button></div></div><p>The engine detects the self-reference and generates the recursive SQL automatically.</p></div>
          <pre><code>{highlightDemoQuery(showRecursiveSql ? EMPLOYEE_TREE_SQL : EMPLOYEE_TREE_OQUERY, showRecursiveSql ? "sql" : "oquery")}</code></pre>
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">04</div>
          <div className="new-home-example-copy"><div className="new-home-example-copy-head"><strong>Which products sell above average?</strong><div className="new-home-example-toggle" role="tablist" aria-label="Product sales example representation"><button type="button" role="tab" aria-selected={!showRevenueSql} className={!showRevenueSql ? "active" : ""} onClick={() => setShowRevenueSql(false)}>OQuery</button><button type="button" role="tab" aria-selected={showRevenueSql} className={showRevenueSql ? "active" : ""} onClick={() => setShowRevenueSql(true)}>SQL</button></div></div><p>Aggregate sales once, compare each product with the overall average, and keep the question readable.</p></div>
          <pre><code>{highlightDemoQuery(showRevenueSql ? PRODUCT_SALES_SQL : PRODUCT_SALES_OQUERY, showRevenueSql ? "sql" : "oquery")}</code></pre>
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
