# DynamicSQL Studio demo

This is the React/Vite front end for the DynamicSQL demo. It demonstrates a metadata-driven query builder with:

- CSV upload and local sample data
- Selectable projection fields and aggregates, organized into drag-and-drop rows
- Dynamic filter controls and quick search
- A responsive dark data grid
- A Reports studio with 20 curated built-in analyses, query-backed visualizations, and CRUD for custom reports
- A Saved Queries library that distinguishes built-in and custom requests, loads a selected request into Query Builder, and saves/deletes custom requests per user section
- URL-backed pages with browser back/forward support; Query Builder inputs remain in place while visiting other pages and its design is restored after a refresh
- A Data Sources explorer with Data View and a draggable schema Diagram, including table columns, primary keys, foreign-key cardinalities, and a top-10 row preview

The Data Sources page first loads configured connection profile names from
`GET /db/connections`. It supports server-side configured profiles and direct
connections to SqlServer, Sqlite, Firebird, Postgres, CockroachDB,
MySql/MariaDB, Oracle, and Db2. The core dialect/function-template UI also
supports SAP HANA. Direct
connections are disabled by default and must be
explicitly enabled by the server operator in a trusted environment. Connection
strings are never returned to the frontend. The active database instance is
shared by all clients; `POST /db/disconnect` does not release or dispose it, so
one client's disconnect cannot interrupt other clients.

After connecting, the Data View groups tables by schema, displays column and relationship metadata, and previews up to 10 rows. Schema and relationship metadata come from `GET /db/schema`; preview data comes from `GET /db/data/{tableName}` with `schema` and `limit=10` query parameters. The schema Diagram remains available as the metadata-builder view.

Built-in reports choose a visualization based on the analysis (for example, monthly revenue trends, customer rankings, channel mix, invoice-status funnels, and customer-value scatter plots). Custom reports save their name, description, visualization, and query with the demo backend.

Run it with:

```powershell
npm install
npm run dev
```

## Expression builder debug visuals

The expression builder's debug outline, model tooltips, and model JSON panel are controlled by `debugUiEnabled` in the `queryBuilder` Redux state. To change what appears after a browser refresh, edit the `debugUiEnabled` value in the slice's `initialState` (`true` shows the debug UI; `false` hides it). This is a source-code flag and does not require a `.env` setting.

To change it at runtime, dispatch `setExpressionDebugUiEnabled(false)` to turn the debug UI off, or `setExpressionDebugUiEnabled(true)` to turn it back on. In Redux DevTools, dispatch the corresponding action as:

```json
{ "type": "queryBuilder/setExpressionDebugUiEnabled", "payload": false }
```

To change the default, edit `debugUiEnabled` in `src/components/query-builder/query-design/query-builder-slice.ts`. The persistent left borders on groups and field boxes are structural styling and remain visible.
