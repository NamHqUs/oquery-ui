import type { DragEvent } from "react";
import Icon from "../../icon/icon";
import type { QueryResult, ReportDto } from "../../query-builder/query-design/query-builder-slice";
import ReportChart from "../charts/report-chart";
import {
  categoryTone,
  presentationFor,
  reportTitle,
  type ChartType,
  type ReportChartSettings,
} from "../report-model";

type ReportItemProps = {
  report: ReportDto;
  chartType: ChartType;
  result?: QueryResult;
  chartSettings: ReportChartSettings;
  loading: boolean;
  error?: string;
  dropPosition?: "before" | "after";
  onOpenDetails: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onRun: () => void;
  onEdit: () => void;
  onEditQuery: () => void;
  onDelete: () => void;
};

export default function ReportItem({
  report, chartType, result, chartSettings, loading, error,
  dropPosition, onOpenDetails, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  onRun, onEdit, onEditQuery, onDelete,
}: ReportItemProps) {
  const presentation = presentationFor(report);
  const title = reportTitle(report);

  return (
    <article
      className={`report-dashboard-card tone-${categoryTone(presentation.category)}${dropPosition ? ` drop-${dropPosition}` : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className="report-dashboard-card-top"
        draggable
        title="Drag this header to move the report"
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <h4>{title}</h4>
        <div className="report-dashboard-card-tools">
          <button className="report-icon-button" type="button" aria-label={`Run ${title}`} title="Run report" onClick={onRun} disabled={loading}>          <Icon name="play" size={13} /></button>
          {report.canDelete ? <>
            <button className="report-icon-button" type="button" aria-label={`Edit ${title}`} title="Edit report" onClick={onEdit}><Icon name="edit" size={13} /></button>
            <button className="report-icon-button report-delete-button" type="button" aria-label={`Delete ${title}`} title="Delete report" onClick={onDelete}><Icon name="trash" size={13} /></button>
          </> : <button className="report-icon-button" type="button" aria-label={`Edit ${title} in Query Builder`} title="Edit in Query Builder" onClick={onEditQuery}><Icon name="edit" size={13} /></button>}
        </div>
      </div>
      <section className="report-card-visual" aria-label={`${title} chart`}>
        <button
          className="report-card-visual-open"
          type="button"
          aria-label={`Open ${title} report details`}
          onClick={onOpenDetails}
        />
        <div className="report-card-chart" onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button, input, label")) return;
          onOpenDetails();
        }}>
          {result
            ? <ReportChart key={chartType} result={result} type={chartType} report={report} settings={chartSettings} metric={presentation.metric} groupBy={presentation.groupBy} xMetric={presentation.xMetric} />
            : loading
              ? <div className="report-card-chart-status"><span className="report-spinner" /> Loading chart…</div>
              : <div className="report-card-chart-status">{error ? <span role="alert">{error}</span> : <><span>Run this report to load its chart.</span><button type="button" onClick={onRun}>Run report <Icon name="play" size={11} /></button></>}</div>}
        </div>
      </section>
    </article>
  );
}
