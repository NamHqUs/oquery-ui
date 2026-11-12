# Frontend API calls by page

This document describes which backend API requests the frontend can make for
each route. Requests marked **conditional** are sent only after a user action,
when a database connection is available, or when the relevant state is not
already cached.

The base URL is configured by `VITE_BACKEND_API_URL`. The endpoint names below
are relative to that base URL.

## Requests shared by the application shell

These requests are not owned by one page:

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /db/connections/provider` | Once when the application starts | Checks whether a database connection already exists and identifies the connected provider. |
| `POST /db/connect` | When the connection dialog is submitted | Connects using a configured profile or a direct provider and connection string. |
| `POST /db/disconnect` | When the user disconnects | Clears the active database connection. |

The connection dialog additionally calls:

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /db/connections` | When the connection dialog opens | Loads available providers, profiles, and whether direct connections are enabled. |

## Home page (`/`)

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /metadata/domains/names` | On page load | Selects the first available domain for the home playground. |
| `GET /metadata/domains/{domainId}` | After a domain is selected | Loads entity and relation metadata for the home playground. |
| `GET /metadata/functions` | On page load | Loads function definitions used by query suggestions and the playground. |

The global provider check also runs on this page.

## Query builder (`/query-builder`)

### Startup and domain selection

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /metadata/domains/names-with-descriptions` | When the query-builder sub-navigation loads | Populates the domain selector. The query builder currently uses this endpoint even though it only consumes `id` and `name`. |
| `GET /metadata/domains/{domainId}` | When the selected domain changes | Loads the selected domain's entities and relations. |
| `GET /metadata/functions` | When the selected domain is initialized | Loads available function definitions. |
| `GET /metadata/operators` | When the selected domain is initialized | Loads filter and expression operators. |
| `GET /query-request?domainId={domainId}` | When the selected domain is initialized | Loads saved query requests for the domain. |

### Query actions

| Request | When it is called | Purpose |
| --- | --- | --- |
| `POST /dynamic-query/query?domainId={domainId}` | Running a structured query | Executes the current query-builder definition. |
| `POST /dynamic-query/query/from-text?domainId={domainId}` | Running OQuery text | Parses and executes a text query. |
| `POST /dynamic-query/query/from-text/{context}?domainId={domainId}` | Running text for a selected context | Parses and executes text scoped to a context. |
| `POST /dynamic-query/query/to-string` | Previewing or converting a structured query | Converts a query definition to SQL text. |
| `POST /dynamic-query/query/to-string-from-text?domainId={domainId}` | Converting OQuery text to SQL | Converts text input to SQL. |
| `POST /dynamic-query/query/to-oquery` | Converting a structured query | Converts a query definition to OQuery text. |
| `POST /dynamic-query/query/from-oquery` | Loading or parsing OQuery text | Converts OQuery text to a query definition. |

### Saved query actions

| Request | When it is called | Purpose |
| --- | --- | --- |
| `POST /query-request` | Saving a new query request | Creates a saved query request. |
| `PUT /query-request/{id}` | Updating an existing query request | Saves changes to an existing request. |
| `DELETE /query-request/{id}` | Deleting a saved query request | Removes the request. |

## Metadata diagram (`/metadata/diagrams`)

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /metadata/domains/names` | When the diagram loads | Loads only domain IDs and names for the diagram domain selector and group labels. |
| `GET /metadata/domains/{domainId}` | After the diagram domain is resolved | Loads entities and relations for the selected domain. |
| `GET /db/schema` | When database schema is needed and a connection is available | Supplies database tables and relationships used by the diagram/entity editor. |

The diagram must use `/metadata/domains/names`, not
`/metadata/domains/names-with-descriptions`, because descriptions are not
rendered by the diagram.

## Domains page (`/metadata/domains`)

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /metadata/domains/names-with-descriptions` | When the page loads | Loads domain names and descriptions for the domain list. |
| `GET /metadata/domains/{domainId}` | When a domain is selected or edited | Loads the complete domain definition. |
| `GET /db/schema` | When database-backed domain editing is available | Loads tables and relationships for entity selection. |
| `POST /metadata/domains` | When a new domain is saved | Creates a domain. |
| `POST /metadata/domains/generate` | When a domain is generated from database metadata | Generates and creates a domain. |
| `PUT /metadata/domains/{domainId}` | When an existing domain is saved | Updates the domain definition. |
| `DELETE /metadata/domains/{domainId}` | When a domain is deleted | Deletes the domain. |

## Entity definitions

The entity list and entity create/edit routes are rendered by the metadata
workspace:

- `/metadata/entities`
- `/metadata/entities/{domainId}`
- `/metadata/entities/create`
- `/metadata/entities/edit/{domainId}`

These routes use the same domain and schema requests as the Domains page:

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /metadata/domains/names-with-descriptions` | When the entity workspace needs the domain list | Resolves the domain selector and domain context. |
| `GET /metadata/domains/{domainId}` | When a domain is selected or an edit route is opened | Loads entities and relations for that domain. |
| `GET /db/schema` | When database-backed entity creation/editing is used | Loads available database tables and columns. |
| `POST /metadata/domains` | When an entity create operation saves a new domain | Persists the containing domain. |
| `PUT /metadata/domains/{domainId}` | When an entity edit operation saves changes | Persists the containing domain. |

## Database explorer (`/metadata/explorer`)

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /db/schema` | After a database connection is available | Loads schemas, tables, columns, and relationships. |
| `GET /db/data/{tableName}?schema={schema}&limit=10` | When the table Data tab is opened | Loads a bounded preview of table rows. |

The table preview is limited to 10 rows by the frontend.

## Function definitions (`/function-definitions`)

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /metadata/functions` | When the page is first visited | Loads built-in and user-defined function definitions. |
| `GET /metadata/functions/{functionName}` | When a function is selected for editing | Loads the selected function. |
| `POST /metadata/functions` | When a new function is saved | Creates a function definition. |
| `PUT /metadata/functions/{functionName}` | When an existing function is saved | Updates a function definition. |
| `DELETE /metadata/functions/{functionName}` | When a function is deleted | Deletes the function definition. |

## Operator definitions

Operator definitions are managed inside the metadata workspace.

| Request | When it is called | Purpose |
| --- | --- | --- |
| `GET /metadata/operators` | When the operator section is first opened | Loads built-in and user-defined operator definitions. |
| `POST /metadata/operators` | When a new operator is saved | Creates an operator definition. |
| `PUT /metadata/operators/{operatorId}` | When an existing operator is saved | Updates an operator definition. |
| `DELETE /metadata/operators/{operatorId}` | When an operator is deleted | Deletes the operator definition. |

## Documentation (`/documentation`)

The documentation page does not make a page-specific API request. The global
provider check still runs because it belongs to the application shell.

## API ownership summary

| API group | Main frontend owner |
| --- | --- |
| `/db/connections*`, `/db/connect`, `/db/disconnect` | Database connection dialog and application shell |
| `/db/schema`, `/db/data/*` | Database explorer and metadata entity/domain editors |
| `/metadata/domains*` | Home, query builder, diagram, domains, and entity definitions |
| `/metadata/functions*` | Query builder, home, and function definitions |
| `/metadata/operators*` | Query builder and operator definitions |
| `/dynamic-query/*` | Query builder |
| `/query-request*` | Query builder |

When investigating a browser request, first identify whether it is a global
request, a page startup request, or an action-triggered request. A request
appearing while a page is visible may belong to a component retained by the
application shell rather than to the visible page itself.
