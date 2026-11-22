# Frontend API calls by page

This is the maintained API and data-ownership contract for `OQuery.UI.Frontend`.
Update it whenever an endpoint, service boundary, cache rule, or page request
changes. The API base URL is `VITE_BACKEND_API_URL`.

Implementation references:

- [`src/main.tsx`](../../src/OQuery.UI.Frontend/src/main.tsx) — routes and application shell.
- [`src/const/api-urls.ts`](../../src/OQuery.UI.Frontend/src/const/api-urls.ts) — endpoint definitions.
- [`src/components/data-sources/database-slice.ts`](../../src/OQuery.UI.Frontend/src/components/data-sources/database-slice.ts)
  — connection, schema, and table data.
- [`src/store/store.ts`](../../src/OQuery.UI.Frontend/src/store/store.ts) — Redux store.
- [`src/components/metadata/metadata-slice.ts`](../../src/OQuery.UI.Frontend/src/components/metadata/metadata-slice.ts)
  — entities and relations of the loaded project.
- [`src/components/function-definition/function-definition-slice.ts`](../../src/OQuery.UI.Frontend/src/components/function-definition/function-definition-slice.ts)
  — function definitions for the loaded project.
- [`src/components/saved-queries/saved-queries-slice.ts`](../../src/OQuery.UI.Frontend/src/components/saved-queries/saved-queries-slice.ts)
  — saved query requests.
- [`src/components/playground/playground-slice.ts`](../../src/OQuery.UI.Frontend/src/components/playground/playground-slice.ts)
  — playground inline results.
- [`src/components/metadata-builder/metadata-builder.tsx`](../../src/OQuery.UI.Frontend/src/components/metadata-builder/metadata-builder.tsx)
  — metadata routes and domain UI.

## Service ownership

Every backend call made by the frontend's data layer is performed by a service
in `src/services`. Each service owns its URL, response validation, cache and
in-flight request sharing. Redux thunks are thin adapters: they call the
service and store the result in Redux. Components dispatch thunks or call
services; they never call APIs directly.

Shared transport: `src/services/api-client.ts` (`requestJson`).

| Service | Owns (fetch + validate + cache) | Invalidation |
| --- | --- | --- |
| `ProjectService` (`project-service.ts`) | Project list and CRUD, FullDomain generate/read, sub-domain CRUD and the resolved `DomainDetails` per project and sub-domain | Resolved details cached per project and sub-domain; list reconciled with details. |
| `DbSchemaService` | Database schema and table previews | `invalidateSchema()` on connect/disconnect. |
| `FunctionDefinitionService` | Function definitions per project and create/update/delete | Per-project cache cleared on every save/delete. |
| `QueryService` | Saved-query requests per project and sub-domain (fetch, save, delete) | Per-scope entry cleared on save/delete. |
| `OQueryEditorService` | Orchestration only: dispatches the domain, function and saved-query adapters for the editor | None (delegates to the services above). |
| `DatabaseConnectionService` | Connection options, provider check, connect and disconnect (validated) | Schema cache is invalidated on connect and disconnect. |
| `DynamicQueryService` | Query execution, OQuery text execution, SQL and OQuery conversion (both `projectId` and `domainId` are sent) | None (results are not cached). |
| `DataSourceService` | External datasource loading (`VITE_DATA_SOURCE_URL`) | None. |

Duplicate protection (same for every service): a cached value is returned if
present; a pending request is shared by all callers; a failed request clears
the pending entry so the next call can retry.

### Project data

Project and sub-domain data are loaded on demand by ID. `ProjectService`
(`project-service.ts`) lists projects (`listProjects()`) and sub-domain names
(`listDomainNames(projectId)`). `getDomain(projectId, domainId)` returns the
resolved sub-domain, with overrides applied, and is the source for the query
editor and diagram.

Metadata pages produce project data through `ProjectService`. Home and Query
Builder consume the resolved sub-domain through `OQueryEditorService`. A
component must not implement a second project or domain cache or resolve
list/detail conflicts itself.

### Database schema

`DbSchema` is not global domain data. It is shared infrastructure for metadata
authoring and Database Explorer, owned by `DbSchemaService`. Metadata pages
must call `DbSchemaService.getSchema()` for table mapping and relation
selection. A database connection change invalidates the old schema before it
is used again.

### OQuery editor contract

Every OQuery editor host must provide all editor data explicitly:

```ts
type OQueryEditorInput = {
  domain: DomainDetails;
  functionDefinitions: FunctionDefinition[];
};
```

Home, Query Builder, and future editor hosts must use
`OQueryEditorService`. The editor must not fetch missing domain or function
data. Built-in filter operators are static (`oquery-editor/filter-operators.ts`)
and need no request.

```text
Home / Query Builder
  -> OQueryEditorService
     -> ProjectService.getDomain(projectId, domainId)
     -> FunctionDefinitionService.getDefinitions(projectId)

Query Builder saved-query bar
  -> QueryService.fetchQueryRequestPayload(projectId, domainId)

Query Builder project and sub-domain selector
  -> ProjectService.listProjects()
  -> ProjectService.listDomainNames(projectId)

Metadata > Projects (project, FullDomain, sub-domains)
  -> ProjectService.listProjects()
  -> ProjectService.getProject(projectId)
  -> ProjectService.generateFullDomain(projectId) / getFullDomain(projectId)
  -> ProjectService.createDomain/updateDomain/deleteDomain(...)
  -> ProjectService.getDomain(projectId, domainId)   // diagram
  -> DbSchemaService.getSchema()                       // FullDomain generation source

Metadata > Database Explorer
  -> DbSchemaService.getSchema()
  -> schema cache or GET /db/schema
```

## Global application-shell requests

These requests are outside page ownership:

| Request | Trigger | Purpose |
| --- | --- | --- |
| `GET /db/connections/provider` | Application startup | Detects the current database provider. |
| `GET /db/connections` | Connection dialog opens | Loads the detected providers. |
| `PUT /db/connection` | Connection submitted | Connects directly with provider and connection string. |
| `POST /db/disconnect` | User disconnects | Clears the database connection and schema state. |

Redux holds the state read by components. Thunks are adapters that call a
service and store its result; they must not contain `fetch` calls.

## Page API contract

### Workspace (`/workspace`)

Lists every saved project and opens the New project page. When no project
exists, the page navigates directly to `/projects/create`.

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `ProjectService.listProjects()` | Page load | Lists project IDs, names and descriptions. Ciphertext is never returned. |

### Create Project (`/projects/create`)

Fields: project name (default `Default`, editable), description (default
`the first project`, editable), DBMS (from `GET /db/connections`), and
connection string. Connection strings are encrypted by the server with the
configured `OQuery:Security:EncryptionKey` before they are saved.

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `GET /db/connections` via the database connection service | Page load | Fills the DBMS list from the dialects registered in DI. |
| `ProjectService.testProjectConnection(provider, connectionString)` (`POST /metadata/projects/test-connection`) | Test Connection | Opens the connection and returns a success result or the error details. Nothing is saved. |
| `ProjectService.createProjectFromDatabase(...)` (`POST /metadata/projects/from-database`) | Create Project | Creates the project, FullDomain and `Main` domain in one server call, then navigates to `/playground/{projectId}/main`. |

Any failure (validation, connection, schema load, or write) keeps the user on
this page and shows the server's error details. The server removes any partly
written project folder before it responds. An in-memory SQLite connection
(`Data Source=:memory:`) is first provisioned with the configured seed scripts
when `OQuery:Seeds:Enabled` is true, so test projects get tables. File databases
are never seeded, because the seed scripts drop and recreate tables.

### Playground (`/playground/{projectId}/{domainId}/{queryId}`)

The playground is the workspace component (`playground-workspace.tsx`)
shown in the content area. `domainId` and `queryId` are optional trailing
segments. The header's Current Project and Active Domain selects change the
URL, and the connection button reuses the topbar `database-status` style. The
old `/projects/{projectId}?domain={domainId}` URL redirects here, and
`/query-builder` redirects through it as well.


### Home (`/`)

Home does not load a project list and does not call function APIs directly. It
uses `VITE_HOME_PROJECT_ID` and `VITE_HOME_DOMAIN_ID` (the sub-domain) through
`OQueryEditorService`. When either is unset, Home makes no metadata request.

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `OQueryEditorService` with configured project and sub-domain IDs | Page load | Provides the resolved sub-domain, functions, and operators required by the editor. |

### Query Builder (`/playground/{projectId}/{domainId}`, formerly `/query-builder`)

The Query Builder page was removed. The playground at the same URL uses the
calls below.

| Service call or API action | Trigger | Purpose |
| --- | --- | --- |
| `ProjectService.listDomainNames(projectId)` | Sub-domain selector load | Provides selector options. |
| `OQueryEditorService` | Sub-domain selection | Provides the resolved sub-domain, functions, and operators. |
| `POST /dynamic-query/query/from-text/{context}?projectId={projectId}&domainId={domainId}` | Inline context run (`executeContextFromText`) | Executes text for a selected context. |
| Context SQL preview (`oqueryContextToSql`) | Inline context run | Converts the context text to SQL for the inline result. |

Saved queries are loaded by `fetchQueryRequests` (`saved-queries-slice.ts`),
which uses `QueryService`. Callers must not call
`GET /query-request?projectId={projectId}&domainId={domainId}` directly.

### Metadata: Projects (`/metadata`)

The initial list requires only `ProjectService.listProjects()`. Project detail,
sub-domain detail and the FullDomain are loaded only for the selected project.

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `ProjectService.listProjects()` | Page load | Lists project IDs, names and descriptions. |
| `ProjectService.getProject(id)` | Project selected | Loads the project and its sub-domain configuration. |
| `ProjectService.generateFullDomain(id)` / `getFullDomain(id)` | Full domain panel | Generates or reads the FullDomain. |
| `ProjectService.createDomain/updateDomain/deleteDomain(...)` | Sub-domain mutation | Persists the sub-domain and reconciles caches. |
| `ProjectService.getDomain(projectId, domainId)` | Diagram / playground | Loads the resolved sub-domain. |
| `DbSchemaService.getSchema()` | Database-backed editing | Provides tables and relationships for the FullDomain generate action. |

### Metadata: Database Explorer (`/metadata/explorer`)

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `DbSchemaService.getSchema()` | Connected explorer load | Loads tables, columns, and relationships. |
| `GET /db/data/{tableName}?schema={schema}&limit=10` | Table Data tab | Loads a maximum of 10 preview rows. |

### Function Definitions (`/function-definitions`)

Uses `FunctionDefinitionService.getDefinitions()`, `saveDefinition()` and
`deleteDefinition()`. The page produces global function data; Home and the
playground consume it through `OQueryEditorService`.

### Filter operators

Built-in filter operators are static and owned by
`oquery-editor/filter-operators.ts`. No API request is made for them.

### Documentation (`/documentation`)

No page-specific API request. The global provider check still runs.

## API ownership summary

| API group | Service/owner |
| --- | --- |
| `/db/connections*`, `/db/connection`, `/db/disconnect` | Database connection flow and application shell |
| `/db/schema`, `/db/data/*` | `DbSchemaService` |
| `/metadata/projects*` (projects, FullDomain, sub-domains, functions) | `ProjectService`, `FunctionDefinitionService` |
| `/metadata/projects/test-connection`, `/metadata/projects/from-database` | `ProjectService` (Create Project page) |
| `/dynamic-query/*` | `OQueryEditorService` |
| `/query-request*` | `QueryService` |

When investigating a Network request, first classify it as a global shell
request, a service-owned page request, or an action-triggered request. The
visible page can contain mounted components retained by the application shell.
