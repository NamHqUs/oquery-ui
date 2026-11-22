# oQuery Studio demo

This is the React/Vite front end for the oQuery demo. It demonstrates a metadata-driven query builder with:

- CSV upload and local sample data
- Selectable projection fields and aggregates, organized into drag-and-drop rows
- Dynamic filter controls and quick search
- A responsive dark data grid
- A Saved Queries library that distinguishes built-in and custom requests, loads a selected request into Query Builder, and saves/deletes custom requests per user section
- URL-backed pages with browser back/forward support; Query Builder inputs remain in place while visiting other pages and its design is restored after a refresh
- A Data Sources explorer with Data View and a draggable schema Diagram, including table columns, primary keys, foreign-key cardinalities, and a top-10 row preview

## Page lifecycle and toolbar ownership

Every frontend page is an isolated page unit. A page must define its own two
render functions:

```ts
renderButtons(): React.ReactNode
renderContent(): React.ReactNode
```

The main template invokes these functions only for the current page. The
toolbar is a layout host; it does not merge action groups, choose buttons, or
contain page state. Button visibility, disabled state, dirty state, and action
handlers belong to the page that renders the buttons.

Pages must not reuse another page's toolbar action component or action state.
The Projects page owns the **Create project** action and the project's
sub-domain actions. The Diagram page owns its own **Reload domain** and
sub-domain actions. Neither page shares action state with the other.

On the Diagram page, the toolbar has **Save**, **Reload**, **Edit**, and **Create**.
**Edit** opens `/domains/diagrams/edit/:projectId/main`, the domain wizard for the Main
domain. Step 1 connects to the database when no connection is active (the existing
connection form is shown inline) and then lists its tables. Deselecting a mapped table
removes its entity and relations on apply; new tables become entities with their
foreign keys as relations. **Create** opens `/domains/diagrams/create/:projectId`, which
builds a sub-domain from existing Main entities. Edit and Create are disabled while the
domain has unsaved changes. **Reload** refetches the domain from the server and asks
before discarding unsaved changes. Sub-domain editing is not part of this wizard.

The Data Sources page first loads the detected providers from
`GET /db/connections`, then connects directly with `PUT /db/connection`
(provider and connection string). Providers are the dialects registered from the
dialect DLLs. The core dialect/function-template UI also supports SAP HANA.
Connection strings are never returned to the frontend. The active database instance is
shared by all clients; `POST /db/disconnect` does not release or dispose it, so
one client's disconnect cannot interrupt other clients.

## Project and sub-domain identity and routing

Project and sub-domain names are display labels only. Every project lookup,
metadata request, selection, edit flow, and URL route must use the persisted
`id`; never use the display `name` as an identifier.

A project owns one FullDomain (every entity, field and relation from the
database schema) and any number of sub-domains. A sub-domain exposes a chosen
set of FullDomain entities and may rename entities, fields and relations. The
metadata API uses both IDs:

```text
GET    /metadata/projects/{project-id}
GET    /metadata/projects/{project-id}/domains/names
GET    /metadata/projects/{project-id}/domains/{domain-id}
GET    /metadata/projects/{project-id}/domains/{domain-id}/resolved
/metadata?section=diagram&project={project-id}&domain={domain-id}
```

`resolved` returns the sub-domain metadata after overrides, which is what
queries and the diagram use. The frontend may render names in bars, selectors and
headings, but it must resolve them back to IDs before loading metadata or
navigating.

Diagram uses the project and sub-domain selected in the workspace header, which is
the global selection shared with the Playground. It is served at
`/domains/diagrams/:projectId/:domainId`; the legacy `/metadata/diagrams` URL
redirects there. If no sub-domain is selected, or the current ID no longer
exists, it selects the first returned sub-domain before loading its graph.
The wizard routes are `/domains/diagrams/create/:projectId` and
`/domains/diagrams/edit/:projectId/:domainId`; the old `/domains/diagram` paths are removed.
The project page shows the FullDomain read-only and owns the generate action.
Sub-domain editing never changes physical columns, raw SQL or reference columns.

After connecting, the Data View groups tables by schema, displays column and relationship metadata, and previews up to 10 rows. Schema and relationship metadata come from `GET /db/schema`; preview data comes from `GET /db/data/{tableName}` with `schema` and `limit=10` query parameters. The schema Diagram is opened from the workspace header selection.

Run it with:

```powershell
npm install
npm run dev
```

## Projection condition arguments

Opening a calculation such as `CountIf(IsAbnormal = <true>)` displays its
condition argument as a labeled, read-only condition instead of a function
selector. Applying the calculation preserves the structured condition,
including its operand types and nested groups.

## Query Builder layout

Query Builder keeps the saved-query library beside the design workspace below the
domain bar. In **Plan text** mode, the design workspace is ordered top to bottom:

1. **Entity diagram** - the active domain metadata graph is shown above the
   OQuery editor. Its horizontal splitter resizes the diagram, and its toggle
   collapses or expands the diagram without losing its saved height.
2. **Query design** - the query name and OQuery editor. Validation feedback stays
   above the editor in a fixed-height area.
3. **Query result** - full width, with labeled **SQL** and **Run** actions and
   pagination below the grid.

The saved-query library uses the same `SavedQueryList` data and selection
behavior as before. Only the Plan text diagram/editor arrangement changed.

## OQuery text editor

The OQuery editor preserves leading spaces and aligns highlighted text with the
textarea caret.
Run the layout regression test with:

```powershell
node --test .\src\components\oquery-editor\oquery-editor-layout.test.mjs
```

Use **Ctrl+/** (or **Cmd+/**) to toggle comments on the current line when no text
is selected, or on all explicitly selected lines. Comment highlighting stops
at each newline; commenting a line does not gray out the rest of its context.
Comment toggles use native textarea edits, so **Ctrl+Z** undoes them and
**Ctrl+Y** or **Ctrl+Shift+Z** redoes them without discarding earlier typing
history. Leading indentation and blank lines are preserved.
Bound documents normalize CRLF and CR line endings to LF, matching native
textarea offsets. This prevents the first comment after loading Windows text
from adding indentation or deleting characters from the next context.

Query Builder reserves a fixed-height validation feedback area above the
OQuery editor. Loading, checking, success, and error messages do not move the
editor or the result-grid Run Query button; long messages scroll within that
area. The Check OQuery label stays fixed while its busy state is announced.
Blur validation remains enabled, and one click on the result-grid Run Query
button executes valid OQuery directly without requiring a second click.

Gutter Run controls preserve editor focus and selection instead of triggering
blur validation. Query execution keeps the displayed result (or SQL view)
visible while the result panel is busy, preventing a temporary page-height
collapse and scroll jump. Success replaces the displayed result; failure clears
it and shows the execution error. Editing still clears obsolete results.

In the inline-result editor, **Ctrl+Enter** runs the query. After a result is
shown, **Alt+Enter** places the caret on a new line below that result so another
query can be entered without moving the result out of view.

```powershell
node --test .\src\components\oquery-editor\oquery-comments.test.mjs
npx vitest run src\components\playground\playground-slice.test.mjs
```

Query Builder provides Visual and OQuery tabs in the page header. The OQuery tab
loads the canonical query request from the backend, supports editing or
creating a query definition, provides a starter **Template**, indentation with
the Tab key, line numbers, local syntax diagnostics, and backend-backed
**Format** and **Check OQuery** actions. Complete OQuery documents can be pasted
or replaced freely; required values are validated rather than blocking editing.
While
OQuery is selected, **Run query** and **Get SQL statement** execute the edited
text directly through the backend text-query endpoints.

API validation failures appear directly in Query Builder, OQuery actions, and
saved-query error messages. Each rejected field is listed with its context
and the server's validation explanation, rather than only the generic
validation-error title. Context indexes in server errors are displayed as
one-based numbers (for example, `Context 1 > Sorts`). Detailed server errors
are retained for non-validation failures as well.

Run the API error message regression tests with:

```powershell
node --test .\src\services\api-error.test.mjs
```

Saving in OQuery mode parses the current editor contents before persisting
the query. Removing `JoinType` preserves a null join through save and reload;
it is not replaced with `Left`.

All OQuery context keys share the gold color previously used for
functions. Functions use a darker muted blue, while schema keywords remain
purple.
Context names in `RefContext` values use the same gold as context definition
keys only when the referenced name exists in the `Contexts` dictionary,
including references inside context relations. Unknown references remain
normal text so invalid links are visible.

The OQuery line-number gutter provides collapse/expand buttons for indented
context definitions, projections, and relations.
Use **Collapse all** and **Expand all** for the whole editor.
Fold arrows are hidden until the pointer enters the line-number gutter. Once
the gutter is hovered, all foldable lines show their arrows. A collapsed line
keeps its right-pointing expand arrow visible; expanded lines show a
down-pointing collapse arrow.
Collapsed headers show a visual `...` suffix directly beside the parent text
with a soft background highlight;
neither decoration is inserted into the OQuery text. The collapsed header remains a
single editor line, and the suffix sits immediately beside the parent text.
Line numbers keep their original source positions, and folding never changes the saved/executed
document. Edits to visible lines preserve hidden children. If an edit spans
hidden content, the editor expands the document and asks you to retry rather
than accidentally deleting unseen OQuery text.
