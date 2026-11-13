# Frontend API calls by page

This is the maintained API and data-ownership contract for `Demo.Frontend`.
Update it whenever an endpoint, service boundary, cache rule, or page request
changes. The API base URL is `VITE_BACKEND_API_URL`.

Implementation references:

- [`src/main.tsx`](./src/main.tsx) — routes and application shell.
- [`src/const/api-urls.ts`](./src/const/api-urls.ts) — endpoint definitions.
- [`src/components/data-sources/database-slice.ts`](./src/components/data-sources/database-slice.ts)
  — connection, schema, and table data.
- [`src/components/query-builder/query-design/query-builder-slice.ts`](./src/components/query-builder/query-design/query-builder-slice.ts)
  — query, metadata, and saved-query requests.
- [`src/components/metadata-builder/metadata-builder.tsx`](./src/components/metadata-builder/metadata-builder.tsx)
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
| `DomainService` | `DomainName` list, full `DomainDetails`, domain CRUD | Details cached by ID; list reconciled with details. |
| `DbSchemaService` | Database schema and table previews | `invalidateSchema()` on connect/disconnect. |
| `FunctionDefinitionService` | Function definitions and create/update/delete | Cache cleared on every save/delete. |
| `OperatorDefinitionService` | Operator definitions and create/update/delete | Cache cleared on every save/delete. |
| `QueryService` | Saved-query requests per `domainId` (fetch, save, delete) | Per-domain entry cleared on save/delete. |
| `OQueryEditorService` | Orchestration only: dispatches the domain, function, operator and saved-query adapters for the editor | None (delegates to the services above). |
| `DatabaseConnectionService` | Connection options, provider check, connect and disconnect (validated) | Schema cache is invalidated on connect and disconnect. |
| `DynamicQueryService` | Query execution, OQuery text execution, SQL and OQuery conversion | None (results are not cached). |
| `DataSourceService` | External datasource loading (`VITE_DATA_SOURCE_URL`) | None. |

Duplicate protection (same for every service): a cached value is returned if
present; a pending request is shared by all callers; a failed request clears
the pending entry so the next call can retry.

### Domain data

Domain details are global application data and are loaded by ID on demand.
`DomainService.listDomainNames()` supplies the lightweight selector list;
`DomainService.getDomain(id)` supplies the source-of-truth detail.

Metadata pages produce domain data through `DomainService`. Home and Query
Builder consume it through `OQueryEditorService`. A component must not
implement a second domain cache or resolve list/detail conflicts itself.

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
  operators: OperatorDefinition[];
};
```

Home, Query Builder, and future editor hosts must use
`OQueryEditorService`. The editor must not fetch missing domain, function, or
operator data.

```text
Home / Query Builder
  -> OQueryEditorService
     -> DomainService.getDomain(domainId)
     -> FunctionDefinitionService.getDefinitions()
     -> OperatorDefinitionService.getOperators()

Query Builder saved-query bar
  -> QueryService.getQueryRequests(domainId)

Query Builder domain selector
  -> DomainService.listDomainNames()

Metadata > Diagram / Entity Definition
  -> DomainService.listDomainNames()
  -> DomainService.getDomain(domainId)
  -> DbSchemaService.getSchema()
     // relation selection and database-table mapping
  -> DomainService.create/update/delete(...)

Metadata > Domains
  -> DomainService.listDomainNames()

Metadata > Database Explorer
  -> DbSchemaService.getSchema()
  -> schema cache or GET /db/schema
```

## Global application-shell requests

These requests are outside page ownership:

| Request | Trigger | Purpose |
| --- | --- | --- |
| `GET /db/connections/provider` | Application startup | Detects the current database provider. |
| `GET /db/connections` | Connection dialog opens | Loads providers, profiles, and direct-connection capability. |
| `POST /db/connect` | Connection submitted | Creates a database connection. |
| `POST /db/disconnect` | User disconnects | Clears the database connection and schema state. |

Redux holds the state read by components. Thunks are adapters that call a
service and store its result; they must not contain `fetch` calls.

## Page API contract

### Home (`/`)

Home does not load a domain-name list and does not call domain or function
APIs directly. It uses `HomePage:DomainId` from `appsettings.json` (for
example, `Sales_Domain`) through `OQueryEditorService`.

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `OQueryEditorService` with configured domain ID | Page load | Provides the domain, functions, and operators required by the editor. |

### Query Builder (`/query-builder`)

| Service call or API action | Trigger | Purpose |
| --- | --- | --- |
| `DomainService.listDomainNames()` | Domain selector load | Provides selector options. |
| `OQueryEditorService` | Domain selection | Provides domain, functions, and operators. |
| `QueryService` via `OQueryEditorService` (saved queries) | Saved-query panel load/revisit | Provides cached saved queries for the selected domain. |
| `POST /dynamic-query/query?domainId={domainId}` | Structured query execution | Executes the current definition. |
| `POST /dynamic-query/query/from-text?domainId={domainId}` | OQuery execution | Parses and executes text. |
| `POST /dynamic-query/query/from-text/{context}?domainId={domainId}` | Context execution | Executes text for a selected context. |
| `POST /dynamic-query/query/to-string` | SQL preview | Converts a definition to SQL. |
| `POST /dynamic-query/query/to-string-from-text?domainId={domainId}` | Text SQL preview | Converts OQuery text to SQL. |
| `POST /dynamic-query/query/to-oquery` | OQuery conversion | Converts a definition to OQuery text. |
| `POST /dynamic-query/query/from-oquery` | OQuery loading | Converts OQuery text to a definition. |
| `QueryService.fetch/save/delete(...)` | Saved-query load and mutation | Fetches, saves and deletes through the service; per-domain cache updated on save/delete. |

`QueryService` owns the underlying `/query-request*` API and caches requests
by domain. Query Builder must not directly call
`GET /query-request?domainId={domainId}`.

### Metadata: Diagram (`/metadata/diagrams`)

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `DomainService.listDomainNames()` | Page load | Provides domain selector/group names. |
| `DomainService.getDomain(domainId)` | Domain resolved/changed | Loads the selected domain detail. |
| `DbSchemaService.getSchema()` | Schema or relation logic needed | Provides tables and relationships. |
| `DomainService.create/update/delete(...)` | Metadata mutation | Persists changes and reconciles domain caches. |

### Metadata: Entity Definition

Routes:

- `/metadata/entities`
- `/metadata/entities/{domainId}`
- `/metadata/entities/create`
- `/metadata/entities/edit/{domainId}`

Uses `DomainService.listDomainNames()`, `DomainService.getDomain(id)`,
`DbSchemaService.getSchema()` for table/relation selection, and
`DomainService.create/update(...)` for persistence.

### Metadata: Domains (`/metadata/domains`)

The initial list requires only `DomainService.listDomainNames()`. Detail and
schema data are loaded only for an explicit detail/edit workflow.

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `DomainService.listDomainNames()` | Page load | Lists domain IDs, names, and descriptions. |
| `DomainService.getDomain(id)` | Detail/edit workflow | Loads full domain details. |
| `DbSchemaService.getSchema()` | Database-backed editing | Provides tables and relationships. |
| `DomainService.create/generate/update/delete(...)` | Domain mutation | Persists changes and reconciles caches. |

### Metadata: Database Explorer (`/metadata/explorer`)

| Service call | Trigger | Purpose |
| --- | --- | --- |
| `DbSchemaService.getSchema()` | Connected explorer load | Loads tables, columns, and relationships. |
| `GET /db/data/{tableName}?schema={schema}&limit=10` | Table Data tab | Loads a maximum of 10 preview rows. |

### Function Definitions (`/function-definitions`)

Uses `FunctionDefinitionService.getDefinitions()`, `saveDefinition()` and
`deleteDefinition()`. The page produces global function data; Home and Query Builder consume it through`OQueryEditorService`.

### Operator Definitions

Uses `OperatorDefinitionService.getOperators()`, `saveOperator()` and
`deleteOperator()`. Query
Builder consumes operators through `OQueryEditorService`.

### Documentation (`/documentation`)

No page-specific API request. The global provider check still runs.

## API ownership summary

| API group | Service/owner |
| --- | --- |
| `/db/connections*`, `/db/connect`, `/db/disconnect` | Database connection flow and application shell |
| `/db/schema`, `/db/data/*` | `DbSchemaService` |
| `/metadata/domains*` | `DomainService` |
| `/metadata/functions*` | `FunctionDefinitionService` |
| `/metadata/operators*` | `OperatorDefinitionService` |
| `/dynamic-query/*` | `OQueryEditorService` |
| `/query-request*` | `QueryService` |

When investigating a Network request, first classify it as a global shell
request, a service-owned page request, or an action-triggered request. The
visible page can contain mounted components retained by the application shell.
