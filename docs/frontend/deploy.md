# Deploy the frontend to Render (Static Site)

The frontend (`src/OQuery.UI.Frontend`) is a Vite static build. It is served by a Render Static Site and calls the ASP.NET Core API (`oquery-ui-1`) through rewrite rules on the static host, so the browser sees a single origin and CORS is not needed.

## 1. Build locally (optional check)

```powershell
cd src/OQuery.UI.Frontend
npm ci
npm run build
```

The output goes to `dist/`. A chunk-size warning is expected and is not an error.

## 2. Create the Static Site on Render

| Setting | Value |
|---|---|
| Repository | `NamHqUs/oquery-ui` |
| Branch | `deploy` |
| Root Directory | `src/OQuery.UI.Frontend` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| `VITE_BACKEND_API_URL` | **Not set** |

Leave `VITE_BACKEND_API_URL` unset in production. The app then uses relative URLs (for example `/metadata/functions`), and the rewrite rules send them to the API. If it is set, the browser calls the API directly and hits CORS, because the API does not configure CORS.

## 3. Add Redirects/Rewrites rules

In the static site's **Redirects/Rewrites** settings, add these rules, in this order. Every action must be **Rewrite**, not Redirect.

| Source | Destination | Action |
|---|---|---|
| `/db/*` | `https://oquery-ui-1.onrender.com/db/*` | Rewrite |
| `/metadata/*` | `https://oquery-ui-1.onrender.com/metadata/*` | Rewrite |
| `/dynamic-query/*` | `https://oquery-ui-1.onrender.com/dynamic-query/*` | Rewrite |
| `/query-request` | `https://oquery-ui-1.onrender.com/query-request` | Rewrite |
| `/query-request/*` | `https://oquery-ui-1.onrender.com/query-request/*` | Rewrite |
| `/analytics/*` | `https://oquery-ui-1.onrender.com/analytics/*` | Rewrite |
| `/*` | `/index.html` | Rewrite |

Notes:
- `/query-request` (no trailing path) needs its own rule. `/query-request/*` does not match the bare path, and the catch-all would return HTML where JSON is expected.
- Keep the `/*` catch-all last.
- Rules are applied on save, usually within a minute, with no rebuild.

### Analytics (API service `oquery-ui-1`)

Set these environment variables on the API service. Without `ConnectionStrings__Analytics`, usage counts are not saved and the admin endpoints return 503.

| Variable | Purpose |
|---|---|
| `ConnectionStrings__Analytics` | Neon Postgres connection string. The table is created on first use. |
| `ADMIN_TOKEN` | Shared secret for `/admin`. If unset, the admin endpoints return 404. |

The API counts each routed request per day, section, and route template, and flushes the counts to the database every 60 seconds. The browser receives only the `oquery_uid` cookie, which lasts 400 days.

The admin page is at `/admin`. Enter `ADMIN_TOKEN` there. The token is kept in `sessionStorage` for that tab only.


The repo has no `public/_redirects` file. The Render dashboard rules are the only source of routing.

## 4. Verify

```powershell
curl.exe -s -o NUL -w "%{http_code} %{content_type}`n" https://<your-site>.onrender.com/metadata/projects
curl.exe -s -o NUL -w "%{http_code} %{content_type}`n" https://<your-site>.onrender.com/query-request
```

Both should return `200 application/json`. A `text/html` response means a rule is missing or below the `/*` catch-all.

## Local development

`npm run dev` uses the Vite proxy in `vite.config.ts`, not the Render rules. The proxy targets `VITE_BACKEND_API_URL`, falling back to `https://oquery-ui-1.onrender.com`. Each proxy entry sets `changeOrigin: true`, which is required for the HTTPS backend. Restart the dev server after changing `vite.config.ts`.
