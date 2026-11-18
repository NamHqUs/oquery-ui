import { useEffect, useState, type ReactNode } from "react";
import { adminAnalyticsService, rangeForDays, type AnalyticsPageStat, type AnalyticsSourceStat, type AnalyticsSummary, type AnalyticsVisitorStat } from "../../services/admin-analytics-service";
import "./admin-analytics.css";

const TOKEN_KEY = "oquery.admin.token";
const RANGE_OPTIONS = [7, 30, 90] as const;

type Data = {
  summary: AnalyticsSummary;
  pages: AnalyticsPageStat[];
  visitors: AnalyticsVisitorStat[];
  sources: AnalyticsSourceStat[];
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

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

export default function AdminAnalytics() {
  const [token, setToken] = useState(readToken);
  const [tokenInput, setTokenInput] = useState("");
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError("");
    const range = rangeForDays(days);
    Promise.all([
      adminAnalyticsService.summary(token, range),
      adminAnalyticsService.pages(token, range),
      adminAnalyticsService.visitors(token, range),
      adminAnalyticsService.sources(token, range),
    ])
      .then(([summary, pages, visitors, sources]) => {
        if (active) setData({ summary, pages, visitors, sources });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load analytics.";
        // The API returns 401 for a wrong token and 404 when ADMIN_TOKEN is not configured on the server.
        if (message.includes("(401)")) {
          writeToken("");
          setToken("");
          setError("The admin token was rejected.");
        } else {
          setError(message);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, days]);

  if (!token) {
    return (
      <section className="admin-analytics admin-analytics-login">
        <h1>Analytics</h1>
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
      </section>
    );
  }

  return (
    <section className="admin-analytics">
      <header className="admin-analytics-header">
        <h1>Analytics</h1>
        <div className="admin-analytics-controls">
          <div role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((option) => (
              <button key={option} type="button" aria-pressed={days === option} onClick={() => setDays(option)}>
                {option} days
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { writeToken(""); setToken(""); setData(null); }}>Sign out</button>
        </div>
      </header>

      {error && <p className="admin-analytics-error" role="alert">{error}</p>}
      {loading && <p className="admin-analytics-muted">Loading…</p>}

      {data && (
        <>
          <div className="admin-analytics-cards">
            <Card label="Visitors" value={data.summary.visitors.toLocaleString()} />
            <Card label="Visits (sections)" value={data.summary.sections.toLocaleString()} />
            <Card label="Page views" value={data.summary.pageViews.toLocaleString()} />
            <Card label="Avg. visit length" value={formatSeconds(data.summary.averageSectionSeconds)} />
            <Card label="Visits per visitor" value={data.summary.sectionsPerVisitor.toFixed(2)} />
          </div>

          <Table title="Most visited pages" empty="No page views in this range." rows={data.pages} columns={[
            { head: "Page", cell: (row: AnalyticsPageStat) => row.page },
            { head: "Views", cell: (row: AnalyticsPageStat) => row.views },
            { head: "Visits", cell: (row: AnalyticsPageStat) => row.uniqueSections },
            { head: "Avg. time", cell: (row: AnalyticsPageStat) => formatSeconds(row.averageSeconds) },
            { head: "Total time", cell: (row: AnalyticsPageStat) => formatSeconds(row.totalSeconds) },
          ]} />

          <Table title="Frequent visitors" empty="No visitors in this range." rows={data.visitors} columns={[
            { head: "Visitor", cell: (row: AnalyticsVisitorStat) => <code title={row.visitorId}>{row.visitorId.slice(0, 8)}</code> },
            { head: "Visits", cell: (row: AnalyticsVisitorStat) => row.sections },
            { head: "Total time", cell: (row: AnalyticsVisitorStat) => formatSeconds(row.totalSeconds) },
            { head: "Last seen", cell: (row: AnalyticsVisitorStat) => ago(row.lastSeenAt) },
          ]} />

          <Table title="Where visitors come from" empty="No traffic sources in this range." rows={data.sources} columns={[
            { head: "Referrer", cell: (row: AnalyticsSourceStat) => row.referrerHost ?? "Direct" },
            { head: "UTM source", cell: (row: AnalyticsSourceStat) => row.utmSource ?? "—" },
            { head: "UTM campaign", cell: (row: AnalyticsSourceStat) => row.utmCampaign ?? "—" },
            { head: "Visits", cell: (row: AnalyticsSourceStat) => row.sections },
          ]} />
        </>
      )}
    </section>
  );
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

function Table<T>({ title, empty, rows, columns }: { title: string; empty: string; rows: T[]; columns: Column<T>[] }) {
  return (
    <section className="admin-analytics-table">
      <h2>{title}</h2>
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
