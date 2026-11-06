export type ChartPoint = { label: string; value: number; xValue: number };

export type AggregateChartPoint = ChartPoint & {
  series: string;
  metric: string;
  rowIndex: number;
  breakdownField?: string;
  breakdownLabel?: string;
};

export type SimpleChartData = {
  kind: "simple";
  points: ChartPoint[];
};

export type AggregateChartData = {
  kind: "aggregate";
  metrics: string[];
  points: AggregateChartPoint[];
  categories: string[];
  seriesNames: string[];
  seriesColorIndex?: number;
  showSeriesLegend?: boolean;
  showBreakdownLegend?: boolean;
  breakdownDisplay?: "subcharts" | "direct";
  breakdowns?: Record<string, AggregateChartData>;
};

export type ChartData = SimpleChartData | AggregateChartData;
