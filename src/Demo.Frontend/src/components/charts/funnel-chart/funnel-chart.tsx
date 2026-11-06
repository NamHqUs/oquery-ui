import { useState } from "react";
import type { AggregateChartData, ChartData } from "../chart-types";
import { chartColors, formatChartValue, niceChartMax } from "../chart-utils";

export default function FunnelChart({ data }: { data: ChartData }) {
  if (data.kind === "simple") {
    const max = Math.max(...data.points.map((point) => point.value), 1);
    return (
      <div className="report-bars report-funnel">
        {data.points.map((point, index) => (
          <div className="report-bar-row" key={`${point.label}-${index}`}>
            <span className="report-bar-label" title={point.label}>{point.label}</span>
            <div className="report-bar-track"><i style={{ width: `${Math.max(3, (point.value / max) * 100)}%`, opacity: 1 - index * 0.035 }} /></div>
            <b>{formatChartValue(point.value)}</b>
          </div>
        ))}
      </div>
    );
  }

  return <AggregateFunnelChart data={data} />;
}

function AggregateFunnelChart({ data }: { data: AggregateChartData }) {
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const isSeriesVisible = (series: string) => !hiddenSeries.includes(series);
  const toggleSeries = (series: string) => {
    setHiddenSeries((hidden) => hidden.includes(series) ? hidden.filter((name) => name !== series) : [...hidden, series]);
  };
  const visiblePoints = data.points.filter((point) => isSeriesVisible(point.series));
  if (!visiblePoints.length) {
    return (
      <>
        {data.seriesNames.length > 1 && <div className="report-series-legend" role="group" aria-label="Chart series">{data.seriesNames.map((series, index) => (
          <button type="button" aria-pressed={isSeriesVisible(series)} style={{ color: chartColors[index % chartColors.length] }} key={series} onClick={() => toggleSeries(series)}>
            {series}
          </button>
        ))}</div>}
        <div className="report-chart-empty"><strong>No chart series selected</strong><span>Enable a legend item to show it in the chart.</span></div>
      </>
    );
  }
  const max = niceChartMax(Math.max(...visiblePoints.map((point) => Math.abs(point.value)), 1));
  const colorsForSeries = new Map(data.seriesNames.map((series, index) => [
    series,
    chartColors[(data.seriesColorIndex ?? index) % chartColors.length],
  ]));

  return (
    <>
      {data.seriesNames.length > 1 && <div className="report-series-legend" role="group" aria-label="Chart series">{data.seriesNames.map((series, index) => (
        <button type="button" aria-pressed={isSeriesVisible(series)} style={{ color: chartColors[index % chartColors.length] }} key={series} onClick={() => toggleSeries(series)}>
          {series}
        </button>
      ))}</div>}
      <div className="report-bars report-funnel">
        {visiblePoints.map((point, index) => (
          <div className="report-bar-row" key={`${point.label}-${point.series}-${index}`}>
            <span className="report-bar-label" title={`${point.label} · ${point.series}`}>{data.seriesNames.length > 1 ? `${point.label} · ${point.series}` : point.label}</span>
            <div className="report-bar-track"><i style={{ width: `${Math.max(3, (Math.abs(point.value) / max) * 100)}%`, opacity: 1 - (index % 12) * 0.035, background: colorsForSeries.get(point.series) }} /></div>
            <b>{formatChartValue(point.value)}</b>
          </div>
        ))}
      </div>
    </>
  );
}
