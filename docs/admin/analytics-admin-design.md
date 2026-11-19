# Admin Analytics and Builtin Data Management (design)

Status: analytics implemented as a daily rollup (new users, returning users, visits, per-URL totals). No privacy notice. Builtin CRUD is deferred.

## 1. Goals

1. **Analytics (admin view)**
   - Per day: new visitors, returning visitors, and total requests; the overview also reports total visitors.
   - Total requests per URL route template.
2. **Builtin data management (admin)**: create, update, and delete builtin saved queries and domains, with an audit log.
3. **Reliability and feature signals** for future upgrades: API errors, feature usage, and funnel steps.

## 2. Decisions

| Topic | Decision |
|---|---|
| Storage for analytics and builtin data | Neon Postgres (free tier, no expiry) |
| Admin access | Shared token in the `ADMIN_TOKEN` environment variable, sent as `X-Admin-Token`. If unset, all `/admin/*` endpoints return 404 (fail closed). |
| Section identity (persistent) | Server-issued GUID (GUIDv7) stored in a first-party cookie `oquery_uid`. The cookie is HttpOnly, `SameSite=Lax`, `Path=/`, and lasts 400 days (the browser maximum). The server reads it on every request and uses it as the saved-data partition key. If the cookie is missing or invalid, the server creates a new ID and sets the cookie. An existing valid ID is never replaced. No IP, User-Agent, or login is used. Clearing cookies or switching browsers creates a new section. The browser does not store the ID in `localStorage` or send it in a header. |
| Browser state | The browser holds only the `oquery_uid` cookie (HttpOnly, so scripts cannot read it). No page, time, referrer, or UTM data is kept in the browser or sent by the browser. |
| Usage capture | Server-side only and opt-in. Each routed API request is counted with the section ID from the cookie only when the frontend sends analytics consent. The `url` value is the ASP.NET Core route template (for example `/metadata/domains/{id}`), not the raw path, so IDs do not create separate rows. Capture uses ASP.NET Core request middleware after routing. |
| Usage storage | Counts are kept in memory and flushed to Postgres every 60 seconds (upsert, `count = count + excluded.count`). The in-memory map is capped; excess keys are dropped and logged. In the `analytic` schema, `visitors` stores the user ID and first-seen day, `daily_visitors` stores day/user visits, `daily_backend` stores day/URL counts, and `daily_frontend` stores the same counts split by frontend page. The URL tables have no user column. |
| Usage questions | Per day: new visitors (first seen that day), returning visitors (seen that day, first seen earlier), and total requests. Total visitors is the count of rows in `analytic.visitors`. Per URL: total requests per route template for the range, not tied to any visitor ID. |
| IP address | Not stored. Country comes from a geo header only if the host provides one; otherwise it is left empty. |
| Query text and results | Not stored. Only the route template, method, status-independent counts, and times are recorded. |
| Privacy notice and consent | The footer links to the Privacy Notice and Terms of Service. A first-use notice explains the essential `oquery_uid` section cookie and optional analytics. Analytics is collected only after an explicit opt-in; users can decline or change the choice later. |
| Retention | Daily rows are kept for 365 days. Pruning runs when the analytics store initializes. |
| Scope | Analytics only for this step. Builtin CRUD (phase 6) is deferred. |
| Routes | Admin API lives under `/analytics/admin/*`. There is no public ingest endpoint; the browser sends nothing for analytics. The admin page is the SPA route `/admin`, kept as a read-only summary of the daily rollup. |
| Config | Connection string: `ConnectionStrings__Analytics` (empty disables analytics). Admin token: `ADMIN_TOKEN`. Both are Render environment variables. |

Deferred with builtin CRUD: builtin saved queries and domains moving from files to Postgres, so admin edits survive redeploys.

Scope for this step: server-side daily rollup only. No browser ingest, referrer, duration, or page-to-page navigation data is collected.

## 3. Current state to change

- `IUserSectionManager` (`src/OQuery.UI.Api/Application/Middlewares/UserSectionManager.cs`) was a stub that always returned `"123"`, so all users shared one user-data folder. It now reads the `oquery_uid` cookie (see section 2), issuing a new one when it is missing. The cookie is sent automatically by the browser on same-origin requests, so saved queries, domains, and function definitions keep the same partition key across requests.
- Builtin data is read-only and file-based. The consumer loads it from `OQuery:Seeds:BasePath` through `BuiltinDataLoader` (SetupTests) and passes it to the repositories. Admin edits never write built-in data. User-created data is saved by the active provider (File or Postgres) and Render discards file writes on redeploy.
- Repositories are chosen in `OQuery.UI.Api/Program.cs`: `FileRepositoryProvider` by default, or `PostgresRepositoryProvider` when `OQuery:Repositories:Postgres:ConnectionString` is set. Built-in domains and queries are passed to the provider constructor and held in memory. `builder.Services.AddRepositoryProvider(provider)` registers the Domain, Query, and Function repositories. Postgres stores user rows only. Function definitions are not stored in Postgres. Storage.Postgres does not reference Storage.Files.
- Postgres mode needs `OQuery:Repositories:Postgres:ConnectionString` (for example via the `OQuery__Repositories__Postgres__ConnectionString` environment variable on Render). Do not commit the connection string.
- Postgres mode currently covers domains and saved queries. Metadata, function definitions, and operator definitions stay file-based.

## 4. Data model (Postgres)

Analytics tables live in the `analytic` schema (without an `analytics_` table-name prefix). Refreshed by the 60-second flush; never read in real time.

```sql
-- First day each user ID was seen. Never pruned, so "new" stays correct after the daily rows expire.
create schema analytic;

create table analytic.visitors (
  user_id          uuid primary key,
  first_seen_day   date not null
);

-- One row per user per UTC day. Used only to count distinct users; no user column is exposed by the API.
create table analytic.daily_visitors (
  day     date   not null,
  user_id uuid   not null,
  visits  bigint not null,
  primary key (day, user_id)
);

-- Global per-API-URL totals per UTC day (route template, not raw path). No user dimension.
create table analytic.daily_backend (
  day   date   not null,
  url   text   not null,
  count bigint not null,
  primary key (day, url)
);

-- Per-URL totals split by the frontend page that sent the request (X-Client-Page header).
-- Path only: the query string is never stored. No user dimension.
create table analytic.daily_frontend (
  day   date   not null,
  page  text   not null,
  url   text   not null,
  count bigint not null,
  primary key (day, page, url)
);
```

Daily stats for day D:
- New visitors = visitors whose `first_seen_day = D`.
- Returning visitors = visitors with a row for D whose `first_seen_day < D`.
- Total visitors = count of rows in `analytic.visitors`.
- Total requests = sum of `visits` for D.

Rows older than 365 days are pruned from `analytic.daily_visitors` and `analytic.daily_backend`. `analytic.visitors` is kept, so a returning user is not counted as new after pruning. `analytic.daily_frontend` follows the same retention rule.

Existing databases created with the old names (`analytics_users`, `analytics_daily_user`, `analytics_daily_url`, `analytics_daily_page_url`, and the current `analytics_*` tables) are moved into `analytic` and renamed in place at startup, so no data is lost.

-- Builtin data tables: deferred with phase 6. The user-data layout below is implemented in
-- OQuery.UI.Storage.Postgres/PostgresDocumentStore.cs.
-- One table per entity type: oquery_queries and oquery_domains.
create table oquery_queries (        -- oquery_domains has the same layout
  user_section_id text        not null,  -- '' for builtin rows
  id              text        not null,
  is_builtin      boolean     not null,
  body            jsonb       not null,  -- QueryDto / DomainDto shape
  updated_at      timestamptz not null default now(),
  primary key (user_section_id, id)
);

-- admin_audit: deferred with phase 6.
create table admin_audit (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  action      text not null,           -- create | update | delete
  entity      text not null,           -- query | domain
  entity_id   text not null,
  summary     text
);
```

Indexes: the primary keys are `analytic.visitors(user_id)`, `analytic.daily_visitors(day, user_id)`, and `analytic.daily_backend(day, url)`.

Storing builtin data as `jsonb` keeps the existing `DomainDto` and `QueryDto` shapes, so the repository interfaces (`IDomainRepository`, `IQueryRequestRepository`) do not change.

Seeding: on first use, the repositories insert the file-based builtin data with `ON CONFLICT DO NOTHING`. Admin edits to builtin rows survive redeploys. Later changes to the builtin JSON files do not reach an existing database and need an explicit migration.

## 5. Collection (server-side only)

- No browser ingest endpoint. The browser sends nothing for analytics.
- `RequestUsageMiddleware` runs after routing and counts each routed, non-`analytics/` API request by (UTC day, user ID from the `oquery_uid` cookie, route template).
- `AnalyticsUsageFlushService` drains the in-memory counts every 60 seconds and on shutdown. Failed rows are re-added and retried.
- The repository writes all four analytics tables in one transaction. `analytic.visitors` uses `on conflict do nothing`, so the first-seen day is set once.
- Storage failures are logged and never fail the user's request.

## 6. Admin API (token required)

All endpoints require `X-Admin-Token`, compared in constant time. If `ADMIN_TOKEN` is unset, they return 404. A missing or wrong token returns 401.

| Endpoint | Purpose |
|---|---|
| `GET /analytics/admin/summary?from&to` | Daily new/returning visitor and request totals, plus the total visitor count. |
| `GET /analytics/admin/urls?from&to&limit` | Total requests per API route template for the range, most requested first. |
| `GET /analytics/admin/pages?from&to&limit` | Total requests per frontend page (from `X-Client-Page`) for the range, most requested first. Requests without a page are not listed. |

`from` and `to` default to the last 30 days. `from` must be before `to`, and the range is capped at 366 days.

Deferred: page-to-page navigation, visitor drill-down, errors, and builtin CRUD with `admin_audit`.

## 7. Frontend

- The browser does not track analytics. There is no tracker service, no notice, and no page-view code.
- The footer in [main.tsx](/D:/SourceCode/Github/public/oquery-ui/src/OQuery.UI.Frontend/src/main.tsx) shows the copyright line.
- **Admin page** `/admin`, with a token prompt that stores the token in `sessionStorage`. It shows totals (new visitors, returning visitors, total visitors), a daily table (day, new visitors, returning visitors, total requests), and a URL table (URL, requests). It states that data refreshes every minute, not in real time.
- **Privacy UI.** The app shows a first-use analytics notice explaining optional analytics, with `Accept`, `Decline`, and a `Privacy Notice` link. The footer always links to the Privacy Notice, Terms of Service, and analytics settings. An accepted analytics preference is stored in browser storage and sent as `X-Analytics-Consent: granted`; a declined preference is memory-only, so the notice appears again after a browser refresh. Declining or withdrawing consent sends no granted value.
- **Range.** Presets: 7, 30, 90 days, and "To date" (366 days, which covers the 365-day retention). Two date inputs (`From`, `To`) are inclusive on screen; the request sends `to` as the day after `To`, because the API range is half-open. The range must be valid (`From` before or equal to `To`, at most 366 days), and the page validates it before calling the API.
- **Reload.** A Reload button refetches with the current range and does not change the token.
- **CSV.** "Download CSV" buttons export the loaded daily table and URL table. Files are built in the browser from the data already shown, so no extra API call is needed. Cells are quoted when they contain a comma, quote, or newline.
- Admin service `src/services/admin-analytics-service.ts` owns admin fetches, following the same pattern.
- The Vite dev proxy and the Render rewrite rules need an `/analytics/*` entry. See `docs/frontend/deploy.md`.
- **Visual design.** The admin page uses a restrained dashboard hierarchy: a dark header surface for the page identity and controls, a soft neutral page background, elevated metric cards, and bordered data panels. Accent colors are reserved for active controls and positive metric emphasis. The layout remains responsive, with controls wrapping below the title and tables retaining horizontal scrolling on narrow screens.

## 8. Privacy and safety

- No IP addresses, query text, or result data are stored.
- The page column stores the frontend pathname only. The query string and hash are dropped. Path segments are kept as sent, so a route that carries an ID (for example `/metadata/entities/{domainId}`) stores that ID in `analytic.daily_frontend.page`. The server accepts only values that start with `/` and are at most 200 characters. Open decision: normalize ID segments to a placeholder before storing (see section 12).
- The analytics user ID is a pseudonymous identifier (personal data under GDPR). It is stored only in `analytic.visitors` and `analytic.daily_visitors`. The URL totals and the admin summary never expose a user ID.
- No consent notice is shown. Legal review is needed before relying on this in the EU, because notice-only handling of a persistent identifier may not meet GDPR consent requirements.
- `ADMIN_TOKEN` is set only in Render's environment, never committed.
- Admin write endpoints validate the body against the existing DTO shapes.

## 9. Operations

- Neon free tier: 1 GB storage per project. Daily rollup rows are small, so storage grows with distinct (day, user) and (day, URL) pairs, not with raw requests.
- Compute suspends after 5 minutes idle. The first flush after idle is slower; the flush runs in the background and never blocks requests.
- Retention runs at startup only and deletes daily rows older than 365 days. `analytic.visitors` is never pruned, so new-vs-returning stays correct.
- Monitor storage on the Neon dashboard. Writes fail once the quota is full, so ingest must log and drop events rather than fail the app.

## 10. Phases

1. Provision Neon. Add `ConnectionStrings__Analytics` as an environment variable. Add schema migrations.
2. Replace `UserSectionManager` with the cookie-based user ID. Add tests that two users get separate folders.
3. Server-side request counting middleware and 60-second flush (done; no browser ingest).
4. Admin auth and analytics read endpoints, with tests for token rejection.
5. Admin page with daily totals and URL table (done).
6. Builtin CRUD with audit log. Migrate existing builtin files into Postgres with an import script.
7. Retention job and Render environment setup. Update `docs/frontend/deploy.md`.

## 11. Open questions

1. Builtin data moving to Postgres: deferred with phase 6.
2. Privacy notice: resolved. None is shown; legal review is advised (section 8).
3. Retention: resolved. 365 days for daily rows; user first-seen rows are kept.
4. Whether Privacy Policy and Terms links belong in the footer: open, no pages exist yet.

## 12. Known gaps in this step

- The user ID is a first-party cookie (`oquery_uid`) issued by the server. Browser JavaScript does not read or store it.
- "Visit" means one routed API request. SPA page views are not counted, because the client router makes no API call for them.
- Analytics refreshes every 60 seconds, so today's numbers may lag by up to a minute.
- Rate limiting is not implemented. The 16 KB default body limit and the in-memory key cap bound memory use.
- Retention runs once per process start. The daily job is not implemented.
- Page paths are stored as sent. Route IDs such as `/metadata/entities/{domainId}` are not yet normalized to a placeholder; this is an open decision.
