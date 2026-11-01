import {
  normalizeApiProjectionDefinition,
  type ReportDto,
} from "../query-builder/query-design/query-builder-slice";
import type { IFieldDefinition, QueryResult } from "../query-builder/query-design/query-builder-slice";
import type { IconName } from "../icon/icon";

export type ChartType = "line" | "bar" | "donut" | "funnel" | "scatter";
export type ReportAxis = "axis1" | "axis2" | "none";
export type ReportChartSettings = {
  metrics: string[];
  axes: Record<string, ReportAxis>;
  breakdownDisplay?: "subcharts" | "direct";
  seriesLayout?: "combined" | "separate";
};
export type ReportLayout = {
  chartType: ChartType;
  chartSettings?: ReportChartSettings;
};
export type MetricRollup = "sum" | "min" | "max" | "unsupported";
export type ReportPresentation = {
  description: string;
  chartType: ChartType;
  category: string;
  metric?: string;
  groupBy?: string;
  xMetric?: string;
};

export const builtinPresentations: Record<number, ReportPresentation> = {
  1: { description: "Follow monthly revenue alongside invoice volume to spot growth and seasonal shifts.", chartType: "line", category: "Revenue", metric: "Revenue" },
  2: { description: "Compare revenue across customer segments and regions to reveal where sales concentrate.", chartType: "bar", category: "Revenue", metric: "Revenue" },
  3: { description: "Rank your most valuable customers by cumulative paid lifetime spend.", chartType: "bar", category: "Customers", metric: "LifetimeValue" },
  4: { description: "Compare product sales value, with units sold available in the underlying query.", chartType: "bar", category: "Products", metric: "Revenue" },
  5: { description: "Rank products by gross profit; the query also includes each product’s margin percentage.", chartType: "bar", category: "Products", metric: "GrossProfit" },
  6: { description: "Review open invoice balances alongside days overdue to prioritize collection activity.", chartType: "bar", category: "Finance", metric: "TotalAmount" },
  7: { description: "Compare average days to payment by payment method and see amounts collected.", chartType: "bar", category: "Finance", metric: "AverageDaysToPay" },
  8: { description: "See how revenue and average order value are divided across your sales channels.", chartType: "donut", category: "Revenue", metric: "Revenue" },
  9: { description: "Rank product pairs by how often they appear together on paid invoices.", chartType: "bar", category: "Products", metric: "OrdersTogether" },
  10: { description: "Find customers with multiple paid purchases and compare order counts and last-order dates.", chartType: "bar", category: "Customers", metric: "OrderCount" },
  11: { description: "Explore customers with paid orders by segment; the result is a customer list, not an aggregate.", chartType: "donut", category: "Customers", groupBy: "Segment" },
  12: { description: "Surface products at or below reorder levels and compare their estimated inventory cost.", chartType: "bar", category: "Inventory", metric: "InventoryCost" },
  13: { description: "Track the monthly discount rate against net revenue to understand discount impact.", chartType: "line", category: "Revenue", metric: "DiscountRate" },
  14: { description: "Compare paid order revenue by weekday to reveal the strongest sales days.", chartType: "bar", category: "Revenue", metric: "Revenue" },
  15: { description: "Compare invoice counts at each status, with pipeline value available in the result.", chartType: "funnel", category: "Finance", metric: "InvoiceCount" },
  16: { description: "Compare each invoice’s units with its total value to see how basket size relates to spend.", chartType: "scatter", category: "Products", metric: "TotalAmount", xMetric: "Units" },
  17: { description: "Compare category revenue; gross profit is included for a profitability cross-check.", chartType: "bar", category: "Products", metric: "Revenue" },
  18: { description: "Follow paid monthly revenue over time; the current query provides the monthly series.", chartType: "line", category: "Revenue", metric: "Revenue" },
  19: { description: "Explore customer frequency against monetary value, with last purchase available for recency.", chartType: "scatter", category: "Customers", metric: "MonetaryValue", xMetric: "Frequency" },
  20: { description: "Rank customers by unpaid invoice exposure, alongside open counts and the oldest due date.", chartType: "bar", category: "Finance", metric: "AmountDue" },
};

export const chartOptions: { value: ChartType; label: string; icon: IconName }[] = [
  { value: "line", label: "Trend line", icon: "chart-line" },
  { value: "bar", label: "Bar chart", icon: "chart-bar" },
  { value: "donut", label: "Donut chart", icon: "chart-donut" },
  { value: "funnel", label: "Funnel", icon: "chart-funnel" },
  { value: "scatter", label: "Scatter plot", icon: "chart-scatter" },
];

function isAggregateExpression(expression: IFieldDefinition): boolean {
  if (expression.kind === "function") {
    return ["count", "sum", "max", "min", "average", "avg"].includes(expression.function.toLowerCase())
      || expression.arguments.some(isAggregateExpression);
  }
  if (expression.kind === "group") {
    return expression.arguments.some(isAggregateExpression);
  }
  return false;
}

function metricRollup(expression: IFieldDefinition): MetricRollup {
  if (expression.kind !== "function" || expression.arguments.some(isAggregateExpression)) return "unsupported";
  switch (expression.function.toLowerCase()) {
    case "count":
    case "sum":
      return "sum";
    case "min":
      return "min";
    case "max":
      return "max";
    default:
      return "unsupported";
  }
}

function expressionName(expression: IFieldDefinition, includeOperator = true): string {
  let name: string;
  switch (expression.kind) {
    case "field":
      name = expression.field;
      break;
    case "value":
      name = String(expression.value);
      break;
    case "function":
      name = `${expression.function}(${expression.arguments.map(expressionName).join(", ")})`;
      break;
    case "group":
      name = expression.arguments.map((argument, index) => index === 0
        ? expressionName(argument, false)
        : `${argument.oper ?? "+"} ${expressionName(argument, false)}`).join(" ");
      break;
  }
  return includeOperator && expression.oper && expression.oper !== "+"
    ? `${expression.oper} ${name}`
    : name;
}

function outputColumn(columns: string[], candidates: string[]): string | null {
  const normalizedColumns = columns.map((column) => column.toLowerCase());
  for (const candidate of candidates.filter(Boolean)) {
    const matchIndex = normalizedColumns.indexOf(candidate.toLowerCase());
    if (matchIndex >= 0) return columns[matchIndex];
  }
  for (const candidate of candidates.filter(Boolean)) {
    const leafName = candidate.split(".").at(-1)?.toLowerCase();
    const matchIndex = leafName ? normalizedColumns.indexOf(leafName) : -1;
    if (matchIndex >= 0) return columns[matchIndex];
  }
  return null;
}

export function reportChartFields(report: ReportDto, result: QueryResult): {
  metrics: string[];
  axes: string[];
  metricRollups: Record<string, MetricRollup>;
} {
  const metrics: string[] = [];
  const axes: string[] = [];
  const metricRollups: Record<string, MetricRollup> = {};
  report.query.projection.forEach((projection) => {
    const expression = normalizeApiProjectionDefinition(projection);
    if (!expression) throw new Error("Report API returned an unsupported projection expression.");
    const name = outputColumn(result.columns, [
      projection.alias || "",
      expressionName(expression),
      expression.kind === "field" ? expression.field : "",
    ]);
    if (!name) return;
    const target = isAggregateExpression(expression) ? metrics : axes;
    if (!target.includes(name)) target.push(name);
    if (target === metrics) metricRollups[name] = metricRollup(expression);
  });
  return { metrics, axes, metricRollups };
}

export function defaultReportChartSettings(report: ReportDto, result: QueryResult): ReportChartSettings {
  const fields = reportChartFields(report, result);
  return {
    metrics: fields.metrics,
    axes: Object.fromEntries(fields.axes.map((field) => [field, "axis1"])),
  };
}

export function reportTitle(request: ReportDto): string {
  return request.name || request.fileName.replace(/\.(json|yml)$/i, "");
}

export function categoryTone(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized.includes("revenue") || normalized.includes("sales")) return "revenue";
  if (normalized.includes("customer") || normalized.includes("account")) return "customer";
  if (normalized.includes("product") || normalized.includes("inventory")) return "product";
  if (normalized.includes("finance") || normalized.includes("profit")) return "finance";
  if (normalized.includes("pipeline") || normalized.includes("lead")) return "pipeline";
  return "custom";
}

export function presentationFor(request: ReportDto): ReportPresentation {
  const match = request.fileName.match(/^(\d{2})-builtin-(?:report|query-request)\.yml$/i);
  const index = match ? Number(match[1]) : null;
  if (index && builtinPresentations[index]) return builtinPresentations[index];
  const chartType = chartOptions.some((option) => option.value === request.chartType)
    ? request.chartType as ChartType
    : "bar";
  return {
    description: request.description || "A saved analysis from your DynamicSQL workspace.",
    chartType,
    category: "Custom",
  };
}
