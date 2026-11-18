import { useEffect, useState, type ReactNode } from "react";
import { adminAnalyticsService, datesForDays, rangeForDates, toCsv, validateDates, type AnalyticsDailyStat, type AnalyticsSummary, type AnalyticsUrlStat } from "../../services/admin-analytics-service";
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
    ])
      .then(([summary, urls]) => {
        if (active) setData({ summary, urls });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load analytics.";
        // The API returns 401 for a wrong token and 404 when ADMIN_TOKEN is not configured on the server.
        if (message.includes("(401)")) {
          writeToken("");
          setToken("");
          setError("The admin token was rejected.");
        } else if (message.includes("(404)")) {
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
          <p>Monitor API usage and understand which routes your users rely on.</p>
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
            <Card label="New users" value={sumDays(data.summary.days, "newUsers").toLocaleString()} />
            <Card label="Returning users" value={sumDays(data.summary.days, "returningUsers").toLocaleString()} />
            <Card label="Total visits" value={sumDays(data.summary.days, "totalVisits").toLocaleString()} />
          </div>

          <Table title="Daily usage (UTC)" empty="No requests in this range." rows={data.summary.days} onDownload={() => downloadCsv(`analytics-daily-${fromDay}-${toDay}.csv`, toCsv(
            ["Day", "New users", "Returning users", "Total visits"],
            data.summary.days.map((row) => [row.day, row.newUsers, row.returningUsers, row.totalVisits]),
          ))} columns={[
            { head: "Day", cell: (row) => row.day },
            { head: "New users", cell: (row) => row.newUsers.toLocaleString() },
            { head: "Returning users", cell: (row) => row.returningUsers.toLocaleString() },
            { head: "Total visits", cell: (row) => row.totalVisits.toLocaleString() },
          ]} />

          <Table title="Requests per URL" empty="No requests in this range." rows={data.urls} onDownload={() => downloadCsv(`analytics-urls-${fromDay}-${toDay}.csv`, toCsv(
            ["API URL", "Frontend URL", "Requests"],
            data.urls.map((row) => [row.url, row.page, row.requests]),
          ))} columns={[
            { head: "API URL", cell: (row) => <code>{row.url}</code> },
            { head: "Frontend URL", cell: (row) => row.page ? <code>{row.page}</code> : <span className="admin-analytics-muted">—</span> },
            { head: "Requests", cell: (row) => row.requests.toLocaleString() },
          ]} />
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
