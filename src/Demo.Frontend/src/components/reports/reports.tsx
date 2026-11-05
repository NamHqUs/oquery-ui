import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../icon/icon";
import { useMessageBox } from "../message-box/message-box";
import {
  deleteReport,
  executeQuery,
  executeQueryFromText,
  fetchQueryMetadata,
  fetchReports,
  fromApiQuery,
  MetadataEntity,
  QueryDefinition,
  QueryResult,
  saveReport,
  ReportDto,
} from "../query-builder/query-design/query-builder-slice";
import ReportDashboard from "./report-dashboard/report-dashboard";
import type { ReportDemoExampleKey } from "./report-demo-examples";
import {
  chartOptions,
  defaultReportChartSettings,
  presentationFor,
  reportTitle,
  type ChartType,
  type ReportLayout,
  type ReportChartSettings,
} from "./report-model";
import "./reports.css";

const reportLayoutsStorageKey = "OQuery-report-layouts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReportChartSettings(value: unknown): value is ReportChartSettings {
  if (!isRecord(value) || !Array.isArray(value.metrics) || !value.metrics.every((metric) => typeof metric === "string")) return false;
  if (!isRecord(value.axes) || !Object.values(value.axes).every((axis) => axis === "axis1" || axis === "axis2" || axis === "none")) return false;
  return (value.breakdownDisplay === undefined || value.breakdownDisplay === "subcharts" || value.breakdownDisplay === "direct")
    && (value.seriesLayout === undefined || value.seriesLayout === "combined" || value.seriesLayout === "separate");
}

function isReportLayout(value: unknown): value is ReportLayout {
  return isRecord(value)
    && chartOptions.some((option) => option.value === value.chartType)
    && (value.chartSettings === undefined || isReportChartSettings(value.chartSettings));
}

function readReportLayouts(): Record<string, ReportLayout> {
  const storedLayouts = window.localStorage.getItem(reportLayoutsStorageKey);
  if (!storedLayouts) return {};
  const parsedLayouts: unknown = JSON.parse(storedLayouts);
  if (!isRecord(parsedLayouts) || !Object.values(parsedLayouts).every(isReportLayout)) {
    throw new Error("Invalid report layouts in browser local storage.");
  }
  return parsedLayouts as Record<string, ReportLayout>;
}

function getNewDefinition(entity?: MetadataEntity): QueryDefinition {
  return {
    entity: entity?.name ?? "",
    columns: entity?.fields.map((field) => ({ field: field.name, alias: null })) ?? [],
    filters: { logicalOperation: 0, filters: [] },
    sorts: [],
    page: 1,
    pageSize: 50,
  };
}

type ReportFormProps = {
  report: ReportDto | null;
  entities: MetadataEntity[];
  onClose: () => void;
  onSave: (details: { name: string; description: string; chartType: ChartType; entity: string }) => void;
};

function ReportForm({ report, entities, onClose, onSave }: ReportFormProps) {
  const existingPresentation = report ? presentationFor(report) : null;
  const [name, setName] = useState(report ? reportTitle(report) : "");
  const [description, setDescription] = useState(report?.description || "");
  const [chartType, setChartType] = useState<ChartType>(existingPresentation?.chartType || "bar");
  const [entity, setEntity] = useState(report?.query.entity || entities[0]?.name || "");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ name: name.trim(), description: description.trim(), chartType, entity });
  };

  return (
    <div className="report-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="report-modal" onSubmit={submit} aria-labelledby="report-form-title">
        <div className="report-modal-heading"><div><span className="eyebrow">{report ? "REPORT SETTINGS" : "NEW ANALYSIS"}</span><h2 id="report-form-title">{report ? "Shape this report" : "Create a report"}</h2></div><button type="button" className="report-icon-button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <label>Report name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Quarterly product pulse" /></label>
        <label>Description<textarea required maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What question does this report answer?" /></label>
        <div className="report-form-row">
          <label>Visualization<select value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)}>{chartOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {!report && <label>Starting dataset<select value={entity} onChange={(event) => setEntity(event.target.value)}>{entities.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>}
        </div>
        <p className="report-form-note">{report ? "The saved query stays connected to this report. Built-in reports are protected; create a copy to customize one." : "We’ll start with the selected dataset’s fields. You can refine the query later in Query Builder."}</p>
        <div className="report-modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{report ? "Save changes" : "Create report"}</button></div>
      </form>
    </div>
  );
}

export default function Reports({
  onEditQuery,
  onNavigateToPage,
}: {
  onEditQuery: (definition: QueryDefinition) => void;
  onNavigateToPage: (page: "sources" | "metadata" | "builder") => void;
}) {
  const dispatch = useDispatch();
  const showMessageBox = useMessageBox();
  const { reports, reportsStatus, reportsError, metadata, metadataStatus, metadataError } = useSelector((state) => state.queryBuilder);
  const [reportResults, setReportResults] = useState<Record<string, QueryResult>>({});
  const [reportLoading, setReportLoading] = useState<Record<string, boolean>>({});
  const [reportErrors, setReportErrors] = useState<Record<string, string>>({});
  const [demoResults, setDemoResults] = useState<Partial<Record<ReportDemoExampleKey, QueryResult>>>({});
  const [demoLoading, setDemoLoading] = useState<Partial<Record<ReportDemoExampleKey, boolean>>>({});
  const [demoErrors, setDemoErrors] = useState<Partial<Record<ReportDemoExampleKey, string>>>({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setCategory] = useState<string | null>(null);
  const [reportOrder, setReportOrder] = useState<string[]>(() => {
    const savedOrder = window.sessionStorage.getItem("OQuery-report-order");
    if (!savedOrder) return [];
    const parsedOrder: unknown = JSON.parse(savedOrder);
    if (!Array.isArray(parsedOrder) || !parsedOrder.every((fileName) => typeof fileName === "string")) {
      throw new Error("Invalid report order in browser session storage.");
    }
    return parsedOrder;
  });
  const requestedReports = useRef(new Set<string>());
  const [reportLayouts, setReportLayouts] = useState<Record<string, ReportLayout>>(readReportLayouts);
  const [chartTypeDrafts, setChartTypeDrafts] = useState<Record<string, ChartType>>({});
  const [chartSettingsDrafts, setChartSettingsDrafts] = useState<Record<string, ReportChartSettings>>({});
  const [editingReport, setEditingReport] = useState<ReportDto | null>(null);
  const [detailReport, setDetailReport] = useState<ReportDto | null>(null);
  const detailScrollPosition = useRef(0);
  const [creatingReport, setCreatingReport] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    if (reportsStatus === "idle") dispatch(fetchReports());
    if (metadataStatus === "idle") dispatch(fetchQueryMetadata());
  }, [dispatch, metadataStatus, reportsStatus]);

  const sortedReports = useMemo(() => {
    const alphabeticalReports = [...reports].sort((left, right) => (
      reportTitle(left).localeCompare(reportTitle(right), undefined, { numeric: true, sensitivity: "base" })
    ));
    const orderIndex = new Map(reportOrder.map((fileName, index) => [fileName, index]));
    return alphabeticalReports.sort((left, right) => (
      (orderIndex.get(left.fileName) ?? Number.MAX_SAFE_INTEGER)
      - (orderIndex.get(right.fileName) ?? Number.MAX_SAFE_INTEGER)
    ));
  }, [reportOrder, reports]);

  useEffect(() => {
    window.sessionStorage.setItem("OQuery-report-order", JSON.stringify(reportOrder));
  }, [reportOrder]);
  const reportGroups = useMemo(() => [...new Set(sortedReports.map((request) => presentationFor(request).category))].map((name) => ({
    name,
    reports: sortedReports.filter((request) => presentationFor(request).category === name),
  })), [sortedReports]);
  const category = selectedCategory ?? reportGroups[0]?.name ?? "All reports";
  const filteredReports = useMemo(() => sortedReports.filter((request) => {
    const matchesCategory = category === "All reports" || presentationFor(request).category === category;
    const matchesSearch = `${reportTitle(request)} ${presentationFor(request).description}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, search, sortedReports]);
  const numberOfBuiltins = sortedReports.filter((request) => !request.canDelete).length;
  const numberOfCustom = sortedReports.length - numberOfBuiltins;
  const chartTypeOverrides = Object.fromEntries(Object.entries(reportLayouts).map(([fileName, layout]) => [fileName, layout.chartType]));
  const chartSettingsOverrides = Object.fromEntries(Object.entries(reportLayouts)
    .filter((entry): entry is [string, ReportLayout & { chartSettings: ReportChartSettings }] => Boolean(entry[1].chartSettings))
    .map(([fileName, layout]) => [fileName, layout.chartSettings]));

  const runReport = async (request: ReportDto) => {
    setReportLoading((current) => ({ ...current, [request.fileName]: true }));
    setReportErrors((current) => ({ ...current, [request.fileName]: "" }));
    const action = await dispatch(executeQuery(fromApiQuery(request.query)));
    if (executeQuery.fulfilled.match(action)) {
      setReportResults((current) => ({ ...current, [request.fileName]: action.payload }));
    } else {
      setReportErrors((current) => ({ ...current, [request.fileName]: String(action.payload || "Unable to run this report.") }));
    }
    setReportLoading((current) => ({ ...current, [request.fileName]: false }));
  };

  const runDemo = async (example: ReportDemoExampleKey, query: string) => {
    setDemoLoading((current) => ({ ...current, [example]: true }));
    setDemoErrors((current) => ({ ...current, [example]: "" }));
    const action = await dispatch(executeQueryFromText(query));
    if (executeQueryFromText.fulfilled.match(action)) {
      setDemoResults((current) => ({ ...current, [example]: action.payload }));
    } else {
      setDemoErrors((current) => ({ ...current, [example]: String(action.payload || "Unable to run this example.") }));
    }
    setDemoLoading((current) => ({ ...current, [example]: false }));
  };

  useEffect(() => {
    if (reportsStatus !== "succeeded") return;
    filteredReports.forEach((request) => {
      if (requestedReports.current.has(request.fileName)) return;
      requestedReports.current.add(request.fileName);
      void runReport(request);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReports, reportsStatus]);

  const changeChartType = (request: ReportDto, chartType: ChartType) => {
    setChartTypeDrafts((current) => ({ ...current, [request.fileName]: chartType }));
  };

  const changeChartSettings = (request: ReportDto, settings: ReportChartSettings) => {
    setChartSettingsDrafts((current) => ({ ...current, [request.fileName]: settings }));
  };

  const applyReportLayout = (request: ReportDto): string | null => {
    const savedLayout = reportLayouts[request.fileName];
    const result = reportResults[request.fileName];
    const chartSettings = chartSettingsDrafts[request.fileName]
      || savedLayout?.chartSettings
      || (result ? defaultReportChartSettings(request, result) : undefined);
    const layout: ReportLayout = {
      chartType: chartTypeDrafts[request.fileName] || savedLayout?.chartType || presentationFor(request).chartType,
      ...(chartSettings ? { chartSettings } : {}),
    };
    const updatedLayouts = { ...reportLayouts, [request.fileName]: layout };
    try {
      window.localStorage.setItem(reportLayoutsStorageKey, JSON.stringify(updatedLayouts));
    } catch (error) {
      return error instanceof Error
        ? `Unable to save this report layout: ${error.message}`
        : "Unable to save this report layout.";
    }
    setReportLayouts(updatedLayouts);
    setChartTypeDrafts((current) => {
      const next = { ...current };
      delete next[request.fileName];
      return next;
    });
    setChartSettingsDrafts((current) => {
      const next = { ...current };
      delete next[request.fileName];
      return next;
    });
    return null;
  };

  const reorderReports = (sourceFileName: string, targetFileName: string, position: "before" | "after") => {
    setReportOrder(() => {
      const currentOrder = sortedReports.map((report) => report.fileName);
      const sourceIndex = currentOrder.indexOf(sourceFileName);
      const targetIndex = currentOrder.indexOf(targetFileName);
      if (sourceIndex < 0 || targetIndex < 0) return currentOrder;
      currentOrder.splice(sourceIndex, 1);
      const insertIndex = currentOrder.indexOf(targetFileName) + (position === "after" ? 1 : 0);
      currentOrder.splice(insertIndex, 0, sourceFileName);
      return currentOrder;
    });
  };

  const selectReportGroup = (group: string) => {
    setCategory(group);
    setSearch("");
    setDetailReport(null);
  };

  const saveReport = async ({ name, description, chartType, entity }: { name: string; description: string; chartType: ChartType; entity: string }) => {
    const target = editingReport;
    const entityMetadata = metadata.find((item) => item.name === entity);
    const queryDefinition = target
      ? fromApiQuery(target.query)
      : entityMetadata ? getNewDefinition(entityMetadata) : null;
    if (!queryDefinition) {
      setMessageIsError(true);
      setMessage("Dataset metadata is not available yet.");
      return;
    }
    const resultAction = await dispatch(saveReport({
      fileName: target?.fileName,
      name,
      definition: queryDefinition,
      requestText: target?.fileName ? target.requestText || undefined : undefined,
      description,
      chartType,
    }));
    if (saveReport.fulfilled.match(resultAction)) {
      setMessageIsError(false);
      setMessage(target ? "Report updated." : "Report created.");
      setCreatingReport(false);
      setEditingReport(null);
    } else {
      setMessageIsError(true);
      setMessage(String(resultAction.payload || "Unable to save report."));
    }
  };

  const deleteSelectedReport = async (request: ReportDto) => {
    const action = await showMessageBox({
      eyebrow: "DELETE REPORT",
      title: `Delete "${reportTitle(request)}"?`,
      message: "This custom report and its saved query will be permanently removed.",
      actions: [
        { value: "cancel", label: "Keep report", variant: "secondary" },
        { value: "delete", label: "Delete report", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    const resultAction = await dispatch(deleteReport(request.fileName));
    if (deleteReport.fulfilled.match(resultAction)) {
      setMessageIsError(false);
      setMessage("Report deleted.");
    } else {
      setMessageIsError(true);
      setMessage(String(resultAction.payload || "Unable to delete report."));
    }
  };

  const createReport = () => {
    onEditQuery(getNewDefinition(metadata[0]));
  };

  const openReportDetails = (report: ReportDto) => {
    detailScrollPosition.current = window.scrollY;
    window.scrollTo(0, 0);
    setChartTypeDrafts((current) => {
      const next = { ...current };
      delete next[report.fileName];
      return next;
    });
    setChartSettingsDrafts((current) => {
      const next = { ...current };
      delete next[report.fileName];
      return next;
    });
    setDetailReport(report);
  };

  const closeReportDetails = () => {
    setDetailReport(null);
    window.requestAnimationFrame(() => window.scrollTo(0, detailScrollPosition.current));
  };

  return (
    <div className="reports-page">
      <ReportDashboard
        onNavigateToPage={onNavigateToPage}
        groups={reportGroups}
        sortedReports={sortedReports}
        filteredReports={filteredReports}
        category={category}
        search={search}
        numberOfBuiltins={numberOfBuiltins}
        numberOfCustom={numberOfCustom}
        reportsStatus={reportsStatus}
        reportsError={reportsError}
        metadataStatus={metadataStatus}
        metadataError={metadataError}
        reportResults={reportResults}
        reportLoading={reportLoading}
        reportErrors={reportErrors}
        demoResults={demoResults}
        demoLoading={demoLoading}
        demoErrors={demoErrors}
        chartTypeOverrides={chartTypeOverrides}
        chartSettingsOverrides={chartSettingsOverrides}
        detailReport={detailReport}
        detailResult={detailReport ? reportResults[detailReport.fileName] : undefined}
        detailChartType={detailReport
          ? chartTypeDrafts[detailReport.fileName] || reportLayouts[detailReport.fileName]?.chartType || presentationFor(detailReport).chartType
          : "bar"}
        detailChartSettings={detailReport
          ? chartSettingsDrafts[detailReport.fileName]
            || reportLayouts[detailReport.fileName]?.chartSettings
            || (reportResults[detailReport.fileName]
              ? defaultReportChartSettings(detailReport, reportResults[detailReport.fileName])
              : { metrics: [], axes: {} })
          : { metrics: [], axes: {} }}
        detailLoading={Boolean(detailReport && reportLoading[detailReport.fileName])}
        detailError={detailReport ? reportErrors[detailReport.fileName] : undefined}
        message={message}
        messageIsError={messageIsError}
        onReorderReports={reorderReports}
        onCreateReport={createReport}
        onSelectCategory={selectReportGroup}
        onSearchChange={setSearch}
        onDismissMessage={() => setMessage("")}
        onRun={(report) => void runReport(report)}
        onRunDemo={(example, query) => void runDemo(example, query)}
        onCloseDemo={(example) => {
          setDemoResults((current) => {
            const next = { ...current };
            delete next[example];
            return next;
          });
          setDemoErrors((current) => {
            const next = { ...current };
            delete next[example];
            return next;
          });
        }}
        onOpenDetails={openReportDetails}
        onCloseDetails={closeReportDetails}
        onRunDetails={() => { if (detailReport) void runReport(detailReport); }}
        onApplyLayout={applyReportLayout}
        onChartTypeChange={changeChartType}
        onChartSettingsChange={changeChartSettings}
        onEdit={setEditingReport}
        onDelete={(report) => void deleteSelectedReport(report)}
        onEditQuery={(report) => onEditQuery(fromApiQuery(report.query))}
      />

      {(creatingReport || editingReport) && <ReportForm
        report={editingReport}
        entities={metadata}
        onClose={() => { setCreatingReport(false); setEditingReport(null); }}
        onSave={(details) => void saveReport(details)}
      />}
    </div>
  );
}
