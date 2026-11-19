import { useEffect, useState, type ReactNode } from "react";
import { adminAnalyticsService, datesForDays, rangeForDates, toCsv, validateDates, type AnalyticsDailyStat, type AnalyticsPageStat, type AnalyticsSummary, type AnalyticsUrlStat } from "../../services/admin-analytics-service";
import "./admin-analytics.css";

const TOKEN_KEY = "oquery.admin.token";
// "To date" covers the 365-day retention window; the API caps ranges at 366 days.
const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "To date", days: 366 },
] as const;

type Data = {
  summary: AnalyticsSummary;
  urls: AnalyticsUrlStat[];
  pages: AnalyticsPageStat[];
};

// Keeps the token for this browser tab only (sessionStorage), so it is not persisted across sessions.
function readToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}

function writeToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignored: the admin page still works for this render */ }
}

export default function AdminAnalytics() {
  const [token, setToken] = useState(readToken);
  const [tokenInput, setTokenInput] = useState("");
  const initial = datesForDays(30);
  const [fromDay, setFromDay] = useState(initial.fromDay);
  const [toDay, setToDay] = useState(initial.toDay);
  const [activePreset, setActivePreset] = useState<number | null>(30);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [activeUrlTab, setActiveUrlTab] = useState<"api" | "frontend">("api");
  const [urlFilter, setUrlFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dateError = validateDates(fromDay, toDay);

  useEffect(() => {
    if (!token || validateDates(fromDay, toDay)) return;
    let active = true;
    setLoading(true);
    setError("");
    const range = rangeForDates(fromDay, toDay);
    Promise.all([
      adminAnalyticsService.summary(token, range),
      adminAnalyticsService.urls(token, range),
      adminAnalyticsService.pages(token, range),
    ])
      .then(([summary, urls, pages]) => {
        if (active) setData({ summary, urls, pages });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load analytics.";
        // The API returns 401 for a wrong token and 404 when ADMIN_TOKEN is not configured on the server.
        if (message.includes("(401)")) {
          writeToken("");
          setToken("");
          setError("The admin token was rejected.");
        } else if (message.includes("(404)") || message.includes("Not Found")) {
          writeToken("");
          setToken("");
          setError("Admin analytics is not configured on the server. Set the ADMIN_TOKEN environment variable and restart the API.");
        } else {
          setError(message);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, fromDay, toDay, reloadKey]);

  if (!token) {
    return (
      <section className="admin-analytics admin-analytics-login">
        <div className="admin-analytics-login-card">
          <span className="admin-analytics-eyebrow">ADMIN CONSOLE</span>
          <h1>Analytics</h1>
          <p>Review API activity, usage trends, and the most requested routes.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const value = tokenInput.trim();
          if (!value) return;
          writeToken(value);
          setToken(value);
          setTokenInput("");
        }}>
          <label>
            Admin token
            <input type="password" autoComplete="off" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} />
          </label>
          <button type="submit">Open analytics</button>
        </form>
        {error && <p className="admin-analytics-error" role="alert">{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="admin-analytics">
      <header className="admin-analytics-header">
        <div className="admin-analytics-heading">
          <span className="admin-analytics-eyebrow">ADMIN CONSOLE</span>
          <h1>Analytics overview</h1>
          <p>Monitor API usage and understand which routes your visitors rely on.</p>
        </div>
        <div className="admin-analytics-controls">
          <div role="group" aria-label="Date range">
            {PRESETS.map((preset) => (
              <button key={preset.days} type="button" aria-pressed={activePreset === preset.days} onClick={() => {
                const dates = datesForDays(preset.days);
                setActivePreset(preset.days);
                setFromDay(dates.fromDay);
                setToDay(dates.toDay);
              }}>
                {preset.label}
              </button>
            ))}
          </div>
          <label className="admin-analytics-date">
            From
            <input type="date" value={fromDay} onChange={(event) => { setActivePreset(null); setFromDay(event.target.value); }} />
          </label>
          <label className="admin-analytics-date">
            To
            <input type="date" value={toDay} onChange={(event) => { setActivePreset(null); setToDay(event.target.value); }} />
          </label>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}>Reload</button>
          <button type="button" onClick={() => { writeToken(""); setToken(""); setData(null); }}>Sign out</button>
        </div>
      </header>

      {dateError && <p className="admin-analytics-error" role="alert">{dateError}</p>}
      {error && <p className="admin-analytics-error" role="alert">{error}</p>}
      {loading && <p className="admin-analytics-status" role="status">Refreshing analytics…</p>}

      {data && (
        <>
          <div className="admin-analytics-range">
            <span className="admin-analytics-range-dot" />
            <span>Showing <strong>{fromDay}</strong> to <strong>{toDay}</strong> UTC</span>
            <span className="admin-analytics-range-note">Updated about every minute</span>
          </div>
          <div className="admin-analytics-cards">
            <Card label="New visitors" value={sumDays(data.summary.days, "newUsers").toLocaleString()} />
            <Card label="Returning visitors" value={sumDays(data.summary.days, "returningUsers").toLocaleString()} />
            <Card label="Total visitors" value={data.summary.totalVisitors.toLocaleString()} />
          </div>

          <Table title="Daily usage (UTC)" empty="No requests in this range." rows={data.summary.days} onDownload={() => downloadCsv(`analytics-daily-${fromDay}-${toDay}.csv`, toCsv(
            ["Day", "New visitors", "Returning visitors", "Total requests"],
            data.summary.days.map((row) => [row.day, row.newUsers, row.returningUsers, row.totalVisits]),
          ))} columns={[
            { head: "Day", cell: (row) => row.day },
            { head: "New visitors", cell: (row) => row.newUsers.toLocaleString() },
            { head: "Returning visitors", cell: (row) => row.returningUsers.toLocaleString() },
            { head: "Total requests", cell: (row) => row.totalVisits.toLocaleString() },
          ]} />

          <section className="admin-analytics-table admin-analytics-url-reports">
            <div className="admin-analytics-tab-toolbar">
              <div className="admin-analytics-tabs" role="tablist" aria-label="URL reports">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeUrlTab === "api"}
                  aria-controls="api-url-report"
                  id="api-url-tab"
                  onClick={() => setActiveUrlTab("api")}
                >
                  API URL
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeUrlTab === "frontend"}
                  aria-controls="frontend-url-report"
                  id="frontend-url-tab"
                  onClick={() => setActiveUrlTab("frontend")}
                >
                  Frontend URL
                </button>
              </div>
              <label className="admin-analytics-url-filter">
                Filter
                <input
                  type="search"
                  value={urlFilter}
                  onChange={(event) => setUrlFilter(event.target.value)}
                  placeholder="Search URL"
                  aria-label="Filter URL report"
                />
              </label>
            </div>
            {activeUrlTab === "api" ? (
              <div role="tabpanel" id="api-url-report" aria-labelledby="api-url-tab">
                <Table title="Requests per API URL" empty={urlFilter ? "No matching API URLs." : "No requests in this range."} rows={filterRows(data.urls, urlFilter, (row) => row.url)} onDownload={() => downloadCsv(`analytics-api-urls-${fromDay}-${toDay}.csv`, toCsv(
                  ["API URL", "Requests"],
                  filterRows(data.urls, urlFilter, (row) => row.url).map((row) => [row.url, row.requests]),
                ))} columns={[
                  { head: "API URL", cell: (row) => <code>{row.url}</code> },
                  { head: "Requests", cell: (row) => row.requests.toLocaleString() },
                ]} />
              </div>
            ) : (
              <div role="tabpanel" id="frontend-url-report" aria-labelledby="frontend-url-tab">
                <Table title="Requests per frontend page" empty={urlFilter ? "No matching frontend URLs." : "No requests in this range."} rows={filterRows(data.pages, urlFilter, (row) => row.page)} onDownload={() => downloadCsv(`analytics-frontend-pages-${fromDay}-${toDay}.csv`, toCsv(
                  ["Frontend URL", "Requests"],
                  filterRows(data.pages, urlFilter, (row) => row.page).map((row) => [row.page, row.requests]),
                ))} columns={[
                  { head: "Frontend URL", cell: (row) => <code>{row.page}</code> },
                  { head: "Requests", cell: (row) => row.requests.toLocaleString() },
                ]} />
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

// Builds the CSV in the browser from data already shown, so it needs no extra API call.
function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function sumDays(days: AnalyticsDailyStat[], key: "newUsers" | "returningUsers" | "totalVisits"): number {
  return days.reduce((total, day) => total + day[key], 0);
}

function filterRows<T>(rows: T[], filter: string, value: (row: T) => string): T[] {
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  if (!normalizedFilter) return rows;
  return rows.filter((row) => value(row).toLocaleLowerCase().includes(normalizedFilter));
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-analytics-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type Column<T> = { head: string; cell: (row: T) => ReactNode };

function Table<T>({ title, empty, rows, columns, onDownload }: { title: string; empty: string; rows: T[]; columns: Column<T>[]; onDownload: () => void }) {
  return (
    <section className="admin-analytics-table">
      <div className="admin-analytics-table-header">
        <h2>{title}</h2>
        <button type="button" onClick={onDownload} disabled={rows.length === 0}>Download CSV</button>
      </div>
      {rows.length === 0 ? <p className="admin-analytics-muted">{empty}</p> : (
        <table>
          <thead><tr>{columns.map((column) => <th key={column.head}>{column.head}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>{columns.map((column) => <td key={column.head}>{column.cell(row)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
