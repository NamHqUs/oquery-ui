# Admin Analytics and Builtin Data Management (design)

Status: proposed. No code yet.

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
| Privacy notice | Open. Default: show a short notice on first visit. |
| Retention | Raw page views and events are deleted after 180 days. Section rows are kept for 365 days. |

Assumption to confirm: builtin saved queries and domains move from files to Postgres, so admin edits survive redeploys.

## 3. Current state to change

- `IUserSectionManager` (`src/OQuery.UI/Application/Middlewares/UserSectionManager.cs`) is a stub that always returns `"123"`. All users therefore share one user-data folder. This must be fixed before per-user analytics or per-user data can be trusted. This design replaces the stub with the section ID from the request header.
- Builtin data is file-based (`OQuery:Repositories:Files:BuiltinData` in `appsettings.json`, read through `FilePathResolver`). Admin edits write files, which Render discards on redeploy.
- Repositories are chosen in `OQuery.UI.Api/Program.cs`. `AddDemoRepositories` (Storage.Files) always registers the file-based repositories. If `OQuery:Repositories:Postgres:ConnectionString` is set, `AddPostgresRepositories` (Storage.Postgres) replaces the domain and query repositories. The API reads the built-in rows from Files and passes them in. Storage.Postgres does not reference Storage.Files.
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
  landing_page   text,
  browser        text,
  os             text,
  device_type    text,
  country        text
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

create table analytics_events (
  id             bigserial primary key,
  section_id     uuid not null references analytics_sections(section_id),
  occurred_at    timestamptz not null,
  name           text not null,        -- allowlisted, see section 5
  page           text,
  endpoint       text,
  status_code    integer,
  duration_ms    integer,
  props          jsonb                 -- counts and flags only
);

-- Implemented in Demo.Repositories.Postgres/PostgresDocumentStore.cs.
-- One table per entity type: oquery_queries and oquery_domains.
create table oquery_queries (        -- oquery_domains has the same layout
  user_section_id text        not null,  -- '' for builtin rows
  id              text        not null,
  is_builtin      boolean     not null,
  body            jsonb       not null,  -- QueryDto / DomainDto shape
  updated_at      timestamptz not null default now(),
  primary key (user_section_id, id)
);

create table admin_audit (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  action      text not null,           -- create | update | delete
  entity      text not null,           -- query | domain
  entity_id   text not null,
  summary     text
);
```

Indexes: `analytics_sections(started_at)`, `analytics_sections(visitor_id)`, `analytics_page_views(section_id)`, `analytics_page_views(page, entered_at)`, `analytics_events(name, occurred_at)`.

Storing builtin data as `jsonb` keeps the existing `DomainDto` and `QueryDto` shapes, so the repository interfaces (`IDomainRepository`, `IQueryRequestRepository`) do not change.

Seeding: on first use, the repositories insert the file-based builtin data with `ON CONFLICT DO NOTHING`. Admin edits to builtin rows survive redeploys. Later changes to the builtin JSON files do not reach an existing database and need an explicit migration.

## 5. Ingest API (public, anonymous)

`POST /analytics/events`

- Body: `{ visitorId, sectionId, referrer?, utm?, events: [...] }`, at most 50 events per request.
- Each event: `{ type: "page" | "event", name, page, endpoint?, statusCode?, durationMs?, props? }`.
- Server rules:
  - `name` must be in an allowlist, for example `page_view`, `query_executed`, `query_saved`, `domain_selected`, `export_clicked`, `api_error`, and `frontend_error`.
  - `props` keys must be in an allowlist. String values are length-capped, and query text is rejected.
  - The server sets `occurred_at`. Client clocks are not trusted.
  - Requests are rate-limited per `sectionId`, and bodies are capped at 16 KB.
- The frontend sends with `navigator.sendBeacon` on page change and on `pagehide`. It falls back to `fetch` with `keepalive: true`.

## 6. Admin API (token required)

All endpoints require `X-Admin-Token`, compared in constant time.

| Endpoint | Purpose |
|---|---|
| `GET /admin/analytics/summary?from&to` | Totals: visitors, sections, average section duration, sections per visitor. |
| `GET /admin/analytics/sources?from&to` | Referrer hosts, UTM campaigns, landing pages, with counts. |
| `GET /admin/analytics/pages?from&to` | Page views, unique sections, average time per page. |
| `GET /admin/analytics/navigation?from&to` | Top page-to-page transitions. |
| `GET /admin/analytics/sections?from&to&page&limit` | Section list for drill-down. |
| `GET /admin/analytics/errors?from&to` | API errors by endpoint and status. |
| `GET/POST/PUT/DELETE /admin/builtin/queries[/{id}]` | Builtin saved query CRUD. Each write adds an `admin_audit` row. |
| `GET/POST/PUT/DELETE /admin/builtin/domains[/{id}]` | Builtin domain CRUD. Same audit rule. |
| `GET /admin/audit?limit` | Recent admin changes. |

Aggregations run as SQL on the summary tables. Date ranges are capped at 366 days per request.

## 7. Frontend

- **Tracker service** `src/services/analytics-service.ts`. Per repository convention, the service owns the network call. It holds the ID generation, the event queue, the batching timer, and the `sendBeacon` fallback. Redux is not involved.
- **Router hook** records page enter and leave, and computes time on page.
- **Admin page** `/admin`, with a token prompt that stores the token in `sessionStorage`. It has charts for visits and sources, a page-frequency table, a navigation table, a section drill-down, and editors for builtin queries and domains.
- Admin service `src/services/admin-service.ts` owns admin fetches, following the same pattern.

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

1. Confirm builtin data moves to Postgres (assumed above).
2. Privacy notice: show it, or track without one?
3. Keep the 180-day retention for events and 365-day retention for sections?
4. Should `query_executed` record the query's entity count and operator count? (Structural counts only, no text.)
