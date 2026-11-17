export const chartColors = ["#a78bfa", "#58d5b1", "#63a7f8", "#f5b85c", "#ee7e9d", "#6fd0dc", "#c68bfa", "#8dd16f"];

export function niceChartStep(value: number, tickCount = 5): number {
  const safeValue = Math.max(value, 1);
  const roughStep = safeValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function niceChartMax(value: number, tickCount = 5): number {
  const step = niceChartStep(value, tickCount);
  return Math.ceil(Math.max(value, 1) / step) * step;
}

export function formatChartValue(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
