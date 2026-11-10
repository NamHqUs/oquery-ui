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
The Domains page renders only its **Create domain** toolbar action. The Diagram
page owns its separate **Save domain**, **Delete domain**, **Reload domain**, and
**Create domain** actions, with **Create domain** always rendered last. The
domain creation wizard is a separate page unit and owns its own Cancel, Back,
Next, and Generate metadata controls. Its actions must not be registered by or
shared with the Domains or Diagram pages.

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

## Expression builder debug visuals

The expression builder's debug outline, model tooltips, and model JSON panel are controlled by `debugUiEnabled` in the `queryBuilder` Redux state. To change what appears after a browser refresh, edit the `debugUiEnabled` value in the slice's `initialState` (`true` shows the debug UI; `false` hides it). This is a source-code flag and does not require a `.env` setting.

To change it at runtime, dispatch `setExpressionDebugUiEnabled(false)` to turn the debug UI off, or `setExpressionDebugUiEnabled(true)` to turn it back on. In Redux DevTools, dispatch the corresponding action as:

```json
{ "type": "queryBuilder/setExpressionDebugUiEnabled", "payload": false }
```

To change the default, edit `debugUiEnabled` in `src/components/query-builder/query-design/query-builder-slice.ts`. The persistent left borders on groups and field boxes are structural styling and remain visible.

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

```powershell
node --test .\src\components\oquery-editor\oquery-comments.test.mjs
node --test .\src\components\query-builder\query-design\oquery-feedback.test.mjs
node --test .\src\components\query-builder\query-design\query-loading.test.mjs
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
node --test .\src\components\query-builder\query-design\api-error.test.mjs
```

Saving in OQuery mode parses the current editor contents before persisting
the query. Removing `JoinType` preserves a null join through save and reload;
it is not replaced with `Left`. Run the saved-query round-trip regression with:

```powershell
node --test .\src\components\query-builder\query-design\query-save.test.mjs
```

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
