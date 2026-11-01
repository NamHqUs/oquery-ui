import { useState } from "react";
import type { AggregateChartData, ChartData, ChartPoint } from "../chart-types";
import { chartColors, formatChartValue } from "../chart-utils";

type DonutSlice = ChartPoint & { start: number; end: number; color: string };

function arcPath(from: number, to: number, center: number, radius: number): string {
  const x1 = center + radius * Math.cos(from - Math.PI / 2);
  const y1 = center + radius * Math.sin(from - Math.PI / 2);
  const x2 = center + radius * Math.cos(to - Math.PI / 2);
  const y2 = center + radius * Math.sin(to - Math.PI / 2);
  return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

export default function DonutChart({ data }: { data: ChartData }) {
  if (data.kind === "simple") {
    const total = data.points.reduce((sum, point) => sum + point.value, 0) || 1;
    const simpleDonutColors = ["#a78bfa", "#58d5b1", "#63a7f8", "#f5b85c", "#ee7e9d", "#6fd0dc"];
    let start = 0;
    const slices: DonutSlice[] = data.points.map((point, index) => {
      const angle = (point.value / total) * Math.PI * 2;
      const slice = { ...point, start, end: start + angle, color: simpleDonutColors[index % simpleDonutColors.length] };
      start += angle;
      return slice;
    });

    return (
      <div className="report-donut-layout">
        <svg viewBox="0 0 210 210" role="img" aria-label="Report distribution donut chart">
          {slices.map((slice) => <path key={slice.label} d={arcPath(slice.start, slice.end, 105, 82)} fill={slice.color} stroke="#10131a" strokeWidth="2" />)}
          <circle cx="105" cy="105" r="52" fill="#11151e" />
          <text x="105" y="101" textAnchor="middle" className="donut-total">{formatChartValue(total)}</text>
          <text x="105" y="119" textAnchor="middle" className="donut-caption">TOTAL</text>
        </svg>
        <div className="report-legend">{slices.map((slice) => <div className="report-legend-item" key={slice.label}><i style={{ background: slice.color }} /><span>{slice.label}</span><b>{formatChartValue(slice.value)}</b></div>)}</div>
      </div>
    );
  }

  return <AggregateDonutChart data={data} />;
}

function AggregateDonutChart({ data }: { data: AggregateChartData }) {
  const [hiddenLabels, setHiddenLabels] = useState<string[]>([]);
  const isLabelVisible = (label: string) => !hiddenLabels.includes(label);
  const toggleLabel = (label: string) => {
    setHiddenLabels((hidden) => hidden.includes(label) ? hidden.filter((name) => name !== label) : [...hidden, label]);
  };

  return (
    <div className="report-donut-multiples">
      {data.metrics.map((metric) => {
        const allSlices = data.points.filter((point) => point.metric === metric);
        const slices = allSlices.filter((slice) => isLabelVisible(slice.label));
        const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
        const angleTotal = total || 1;
        let start = 0;
        const metricSlices = slices.map((slice) => {
          const angle = (Math.max(0, slice.value) / angleTotal) * Math.PI * 2;
          const color = chartColors[((allSlices.indexOf(slice) + (data.seriesColorIndex ?? 0)) % chartColors.length)];
          const item = { ...slice, start, end: start + angle, color };
          start += angle;
          return item;
        });

        return <section className="report-donut-metric" key={metric} aria-label={`${metric} distribution`}>
          <strong>{metric}</strong>
          <div className="report-donut-layout">
            <svg viewBox="0 0 160 160" role="img" aria-label={`${metric} distribution donut chart`}>
              {metricSlices.map((slice, index) => <path key={`${slice.label}-${index}`} d={arcPath(slice.start, slice.end, 80, 66)} fill={slice.color} stroke="#10131a" strokeWidth="2" />)}
              <circle cx="80" cy="80" r="42" fill="#11151e" />
              <text x="80" y="77" textAnchor="middle" className="donut-total">{formatChartValue(total)}</text>
              <text x="80" y="95" textAnchor="middle" className="donut-caption">TOTAL</text>
            </svg>
            <div className="report-legend">{allSlices.map((slice, index) => <div className="report-legend-item" key={`${slice.label}-${index}`}>
              <button className="report-legend-toggle" type="button" aria-label={`Toggle ${slice.label}`} aria-pressed={isLabelVisible(slice.label)} style={{ color: chartColors[(index + (data.seriesColorIndex ?? 0)) % chartColors.length] }} onClick={() => toggleLabel(slice.label)} />
              <span>{slice.label}</span>
              <b>{formatChartValue(slice.value)}</b>
            </div>)}</div>
          </div>
        </section>;
      })}
    </div>
  );
}
