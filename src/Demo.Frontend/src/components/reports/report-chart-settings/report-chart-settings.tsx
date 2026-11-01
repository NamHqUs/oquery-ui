import type { QueryResult, ReportDto } from "../../query-builder/query-design/query-builder-slice";
import { reportChartFields, type ChartType, type ReportChartSettings } from "../report-model";

export default function ReportChartSettingsPanel({ report, result, settings, chartType, onChange }: {
  report: ReportDto;
  result: QueryResult;
  settings: ReportChartSettings;
  chartType: ChartType;
  onChange: (settings: ReportChartSettings) => void;
}) {
  const fields = reportChartFields(report, result);
  if (!fields.metrics.length) return null;
  const selectedProjections = fields.axes.filter((field) =>
    settings.axes[field] === "axis1" || settings.axes[field] === "axis2",
  );
  const hasProjectionBreakdown = selectedProjections.length > 0
    && selectedProjections.length < fields.axes.length;

  const setMetric = (metric: string, enabled: boolean) => {
    const metrics = enabled
      ? [...settings.metrics, metric]
      : settings.metrics.filter((selected) => selected !== metric);
    onChange({ ...settings, metrics });
  };

  return (
    <section className="report-chart-settings" aria-label="Chart settings">
      <fieldset>
        <legend>Projection fields</legend>
        {fields.axes.length
          ? fields.axes.map((field) => {
          const selected = settings.axes[field] === "axis1" || settings.axes[field] === "axis2";
          return <button
            className="report-channel-option"
            type="button"
            aria-pressed={selected}
            key={field}
            onClick={() => onChange({
              ...settings,
              axes: {
                ...settings.axes,
                [field]: selected ? "none" : "axis1",
              },
            })}
          >
            {field}
          </button>;
          })
          : <span className="report-chart-fixed-series">No projection fields available</span>}
      </fieldset>
      <fieldset>
        <legend>Series</legend>
        {fields.metrics.length === 1
          ? <span className="report-chart-fixed-series">{fields.metrics[0]}</span>
          : fields.metrics.map((metric) => <button className="report-channel-option" type="button" aria-pressed={settings.metrics.includes(metric)} key={metric} onClick={() => setMetric(metric, !settings.metrics.includes(metric))}>
            {metric}
          </button>)}
      </fieldset>
      {(fields.metrics.length > 1 || (chartType === "bar" && hasProjectionBreakdown)) && <fieldset>
        <legend>Display style</legend>
        {chartType === "bar" && hasProjectionBreakdown && <button
          className="report-channel-option"
          type="button"
          aria-pressed={settings.breakdownDisplay === "direct"}
          onClick={() => onChange({
            ...settings,
            breakdownDisplay: settings.breakdownDisplay === "direct" ? "subcharts" : "direct",
          })}
        >
          Breakdown Stack
        </button>}
        {fields.metrics.length > 1 && <button
          className="report-channel-option"
          type="button"
          aria-pressed={settings.seriesLayout === "separate"}
          onClick={() => onChange({ ...settings, seriesLayout: settings.seriesLayout === "separate" ? "combined" : "separate" })}
        >
          {settings.seriesLayout === "separate" ? "Combine series" : "Separate charts per series"}
        </button>}
      </fieldset>}
    </section>
  );
}
