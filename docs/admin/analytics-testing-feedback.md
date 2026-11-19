# Analytics: testing feedback

## What changed

- The user ID is a first-party cookie, `oquery_uid`, issued by the API. It is a GUIDv7, HttpOnly, SameSite=Lax, Path=/, and lasts 400 days. The browser does not store or send it from JavaScript.
- The browser sends no analytics data. The privacy notice, tracker component, and `analytics-notice` service were removed. The footer shows "© 2026 Your App".
- The server counts routed API requests per UTC day and user, plus a global count per route template. The flush service writes every 60 seconds.
- The admin page shows totals (new users, returning users, total visits), a daily table, and a per-URL table with no user column. It states that data is updated about every minute.
- Schema: `analytic.visitors`, `analytic.daily_visitors`, `analytic.daily_backend`, `analytic.daily_frontend`. The old `analytics_daily_usage` table is no longer created.

## Page tracking (X-Client-Page)

- The frontend sends `X-Client-Page` with every API request (`window.location.pathname`, set in `api-client.ts` `send()`).
- The API drops the query string and fragment, and accepts only values that start with `/` and are at most 200 characters.
- Counts are kept per (day, URL, page) and upserted into `analytic.daily_frontend` by the 60 s flush. `analytic.daily_backend` is unchanged.

| Check | Result |
|---|---|
| `dotnet build` (API) | Passed, 0 errors |
| `dotnet test --filter Analytics` | 6 passed, 0 failed (includes `Collector_SplitsSameUrl_ByClientPage`) |
| `npm run build` (frontend) | Passed |
| End-to-end: `GET /metadata/functions` with `X-Client-Page: /metadata/entities/abc-123?x=1#top`, wait for flush, query Postgres | Stored `page = /metadata/entities/abc-123`, `url = /metadata/functions`, `count = 1` |

An earlier end-to-end run stored `?x=1`. That was a sanitizer bug, now fixed. The bad row was deleted from the local `oquery` database.

Open for the developer:
- Route IDs stay in the page path (for example `/metadata/entities/{domainId}`). Decide whether to replace ID segments with a placeholder. See `analytics-admin-design.md` sections 8 and 12.
- The flush interval is still hardcoded at 60 s (`AnalyticsUsageFlushService.cs`).
- The `analytic.daily_frontend` table appears only after the first flush with data.

## Verification

| Check | Result |
|---|---|
| `npm run build` (frontend) | Passed |
| `dotnet test --filter RequestUsageTests` | 5 passed, 0 failed |

Covered by `RequestUsageTests`:

- Collector sums counts for the same key, and `Drain` clears them.
- Collector drops new keys after `MaxEntries` but still counts existing keys.
- A request with no cookie gets a new `oquery_uid` cookie with HttpOnly and SameSite=Lax.
- A valid existing cookie is reused and not reissued.
- An invalid cookie value is replaced.

## Admin page shows no data (fixed)

- Cause: `GET /analytics/admin/urls` returned `{"value":[...],"Count":n}` instead of a JSON array. `admin-analytics.tsx` calls `.map` on the response, so the page failed to render the table.
- Fix: `AdminAnalyticsController.Urls` returns `rows.ToArray()`.
- Verified against a running API with live counts: the response is now a plain array. The date range (UTC today) matched the stored rows (`2026-11-18`).
- Open: I did not confirm why the repository's `IReadOnlyList` serialized as an object. A regression test has not been added.
- Local note: an older API process (PID 45956) on port 21210 was still running without `ADMIN_TOKEN`, which returned 404. It was left untouched.

## Admin page: filters, reload, CSV (added)

- Date range: presets `7 days`, `30 days`, `90 days`, and `To date` (366 days, covering the 365-day retention). From/To are inclusive UTC dates. Invalid ranges (From after To, or over 366 days) show a message and do not call the API.
- Reload re-fetches the current range.
- Download CSV for the daily table and the URL table. Files are built in the browser from the rows on screen.
- Verified in the browser: the `7 days` preset set From `2026-11-12` and To `2026-11-18`, and the tables and totals updated.
- Automated: `admin-analytics-service.spec.ts` (4 tests) covers the inclusive-to-half-open conversion, preset dates, range validation, and CSV quoting. It passes. `npm run build` passes.
- Not yet verified: clicking Download CSV in the browser (the file save dialog is not checked), and the Reload button.
- Open: the browser console shows a 400 on page load. It has not been investigated.

## Admin page: visual polish (added)

- Added a dark dashboard hierarchy aligned with the existing application theme: admin-console heading, contextual date status, elevated metric cards, and bordered data panels.
- Styled date controls, presets, action buttons, table headers, route-code values, login state, loading state, and validation errors without changing analytics behavior.
- Added responsive wrapping for the toolbar and single-column metric cards on smaller screens; tables remain horizontally scrollable.
- Verified the rendered dashboard in the shared browser page after a production frontend build.

## Privacy notice and analytics consent (added)

- Added first-use consent UI with `Accept`, `Decline`, and a concise `Privacy Notice` link.
- Added footer links for Privacy Notice, Terms, and Analytics settings. The policy routes explain the necessary section identifier, optional analytics, stored fields, and retention.
- The frontend sends `X-Analytics-Consent: granted` only after opt-in. The server-side request collector ignores requests without that header, while the essential section cookie remains available for custom-data separation.
- Verified in the browser: the notice appeared on refresh, Decline removed it, the footer links remained visible, and the Privacy Notice route rendered.
- Automated checks: frontend production build passed; focused analytics tests passed (6/6).
- Existing browser console warnings remain: a connection-status request returns HTTP 400, and the browser reports a duplicate `createRoot` warning during repeated Vite refreshes. Neither was introduced by the consent change.
- Decline is intentionally memory-only: it hides the notice for the current render, but the notice returns after a browser refresh. Accept remains persistent so users are not repeatedly prompted after opting in.
- Custom-data save paths remain independent of analytics consent: query, domain, and function services resolve the essential section identifier through their own API services. The analytics middleware only decides whether to add a request to the optional analytics collector.

## Not verified yet

- The new-vs-returning SQL and the dedupe in `AddUsageAsync` against a real Postgres database.
- The end-to-end cookie flow against a running server, including `Secure` behind Render. Render terminates TLS, so `Request.IsHttps` may be false unless forwarded headers are configured.
- The Vitest suite. It has 14 failures in `query-builder` and `oquery-editor`. They are unrelated to analytics, and I have not confirmed whether they were already failing before this change.

## Open items for the developer

- "Total visits" is counted as routed API requests, one request = one visit. Please confirm this definition.
- Notice-free handling of a persistent identifier may not satisfy EU consent rules. Legal review is advised.
- The SPA changes routes without server calls, so the URL totals count API route templates, not page views.
- Footer Privacy Policy and Terms links were not added because no pages exist.
- `Microsoft.AspNetCore.Hosting.Diagnostics` logs are not used. The design relies on middleware and the database rollup.
