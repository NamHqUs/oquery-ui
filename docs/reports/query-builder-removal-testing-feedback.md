# Query builder removal and frontend store split: testing feedback

## What changed

- `components/workspace-shell` renamed to `components/main-layout`
  (`MainLayout`, `MainLayoutSelect`, `main-layout*.css`).
- `prototype-select*` CSS classes renamed to `main-layout-select*`.
- `components/query-builder` removed. Its shared Redux slice was split into
  feature slices:
  - `components/metadata/metadata-slice.ts` (+ `metadata-model.ts`)
  - `components/function-definition/function-definition-slice.ts`
  - `components/saved-queries/saved-queries-slice.ts` (+ `saved-query-model.ts`)
  - `components/playground/playground-slice.ts` (inline results only)
- Request helpers (`requestQueryResultFromText`, `requestContextResultFromText`,
  `requestSqlStatementFromText`) and `QueryResult` moved to
  `services/dynamic-query-service.ts`.
- Editor helpers moved to `components/oquery-editor/` (context colors, folding,
  filter operators, `oquery-editor.css`). `api-error` moved to `services/`.
- `store/store.ts` keys: `metadata`, `functionDefinitions`, `savedQueries`,
  `playground` (replaces `queryBuilder`).
- `main.tsx`: `QueryBuilder` render and its navigation-guard plumbing removed.
  `/playground/:projectId/:domainId` (`PlaygroundWorkspace`) is unchanged.
- Dropped as builder-only: `executeQuery`, `getSqlStatement`,
  `saveQueryRequest`, `parseQueryRequestText`, `getQueryRequestText`, the
  definition-to-API conversion, and the global `result` state.

## Verification

### Build

- `npx vite build`: passes.

### Unit tests (`npx vitest run`)

| Run | Failing tests |
| --- | --- |
| HEAD (clean worktree) | 15 |
| This change | 11 |

- No new failures. The 11 remaining failures are the same ones that fail at HEAD:
  - 8 in `oquery-context-colors.test.mjs` (logic and CSS assertions)
  - 1 in `oquery-completions.test.mjs`
  - 2 in `api-services.spec.ts` (an `X-Client-Page` header added to requests)
  - `oquery-editor-layout.test.mjs` fails to parse at load
- Removed: 4 builder-only tests that were already failing at HEAD
  (`query-loading`: 2, `query-save`: 1, `oquery-feedback`: 1).
- New `playground-slice.test.mjs` (inline result loading, success, and failure
  transitions): passes.

### Type check (ad-hoc `tsc --noEmit` from `main.tsx`)

- No new error categories in the changed modules. Remaining errors are
  pre-existing patterns: untyped `getState()` and `dispatch` in thunks,
  `ImportMeta.env`, Monaco typings, and `FilterOperatorDefinition[]` passed as
  `string[]` in `oquery-editor.tsx`.

### Browser: style fingerprints (before vs after)

A fingerprint hashes the computed layout and typography of every element. The
project list is mocked through a route for `/metadata/projects`. No data is written.

| State | Before | After |
| --- | --- | --- |
| Home (`/`) | `b8752b78` (454 elements) | `b8752b78` |
| Playground (`/playground/Ujkpye68/main`) | `52dc2e20` (212) | `52dc2e20` |
| Queries view | `6d73c3f3` (191) | `6d73c3f3` |
| Project select open | `ab68da4a` (194) | `ab68da4a` |
| Project list (`/workspace`) | `9264b5ad` (54) | `9264b5ad` |
| Create project (`/projects/create`) | `5ac3a521` (78) | `5ac3a521` |

- All hashes match, so the `prototype-select` → `main-layout-select` rename did
  not change rendering.
- No page errors were raised during these navigations.

### Browser: populated state

With the domain, entity, and function endpoints mocked:

- Playground: "Available entities" lists `Employees` and `Departments` from the
  new metadata store. Screenshot checked.
- Queries view and project list: render as expected.
- Custom functions (`/functions`) and domain diagram (`/metadata/diagrams`):
  load with no page errors.

## Known gaps

- The inline run (Ctrl+Enter on a context) was not exercised in the browser. It
  is covered by `playground-slice.test.mjs` only.
- `components/saved-queries/saved-query-list.tsx` is not mounted anywhere now.
  Its only consumer was the builder. It is kept because saved queries are the
  next feature to wire up.
- Builder-only leftovers that do not affect reachable pages:
  - `components/oquery-editor/oquery-editor.css` still holds `.query-builder-*`
    and `.filter-row` rules from the old design view.
  - `main.tsx` `PageSubnav` has a `page === "builder"` branch that cannot be
    reached, because `/playground/:projectId` returns early.
  - `styles.css` and the main-layout CSS still use the `query-builder-*` class
    names for the domain bar and subnav.
- Other `prototype-*` class names (`prototype-logo`, `prototype-panel`, and so
  on) still use the old prefix. Only `prototype-select*` was in scope.
- `docs/frontend/studio-guide.md` still has the "Query Builder layout" narrative
  and the Visual/OQuery tab description. Those describe the removed page and need
  a product-owner rewrite.
- Git: the earlier moves used `git mv`, so some renames are staged. The newer
  moves are unstaged. Nothing is committed.

## Developer notes

- `main-layout` keeps its CSS class names (`workspace-shell`, `prototype-logo`,
  and so on). Only the component file and folder names changed.
- The playground store is independent of the builder. Future features should
  add their own slice next to the feature and register it in `store/store.ts`.
