# Admin Analytics and Builtin Data Management (design)

Status: decisions confirmed (Neon, analytics only, privacy notice on first visit). Implementing phases 1 to 5 (analytics). Builtin CRUD (phase 6) and the retention job's admin-audit parts are deferred.

## 1. Goals

1. **Analytics (admin view)**
   - Total visits, visits per user, and sections per user (a section is one browser tab session).
   - Duration per section, and time per page.
   - Where users come from: referrer, UTM parameters, landing page.
   - Page visit frequency and page-to-page navigation.
2. **Builtin data management (admin)**: create, update, and delete builtin saved queries and domains, with an audit log.
3. **Reliability and feature signals** for future upgrades: API errors, feature usage, and funnel steps.

## 2. Decisions

| Topic | Decision |
|---|---|
| Storage for analytics and builtin data | Neon Postgres (free tier, no expiry) |
| Admin access | Shared token in the `ADMIN_TOKEN` environment variable, sent as `X-Admin-Token`. If unset, all `/admin/*` endpoints return 404 (fail closed). |
| Visitor identity | Random ID in `localStorage` (`visitorId`). No login, no cookies. |
| Section identity | Random ID in `sessionStorage` (`sectionId`). Ends after 30 minutes without activity or when the tab closes. |
| IP address | Not stored. Country comes from a geo header only if the host provides one; otherwise it is left empty. |
| Query text | Not stored. Events carry counts, flags, and status codes only. |
| Privacy notice | Show a short notice on first visit (confirmed). |
| Retention | Page views are deleted after 180 days. Section rows are kept for 365 days. Pruning runs when the analytics store initializes. |
| Scope | Analytics only for this step. Builtin CRUD (phase 6) is deferred. |
| Routes | Admin API lives under `/analytics/*` (`/analytics/events` for ingest, `/analytics/admin/*` for reads). The admin page is the SPA route `/admin`, so the two do not collide in the Render rewrite rules. |
| Config | Connection string: `ConnectionStrings__Analytics` (empty disables analytics). Admin token: `ADMIN_TOKEN`. Both are Render environment variables. |

Deferred with builtin CRUD: builtin saved queries and domains moving from files to Postgres, so admin edits survive redeploys.

Phase 1 scope for this step: page views and sections only. The `analytics_events` table, browser/OS/device/country fields, the navigation endpoint, and rate limiting are deferred. Ingest still validates batch size and field length, and it always returns 204 so a storage failure never breaks the app.

## 3. Current state to change

- `IUserSectionManager` (`src/OQuery.UI/Application/Middlewares/UserSectionManager.cs`) is a stub that always returns `"123"`. All users therefore share one user-data folder. This must be fixed before per-user analytics or per-user data can be trusted. This design replaces the stub with the section ID from the request header.
- Builtin data is read-only and file-based. The consumer loads it from `OQuery:Seeds:BasePath` through `BuiltinDataLoader` (SetupTests) and passes it to the repositories. Admin edits never write built-in data. User-created data is saved by the active provider (File or Postgres) and Render discards file writes on redeploy.
- Repositories are chosen in `OQuery.UI.Api/Program.cs`: `FileRepositoryProvider` by default, or `PostgresRepositoryProvider` when `OQuery:Repositories:Postgres:ConnectionString` is set. Built-in domains and queries are passed to the provider constructor and held in memory. `builder.Services.AddRepositoryProvider(provider)` registers the Domain, Query, and Function repositories. Postgres stores user rows only. Function definitions are not stored in Postgres. Storage.Postgres does not reference Storage.Files.
- Postgres mode needs `OQuery:Repositories:Postgres:ConnectionString` (for example via the `OQuery__Repositories__Postgres__ConnectionString` environment variable on Render). Do not commit the connection string.
- Postgres mode currently covers domains and saved queries. Metadata, function definitions, and operator definitions stay file-based.

## 4. Data model (Postgres)

```sql
create table analytics_sections (
  section_id     uuid primary key,
  visitor_id     uuid not null,
  started_at     timestamptz not null,
  last_seen_at   timestamptz not null,
  referrer_host  text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  landing_page   text
);

create table analytics_page_views (
  id             bigserial primary key,
  section_id     uuid not null references analytics_sections(section_id),
  page           text not null,
  previous_page  text,
  entered_at     timestamptz not null,
  left_at        timestamptz,
  duration_ms    integer
);

-- analytics_events: deferred (see section 2).

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

Indexes: `analytics_sections(started_at)`, `analytics_sections(visitor_id)`, `analytics_page_views(section_id)`, `analytics_page_views(page, entered_at)`.

Time model: the browser measures durations only (it never sends absolute times). The server sets `entered_at = received_at - duration_ms`, and `last_seen_at` is the server time of the latest batch. A section's duration is `last_seen_at - started_at`, which is kept current by a 30-second heartbeat while the tab is visible. Time is measured in active (visible) tab time.

Storing builtin data as `jsonb` keeps the existing `DomainDto` and `QueryDto` shapes, so the repository interfaces (`IDomainRepository`, `IQueryRequestRepository`) do not change.

Seeding: on first use, the repositories insert the file-based builtin data with `ON CONFLICT DO NOTHING`. Admin edits to builtin rows survive redeploys. Later changes to the builtin JSON files do not reach an existing database and need an explicit migration.

## 5. Ingest API (public, anonymous)

`POST /analytics/events`

- Body: `{ visitorId, sectionId, referrer?, utmSource?, utmMedium?, utmCampaign?, landingPage?, pageViews: [{ page, durationMs }] }`. `pageViews` may be empty (heartbeat). At most 50 page views per request.
- Server rules:
  - `visitorId` and `sectionId` must be non-empty GUIDs.
  - `page` is reduced to its path (query and hash removed). It must start with `/` and be at most 300 characters.
  - `durationMs` is clamped to `[0, 4 hours]`.
  - `referrer` is stored as its host only. Non-absolute values are dropped. UTM values are trimmed and capped at 100 characters.
  - The server sets all timestamps. Client clocks are not trusted.
  - Storage failures are logged and the request still returns 204.
- The frontend sends with `navigator.sendBeacon` on page change, visibility change, `pagehide`, and every 30 seconds (heartbeat). It falls back to `fetch` with `keepalive: true`.
- Rate limiting per `sectionId` is deferred.

## 6. Admin API (token required)

All endpoints require `X-Admin-Token`, compared in constant time. If `ADMIN_TOKEN` is unset, they return 404. A missing or wrong token returns 401.

| Endpoint | Purpose |
|---|---|
| `GET /analytics/admin/summary?from&to` | Visitors, sections, page views, average section duration, sections per visitor. |
| `GET /analytics/admin/pages?from&to` | Page views, unique sections, average and total time per page, most visited first. |
| `GET /analytics/admin/visitors?from&to&limit` | Visitors with section count (frequency), total time, and last seen. |
| `GET /analytics/admin/sources?from&to` | Referrer host, UTM source, and UTM campaign, with section counts. |

`from` and `to` default to the last 30 days. `from` must be before `to`, and the range is capped at 366 days. Ranges filter by section start time.

Deferred: `navigation`, `sections` drill-down, `errors`, and builtin CRUD with `admin_audit`.

## 7. Frontend

- **Tracker service** `src/services/analytics-service.ts`. Per repository convention, the service owns the network call. It holds the ID generation, the pending page-view queue, the heartbeat timer, and the `sendBeacon` fallback. Redux is not involved.
- Section rotation: a stored section older than 30 minutes since its last page change or heartbeat is replaced with a new section ID. Pages under `/admin` are not tracked.
- **Router hook** in `main.tsx` calls the tracker on each pathname change.
- **Admin page** `/admin`, with a token prompt that stores the token in `sessionStorage`. It shows summary cards, a page table, a visitor table, and a source table, with a 7/30/90-day range selector. Charts, the navigation table, the section drill-down, and builtin editors are deferred.
- Admin service `src/services/admin-service.ts` owns admin fetches, following the same pattern.
- The Vite dev proxy and the Render rewrite rules need an `/analytics/*` entry. See `docs/frontend/deploy.md`.

## 8. Privacy and safety

- No IP addresses, query text, or result data are stored.
- Analytics is anonymous and keyed by random IDs that are not linked to a person.
- The notice text and whether it blocks tracking are still open.
- `ADMIN_TOKEN` is set only in Render's environment, never committed.
- Admin write endpoints validate the body against the existing DTO shapes.

## 9. Operations

- Neon free tier: 1 GB storage per project. A section with about 5 page views and 20 events is around 2 to 3 KB, so 1 GB holds several hundred thousand sections.
- Compute suspends after 5 minutes idle. The first request after idle is slower, so the tracker must not block the UI.
- The retention job runs at startup and once per day. It deletes old rows in batches.
- Monitor storage on the Neon dashboard. Writes fail once the quota is full, so ingest must log and drop events rather than fail the app.

## 10. Phases

1. Provision Neon. Add `ConnectionStrings__Analytics` as an environment variable. Add schema migrations.
2. Replace `UserSectionManager` with the section ID from the header. Add tests that two sections get separate folders.
3. Ingest endpoint and tracker service, with unit tests for allowlists and batching.
4. Admin auth and analytics read endpoints, with tests for token rejection.
5. Admin page with charts.
6. Builtin CRUD with audit log. Migrate existing builtin files into Postgres with an import script.
7. Retention job and Render environment setup. Update `docs/frontend/deploy.md`.

## 11. Open questions

1. Builtin data moving to Postgres: deferred with phase 6.
2. Privacy notice: resolved. Show on first visit.
3. Retention: resolved. 180 days for page views, 365 days for sections.
4. `query_executed` structural counts: deferred with the events table.

## 12. Known gaps in this step

- `UserSectionManager` is still a stub that returns `"123"`. Analytics does not depend on it, so it is not changed here.
- Rate limiting per section is not implemented yet. The batch size cap and the 16 KB default body limit bound each request.
- Retention runs once per process start. The daily job is not implemented.
