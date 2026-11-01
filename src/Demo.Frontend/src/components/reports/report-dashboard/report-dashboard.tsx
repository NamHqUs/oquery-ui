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
    <section className="reports-hero" aria-labelledby="reports-hero-title">
      <div className="reports-hero-copy">
        <span className="eyebrow">ONE QUERY ENGINE <i /> FIVE WAYS TO BUILD</span>
        <h1 id="reports-hero-title">Build queries your way.<br /><span>Code, config, or clicks.</span></h1>
        <p>In the visual builder, no SQL is required. For more control, define queries with C# lambda expressions, JSON, YAML, or plan text—then inspect the parameterized SQL and live results.</p>
        <ul className="query-input-modes" aria-label="Ways to build a query">
          <li>Visual builder</li>
          <li>C# lambdas</li>
          <li>JSON</li>
          <li>YAML</li>
          <li>Plan text</li>
        </ul>
        <div className="reports-hero-actions">
          <button className="button primary" type="button" onClick={onCreateReport}><Icon name="query" size={15} /> Build a query</button>
        </div>
      </div>
      <aside className="query-flow-card" aria-label="Query builder workflow">
        <div className="query-flow-heading">
          <span className="query-flow-mark"><Icon name="query" size={16} /></span>
          <div><strong>FROM SCHEMA TO ANSWERS</strong><small>A query, shaped around your data</small></div>
          <span className="query-flow-live"><i /> LIVE</span>
        </div>
        <div className="query-flow-steps">
          <button className="query-flow-step" type="button" onClick={() => onNavigateToPage("sources")}>
            <span className="query-flow-icon"><Icon name="database" size={16} /></span>
            <span className="query-flow-copy"><strong>Connect to your database</strong><small>Configure your data sources</small></span>
          </button>
          <span className="query-flow-connector" aria-hidden="true" />
          <button className="query-flow-step" type="button" onClick={() => onNavigateToPage("metadata")}>
            <span className="query-flow-icon"><Icon name="schema" size={16} /></span>
            <span className="query-flow-copy"><strong>Describe your data</strong><small>Entities · fields · relationships</small></span>
          </button>
          <span className="query-flow-connector" aria-hidden="true" />
          <button className="query-flow-step" type="button" onClick={() => onNavigateToPage("builder")}>
            <span className="query-flow-icon"><Icon name="chart-bar" size={16} /></span>
            <span className="query-flow-copy"><strong>Shape your query</strong><small>Projections · filters · sorting</small></span>
          </button>
          <span className="query-flow-connector" aria-hidden="true" />
          <div className="query-flow-outcome">
            <span className="query-flow-icon outcome"><Icon name="results" size={16} /></span>
            <span className="query-flow-copy"><strong>See the results</strong><small>Parameterized SQL · live data</small></span>
          </div>
        </div>
        <div className="query-flow-footer"><span><i /> SQL SERVER</span><span>SQLITE</span><span>POSTGRESQL</span></div>
      </aside>
      <div className="reports-hero-glow" />
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
