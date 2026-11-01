import { useState } from "react";
import type { AggregateChartData, ChartData } from "../chart-types";
import { chartColors, niceChartMax } from "../chart-utils";

export default function ScatterChart({ data }: { data: ChartData }) {
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const width = 680;
  const height = 235;

  if (data.kind === "simple") {
    const xMin = Math.min(...data.points.map((point) => point.xValue));
    const xMax = Math.max(...data.points.map((point) => point.xValue), xMin + 1);
    const max = Math.max(...data.points.map((point) => point.value), 1);
    const points = data.points.map((point) => ({
      x: 22 + ((point.xValue - xMin) / (xMax - xMin)) * (width - 44),
      y: height - 25 - (point.value / max) * (height - 55),
    }));

    return (
      <div className="report-svg-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Report scatter chart">
          {[0, 1, 2, 3].map((row) => <line key={row} x1="20" x2={width - 16} y1={35 + row * 52} y2={35 + row * 52} className="chart-grid-line" />)}
          {points.map((point, index) => (
            <g key={`${data.points[index].label}-${index}`}>
              <circle cx={point.x} cy={point.y} r="5.5" className="report-point" />
              {data.points.length < 8 && <text x={point.x} y={height - 5} textAnchor="middle" className="chart-label">{data.points[index].label.slice(0, 12)}</text>}
            </g>
          ))}
        </svg>
      </div>
    );
  }

  return <AggregateScatterChart data={data} hiddenSeries={hiddenSeries} onToggleSeries={(series) => {
    setHiddenSeries((hidden) => hidden.includes(series) ? hidden.filter((name) => name !== series) : [...hidden, series]);
  }} />;
}

function AggregateScatterChart({ data, hiddenSeries, onToggleSeries }: {
  data: AggregateChartData;
  hiddenSeries: string[];
  onToggleSeries: (series: string) => void;
}) {
  const width = 680;
  const height = 235;
  const isSeriesVisible = (series: string) => !hiddenSeries.includes(series);
  const visiblePoints = data.points.filter((point) => isSeriesVisible(point.series));
  if (!visiblePoints.length) {
    return (
      <>
        {data.showSeriesLegend !== false && <SeriesLegend data={data} isVisible={isSeriesVisible} onToggle={onToggleSeries} />}
        <div className="report-chart-empty"><strong>No chart series selected</strong><span>Enable a legend item to show it in the chart.</span></div>
      </>
    );
  }

  const categories = data.categories.length ? data.categories : [...new Set(data.points.map((point) => point.label))];
  const xMin = Math.min(...data.points.map((point) => point.xValue));
  const xMax = Math.max(...data.points.map((point) => point.xValue), xMin + 1);
  const minValue = Math.min(0, ...data.points.map((point) => point.value));
  const maxValue = niceChartMax(Math.max(1, ...data.points.map((point) => point.value)));

  return (
    <>
      {data.showSeriesLegend !== false && <SeriesLegend data={data} isVisible={isSeriesVisible} onToggle={onToggleSeries} />}
      <div className="report-svg-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Report scatter chart">
          {[0, 1, 2, 3].map((row) => <line key={row} x1="20" x2={width - 16} y1={35 + row * 52} y2={35 + row * 52} className="chart-grid-line" />)}
          {data.seriesNames.filter(isSeriesVisible).map((series) => {
            const seriesPoints = visiblePoints.filter((point) => point.series === series);
            return <g key={series}>
              {seriesPoints.map((point, index) => {
                const x = 22 + ((point.xValue - xMin) / (xMax - xMin)) * (width - 44);
                const y = height - 25 - ((point.value - minValue) / (maxValue - minValue || 1)) * (height - 55);
                return <g key={`${series}-${index}`}>
                  <circle cx={x} cy={y} r="5.5" className="report-point" style={{ fill: chartColors[(data.seriesColorIndex ?? data.seriesNames.indexOf(series)) % chartColors.length] }} />
                  {data.seriesNames.length === 1 && categories.length < 8 && <text x={x} y={height - 5} textAnchor="middle" className="chart-label">{point.label.slice(0, 12)}</text>}
                </g>;
              })}
            </g>;
          })}
        </svg>
      </div>
    </>
  );
}

function SeriesLegend({ data, isVisible, onToggle }: {
  data: AggregateChartData;
  isVisible: (series: string) => boolean;
  onToggle: (series: string) => void;
}) {
  return <div className="report-series-legend" role="group" aria-label="Chart series">{data.seriesNames.map((series, index) => (
    <button type="button" aria-pressed={isVisible(series)} style={{ color: chartColors[index % chartColors.length] }} key={series} onClick={() => onToggle(series)}>
      {series}
    </button>
  ))}</div>;
}
