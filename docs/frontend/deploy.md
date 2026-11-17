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
| `/*` | `/index.html` | Rewrite |

Notes:
- `/query-request` (no trailing path) needs its own rule. `/query-request/*` does not match the bare path, and the catch-all would return HTML where JSON is expected.
- Keep the `/*` catch-all last.
- Rules are applied on save, usually within a minute, with no rebuild.

`public/_redirects` in the repo has the same rules. It is a fallback only, because the Render dashboard rules are the ones verified to take effect.

## 4. Verify

```powershell
curl.exe -s -o NUL -w "%{http_code} %{content_type}`n" https://<your-site>.onrender.com/metadata/domains/names-with-descriptions
curl.exe -s -o NUL -w "%{http_code} %{content_type}`n" https://<your-site>.onrender.com/query-request
```

Both should return `200 application/json`. A `text/html` response means a rule is missing or below the `/*` catch-all.

## Local development

`npm run dev` uses the Vite proxy in `vite.config.ts`, not the Render rules. The proxy targets `VITE_BACKEND_API_URL`, falling back to `https://oquery-ui-1.onrender.com`. Each proxy entry sets `changeOrigin: true`, which is required for the HTTPS backend. Restart the dev server after changing `vite.config.ts`.
