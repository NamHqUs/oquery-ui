import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AnalyticsRange = { from: string; to: string };
export type AnalyticsDailyStat = { day: string; newUsers: number; returningUsers: number; totalVisits: number };
export type AnalyticsSummary = { days: AnalyticsDailyStat[] };
export type AnalyticsUrlStat = { url: string; page: string; requests: number };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Inclusive UTC day bounds for the last N days, ending today (UTC).
export function datesForDays(days: number, now: Date = new Date()): { fromDay: string; toDay: string } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { fromDay: isoDate(new Date(today - (days - 1) * DAY_MS)), toDay: isoDate(new Date(today)) };
}

export const MAX_RANGE_DAYS = 366;

// Converts an inclusive [fromDay, toDay] pair (YYYY-MM-DD) into the API's half-open range.
export function rangeForDates(fromDay: string, toDay: string): AnalyticsRange {
  const to = new Date(`${toDay}T00:00:00Z`);
  return { from: fromDay, to: isoDate(new Date(to.getTime() + DAY_MS)) };
}

// Returns an error message for an invalid inclusive range, or null when it is valid.
export function validateDates(fromDay: string, toDay: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) return "Choose both dates.";
  if (fromDay > toDay) return "'From' must be on or before 'To'.";
  const span = (new Date(`${toDay}T00:00:00Z`).getTime() - new Date(`${fromDay}T00:00:00Z`).getTime()) / DAY_MS + 1;
  if (span > MAX_RANGE_DAYS) return `The range may not exceed ${MAX_RANGE_DAYS} days.`;
  return null;
}

// Quotes a cell when needed (comma, quote, newline) and doubles embedded quotes (RFC 4180).
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// A 401 means the admin token was rejected.
async function getAdmin<T>(url: string, token: string, range: AnalyticsRange, limit?: number): Promise<T> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  if (limit) query.set("limit", String(limit));
  return requestJson<T>(`${url}?${query.toString()}`, { headers: { "X-Admin-Token": token } });
}

export const adminAnalyticsService = {
  summary: (token: string, range: AnalyticsRange) => getAdmin<AnalyticsSummary>(apiUrls.analytics.adminSummary, token, range),
  urls: (token: string, range: AnalyticsRange, limit = 50) => getAdmin<AnalyticsUrlStat[]>(apiUrls.analytics.adminUrls, token, range, limit),
};
