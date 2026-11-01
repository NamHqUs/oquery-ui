import { useState } from "react";
import type { AggregateChartData, ChartData } from "../chart-types";
import { chartColors, formatChartValue, niceChartMax, niceChartStep } from "../chart-utils";

export default function BarChart({ data }: { data: ChartData }) {
  if (data.kind === "simple") {
    const max = Math.max(...data.points.map((point) => point.value), 1);
    return (
      <div className="report-bars">
        {data.points.map((point, index) => (
          <div className="report-bar-row" key={`${point.label}-${index}`}>
            <span className="report-bar-label">{point.label}</span>
            <div className="report-bar-track"><i style={{ width: `${Math.max(3, (point.value / max) * 100)}%`, opacity: 1 - index * 0.035 }} /></div>
            <b>{formatChartValue(point.value)}</b>
          </div>
        ))}
      </div>
    );
  }

  return <AggregateBarChart data={data} />;
}

function AggregateBarChart({ data }: { data: AggregateChartData }) {
  const [expandedPoint, setExpandedPoint] = useState<{ category: string; metric: string } | null>(null);
  const visiblePoints = data.points;
  if (!visiblePoints.length) {
    return <div className="report-chart-empty"><strong>No data to visualize</strong><span>The selected chart has no data.</span></div>;
  }

  const rawMax = Math.max(...visiblePoints.map((point) => Math.abs(point.value)), 1);
  const step = niceChartStep(rawMax);
  const max = niceChartMax(rawMax);
  const visibleSeries = data.seriesNames;
  const breakdownNames = [...new Set(Object.values(data.breakdowns ?? {}).flatMap((breakdown) =>
    breakdown.points.map((point) => point.breakdownLabel ?? point.label),
  ))];
  const getBreakdownRows = (
    breakdown: AggregateChartData | undefined,
    metric: string,
    depth = 0,
    path = "",
  ): { point: AggregateChartData["points"][number]; depth: number; path: string }[] => {
    if (!breakdown) return [];
    return breakdown.points
      .filter((point) => point.metric === metric)
      .flatMap((point) => {
        const pointPath = path ? `${path}/${point.label}` : point.label;
        return [
          { point, depth, path: pointPath },
          ...getBreakdownRows(breakdown.breakdowns?.[point.label], metric, depth + 1, pointPath),
        ];
      });
  };
  const groups = new Map<string, { label: string; points: typeof visiblePoints }>();
  visiblePoints.forEach((point) => {
    const group = groups.get(point.label);
    if (group) group.points.push(point);
    else groups.set(point.label, { label: point.label, points: [point] });
  });
  const barGroups = [...groups.values()];
  const width = 680;
  const left = 128;
  const projectionLabelRight = left - 16;
  const plotWidth = 420;
  const barHeight = 8;
  const barStep = 12;
  const groupStep = visibleSeries.length * barStep + 8;
  const top = 24;
  let nextGroupTop = top;
  const groupLayouts = barGroups.map((group) => {
    const groupTop = nextGroupTop;
    const expandedIndex = expandedPoint?.category === group.label
      ? group.points.findIndex((point) => point.metric === expandedPoint.metric)
      : -1;
    const childRows = expandedIndex >= 0
      ? getBreakdownRows(data.breakdowns?.[group.label], expandedPoint.metric)
      : [];
    const lastPointShift = childRows.length && group.points.length - 1 > expandedIndex
      ? childRows.length * barStep + 4
      : 0;
    const categoryCenterY = childRows.length > 0
      ? groupTop + barHeight / 2
      : groupTop + ((group.points.length - 1) * barStep + lastPointShift) / 2 + barHeight / 2;
    const childTop = groupTop + (expandedIndex + 1) * barStep + 4;
    const longestLabelLength = Math.max(0, ...childRows.map(({ point, depth }) => Math.min(point.label.length + depth * 2, 16)));
    const spineX = projectionLabelRight - longestLabelLength * 6 - 8 - 2;
    nextGroupTop = groupTop + groupStep + (childRows.length ? childRows.length * barStep + 4 : 0);
    return { group, groupTop, categoryCenterY, childRows, childTop, expandedIndex, spineX };
  });
  const height = nextGroupTop + 24;

  return (
    <>
      {((data.seriesNames.length > 1)
        || (data.showBreakdownLegend !== false && data.breakdownDisplay === "direct" && breakdownNames.length > 0)) && <div className="report-legend" role="group" aria-label="Chart legend">
          {data.seriesNames.length > 1 && data.seriesNames.map((series, index) => <span key={`series-${series}`}>
            <i style={{ backgroundColor: chartColors[index % chartColors.length] }} />
            {series}
          </span>)}
          {data.showBreakdownLegend !== false && data.breakdownDisplay === "direct" && breakdownNames.map((name, index) => <span key={`breakdown-${name}`}>
            <i style={{ backgroundColor: chartColors[index % chartColors.length] }} />
            {name}
          </span>)}
        </div>}
      <div className="report-svg-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grouped bar chart of ${data.seriesNames.join(", ")}`}>
          {[0, 1, 2, 3, 4, 5].map((tick) => {
            const x = left + (plotWidth * tick) / 5;
            const value = step * tick;
            return <g key={tick}>
              <line x1={x} x2={x} y1={top - 6} y2={height - 20} className="chart-grid-line" />
              <text x={x} y={height - 4} textAnchor="middle" className="chart-label">{formatChartValue(value)}</text>
            </g>;
          })}
          {groupLayouts.map(({ group, childRows, childTop, expandedIndex, spineX }, groupIndex) =>
            expandedIndex >= 0 && childRows.length > 0
              ? <rect
                key={`${group.label}-${groupIndex}-spine`}
                x={spineX}
                y={childTop - 2}
                width="2"
                height={childRows.length * barStep}
                className="chart-breakdown-spine"
              />
              : null,
          )}
          {groupLayouts.map(({ group, groupTop, categoryCenterY, childRows, childTop, expandedIndex }, groupIndex) => {
            const canExpand = Boolean(data.breakdowns?.[group.label]);
            const label = group.label.length > 18 ? `${group.label.slice(0, 17)}…` : group.label;
            return <g
              key={`${group.label}-${groupIndex}`}
            >
              <text
                x={projectionLabelRight}
                y={categoryCenterY + 4}
                textAnchor="end"
                className="chart-label"
              >
                {label}
              </text>
              {group.points.map((point, pointIndex) => {
                const barWidth = Math.max(3, (Math.abs(point.value) / max) * plotWidth);
                const isExpanded = expandedIndex === pointIndex;
                const shift = childRows.length > 0 && expandedIndex >= 0 && pointIndex > expandedIndex ? childRows.length * barStep + 4 : 0;
                const y = groupTop + pointIndex * barStep + shift;
                const seriesIndex = data.seriesColorIndex ?? data.seriesNames.indexOf(point.series);
                const detail = `${group.label}\n${point.series}: ${formatChartValue(point.value)}`;
                const breakdownPoints = data.breakdownDisplay === "direct"
                  ? (data.breakdowns?.[group.label]?.points.filter((breakdownPoint) =>
                    breakdownPoint.metric === point.metric,
                  ) ?? [])
                  : [];
                const breakdownTotal = breakdownPoints.reduce((total, breakdownPoint) => total + Math.abs(breakdownPoint.value), 0);
                let segmentX = left;
                return <g key={point.series}>
                  <g
                  className="chart-drillable"
                  role={breakdownPoints.length ? "button" : undefined}
                  tabIndex={breakdownPoints.length ? 0 : undefined}
                  aria-label={breakdownPoints.length
                    ? canExpand ? `${isExpanded ? "Collapse" : "Expand"} ${point.metric} breakdown for ${group.label}` : detail
                    : undefined}
                  aria-expanded={breakdownPoints.length && canExpand ? isExpanded : undefined}
                  onClick={(event) => {
                    if (breakdownPoints.length) {
                      if (canExpand) {
                        setExpandedPoint(isExpanded ? null : { category: group.label, metric: point.metric });
                        if (isExpanded) event.currentTarget.blur();
                        else event.currentTarget.focus();
                      } else {
                        event.currentTarget.focus();
                      }
                      return;
                    }
                    const bar = event.currentTarget.querySelector("rect");
                    if (canExpand) {
                      setExpandedPoint(isExpanded ? null : { category: group.label, metric: point.metric });
                      if (isExpanded) bar?.blur();
                      else bar?.focus();
                    } else {
                      bar?.focus();
                    }
                  }}
                  onKeyDown={breakdownPoints.length ? (event) => {
                    if ((event.key === "Enter" || event.key === " ") && canExpand) {
                      event.preventDefault();
                      setExpandedPoint(isExpanded ? null : { category: group.label, metric: point.metric });
                      if (isExpanded) event.currentTarget.blur();
                    }
                  } : undefined}
                >
                  {breakdownPoints.length
                    ? breakdownPoints.map((breakdownPoint) => {
                      const segmentWidth = breakdownTotal > 0
                        ? barWidth * Math.abs(breakdownPoint.value) / breakdownTotal
                        : barWidth / breakdownPoints.length;
                      const x = segmentX;
                      segmentX += segmentWidth;
                      const breakdownName = breakdownPoint.breakdownLabel ?? breakdownPoint.label;
                      return <rect
                        key={`${breakdownPoint.label}-${breakdownPoint.metric}`}
                        x={x}
                        y={y}
                        width={segmentWidth}
                        height={barHeight}
                        fill={chartColors[breakdownNames.indexOf(breakdownName) % chartColors.length]}
                        className="chart-data-point chart-stacked-segment"
                      >
                        <title>{`${breakdownPoint.breakdownField ?? "Breakdown"}: ${breakdownName}\n${point.metric}: ${formatChartValue(breakdownPoint.value)}`}</title>
                      </rect>;
                    })
                    : <rect
                      x={left}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="3"
                      fill={chartColors[seriesIndex % chartColors.length]}
                      className={`chart-data-point chart-drillable${isExpanded ? " chart-expanded-parent" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={canExpand ? `${isExpanded ? "Collapse" : "Expand"} ${point.metric} breakdown for ${group.label}` : detail}
                      aria-expanded={canExpand ? isExpanded : undefined}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (canExpand) {
                            setExpandedPoint(isExpanded ? null : { category: group.label, metric: point.metric });
                            if (isExpanded) event.currentTarget.blur();
                          }
                        }
                      }}
                    />}
                  {breakdownPoints.length > 0 && <rect
                    x={left}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    className={`chart-stacked-focus-outline${isExpanded ? " chart-expanded-parent" : ""}`}
                  />}
                  </g>
                  <text x={left + barWidth + 5} y={y + barHeight - 1} className={isExpanded ? "chart-label chart-expanded-value" : "chart-label"}>{formatChartValue(point.value)}</text>
                </g>;
              })}
              {childRows.map(({ point, depth, path }, pointIndex) => {
                const barWidth = Math.max(3, (Math.abs(point.value) / max) * plotWidth);
                const y = childTop + pointIndex * barStep;
                const seriesIndex = data.seriesColorIndex ?? data.seriesNames.indexOf(point.series);
                const brightness = Math.max(0.45, 0.8 ** (depth + 1));
                const label = point.label.length > 16 ? `${point.label.slice(0, 15)}…` : point.label;
                return <g key={`${path}-${point.series}`} className="chart-breakdown-point">
                  <text x={projectionLabelRight - depth * 10} y={y + barHeight - 1} textAnchor="end" className="chart-label chart-breakdown-label">{label}</text>
                  <rect x={left} y={y} width={barWidth} height={barHeight} rx="3" fill={chartColors[seriesIndex % chartColors.length]} style={{ filter: `brightness(${brightness})` }}>
                    <title>{`${point.breakdownField ?? "Breakdown"}: ${point.breakdownLabel ?? point.label}\n${point.metric}: ${formatChartValue(point.value)}`}</title>
                  </rect>
                  <text x={left + barWidth + 5} y={y + barHeight - 1} className="chart-label">{formatChartValue(point.value)}</text>
                </g>;
              })}
            </g>;
          })}
        </svg>
      </div>
    </>
  );
}
