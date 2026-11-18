import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";

export type AnalyticsRange = { from: string; to: string };

export type AnalyticsSummary = {
  visitors: number;
  sections: number;
  pageViews: number;
  averageSectionSeconds: number;
  sectionsPerVisitor: number;
};

export type AnalyticsPageStat = { page: string; views: number; uniqueSections: number; averageSeconds: number; totalSeconds: number };
export type AnalyticsVisitorStat = { visitorId: string; sections: number; totalSeconds: number; lastSeenAt: string };
export type AnalyticsSourceStat = { referrerHost: string | null; utmSource: string | null; utmCampaign: string | null; sections: number };

export function rangeForDays(days: number, now: Date = new Date()): AnalyticsRange {
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  };
}

// Admin requests use the token from the admin page. A 401 means the token was rejected.
async function getAdmin<T>(url: string, token: string, range: AnalyticsRange, limit?: number): Promise<T> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  if (limit) query.set("limit", String(limit));
  return requestJson<T>(`${url}?${query.toString()}`, { headers: { "X-Admin-Token": token } });
}

export const adminAnalyticsService = {
  summary: (token: string, range: AnalyticsRange) => getAdmin<AnalyticsSummary>(apiUrls.analytics.adminSummary, token, range),
  pages: (token: string, range: AnalyticsRange, limit = 20) => getAdmin<AnalyticsPageStat[]>(apiUrls.analytics.adminPages, token, range, limit),
  visitors: (token: string, range: AnalyticsRange, limit = 20) => getAdmin<AnalyticsVisitorStat[]>(apiUrls.analytics.adminVisitors, token, range, limit),
  sources: (token: string, range: AnalyticsRange, limit = 20) => getAdmin<AnalyticsSourceStat[]>(apiUrls.analytics.adminSources, token, range, limit),
};
