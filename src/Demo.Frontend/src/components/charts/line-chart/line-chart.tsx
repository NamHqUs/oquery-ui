import { useState } from "react";
import type { AggregateChartData, ChartData } from "../chart-types";
import { chartColors, formatChartValue, niceChartMax } from "../chart-utils";

export default function LineChart({ data }: { data: ChartData }) {
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const width = 680;
  const height = 235;

  if (data.kind === "simple") {
    const max = Math.max(...data.points.map((point) => point.value), 1);
    const points = data.points.map((point, index) => ({
      x: data.points.length === 1 ? width / 2 : 22 + (index * (width - 44)) / (data.points.length - 1),
      y: height - 25 - (point.value / max) * (height - 55),
    }));
    const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");

    return (
      <div className="report-svg-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Report trend chart">
          {[0, 1, 2, 3].map((row) => <line key={row} x1="20" x2={width - 16} y1={35 + row * 52} y2={35 + row * 52} className="chart-grid-line" />)}
          <path d={line} className="report-line" />
          {points.map((point, index) => (
            <g key={`${data.points[index].label}-${index}`} className="chart-data-point" tabIndex={0} aria-label={`${data.points[index].label}: ${formatChartValue(data.points[index].value)}`}>
              <title>{`${data.points[index].label}: ${formatChartValue(data.points[index].value)}`}</title>
              <circle cx={point.x} cy={point.y} r="9" fill="transparent" pointerEvents="all" />
              <circle cx={point.x} cy={point.y} r="4" className="report-point" />
              <g className="chart-hover-tooltip" transform={`translate(${Math.max(8, Math.min(point.x - 92, width - 192))},${Math.max(2, point.y - 48)})`}>
                <rect width="184" height="40" rx="5" />
                <text x="8" y="15" className="chart-tooltip-label">{data.points[index].label.slice(0, 28)}</text>
                <text x="8" y="31" className="chart-tooltip-value">{formatChartValue(data.points[index].value)}</text>
              </g>
              {data.points.length < 8 && <text x={point.x} y={height - 5} textAnchor="middle" className="chart-label">{data.points[index].label.slice(0, 12)}</text>}
            </g>
          ))}
        </svg>
      </div>
    );
  }

  return <AggregateLineChart data={data} hiddenSeries={hiddenSeries} onToggleSeries={(series) => {
    setHiddenSeries((hidden) => hidden.includes(series) ? hidden.filter((name) => name !== series) : [...hidden, series]);
  }} />;
}

function AggregateLineChart({ data, hiddenSeries, onToggleSeries }: {
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
  const minValue = Math.min(0, ...data.points.map((point) => point.value));
  const maxValue = niceChartMax(Math.max(1, ...data.points.map((point) => point.value)));
  const linePoints = (seriesPoints: typeof visiblePoints) => seriesPoints.map((point) => ({
    x: categories.length === 1 ? width / 2 : 22 + (categories.indexOf(point.label) * (width - 44)) / (categories.length - 1),
    y: height - 25 - ((point.value - minValue) / (maxValue - minValue || 1)) * (height - 55),
  }));

  return (
    <>
      {data.showSeriesLegend !== false && <SeriesLegend data={data} isVisible={isSeriesVisible} onToggle={onToggleSeries} />}
      <div className="report-svg-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Report trend chart">
          {[0, 1, 2, 3].map((row) => <line key={row} x1="20" x2={width - 16} y1={35 + row * 52} y2={35 + row * 52} className="chart-grid-line" />)}
          {data.seriesNames.filter(isSeriesVisible).map((series) => {
            const seriesPoints = visiblePoints.filter((point) => point.series === series);
            const plotted = linePoints(seriesPoints);
            const line = plotted.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
            return <g key={series}>
              <path d={line} className="report-line" style={{ stroke: chartColors[(data.seriesColorIndex ?? data.seriesNames.indexOf(series)) % chartColors.length] }} />
              {plotted.slice(1).map((point, index) => {
                const previous = plotted[index];
                const previousValue = seriesPoints[index];
                const currentValue = seriesPoints[index + 1];
                const detail = `${previousValue.label}: ${series} ${formatChartValue(previousValue.value)}\n${currentValue.label}: ${series} ${formatChartValue(currentValue.value)}`;
                const tooltipX = Math.max(8, Math.min((previous.x + point.x) / 2 - 92, width - 192));
                const tooltipY = Math.max(2, Math.min((previous.y + point.y) / 2 - 48, height - 45));
                return <g key={`${series}-${index}-hit`} className="chart-data-point" tabIndex={0} aria-label={detail}>
                  <path
                    d={`M ${previous.x} ${previous.y} L ${point.x} ${point.y}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    pointerEvents="stroke"
                  >
                    <title>{detail}</title>
                  </path>
                  <g className="chart-hover-tooltip" transform={`translate(${tooltipX},${tooltipY})`}>
                    <rect width="184" height="40" rx="5" />
                    <text x="8" y="15" className="chart-tooltip-label">
                      {`${previousValue.label} → ${currentValue.label}`.slice(0, 28)}
                    </text>
                    <text x="8" y="31" className="chart-tooltip-value">{`${series}: ${formatChartValue(previousValue.value)} → ${formatChartValue(currentValue.value)}`.slice(0, 30)}</text>
                  </g>
                </g>;
              })}
              {plotted.map((point, index) => {
                const sourcePoint = seriesPoints[index];
                const detail = `${sourcePoint.label}\n${series}: ${formatChartValue(sourcePoint.value)}`;
                return <g key={`${series}-${index}`} className="chart-data-point" tabIndex={0} aria-label={detail}>
                <title>{detail}</title>
                <circle cx={point.x} cy={point.y} r="9" fill="transparent" pointerEvents="all" />
                <circle cx={point.x} cy={point.y} r="4" className="report-point" style={{ fill: chartColors[(data.seriesColorIndex ?? data.seriesNames.indexOf(series)) % chartColors.length] }} />
                <g className="chart-hover-tooltip" transform={`translate(${Math.max(8, Math.min(point.x - 92, width - 192))},${Math.max(2, point.y - 48)})`}>
                  <rect width="184" height="40" rx="5" />
                  <text x="8" y="15" className="chart-tooltip-label">{sourcePoint.label.slice(0, 28)}</text>
                  <text x="8" y="31" className="chart-tooltip-value">{`${series}: ${formatChartValue(sourcePoint.value)}`.slice(0, 30)}</text>
                </g>
                {data.seriesNames.length === 1 && categories.length < 8 && <text x={point.x} y={height - 5} textAnchor="middle" className="chart-label">{seriesPoints[index].label.slice(0, 12)}</text>}
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
