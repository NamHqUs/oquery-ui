# OQuery UI validation report

## Shared HomePage and Design Builder OQuery suggestions

The Metadata and Function Definition management pages previously kept their
own fetched entity and function arrays in component state. HomePage and
Design Builder consumed the Redux query-builder state, so the management
pages and consumers could become inconsistent.

The existing Redux query-builder slice is now the single global store for
managed metadata and function definitions. The management pages load and
refresh that store through the shared backend thunks; their local state is
limited to selection, drafts, dirty state, and page feedback.

The metadata transformation used by both editors is centralized in
`src\Demo.Frontend\src\components\oquery-editor\oquery-suggestion-data.ts`.
Both HomePage and Design Builder use this shared data for:

- Metadata entities
- Entity fields
- Entity relations
- Function definitions from the shared Redux store

Contexts and OQuery statements remain local to each editor, as intended.
OQuery keywords remain shared language definitions in the completion engine;
they are not duplicated by either page.

Validation:

| Check | Result |
|---|---|
| `npm run build` from `src\Demo.Frontend` | Passed after global-store refactor |

## Entity-scoped completion suggestions

Completion fallback now uses the resolved current entity when no relation path
is present. For example, `Products:` offers only fields and relations from
`Products`; relation paths continue resolving from the selected relation
target. The all-metadata field list is used only when the current entity
cannot be resolved.

## Remediation

The OQuery parse/check path now performs metadata validation after parsing:

- Unknown source entities are rejected.
- Unknown reusable-context source entities are rejected.
- Unknown direct fields are rejected.
- Unknown relation-path fields are rejected.
- Fields used inside functions, filters, and sort expressions are validated.
- Join references must resolve to an available context.

Reusable context suggestions and context actions use the context name from
`ContextName is SourceEntity:`, rather than the complete declaration header.

## Existing behavior verified

The parser already rejects unwrapped numeric constants with the documented
error requiring angle brackets, for example:

```text
Where Quantity > <10>
```

The current core parser test suite covers this behavior; no duplicate
validation rule was added.

## Validation results

| Check | Result |
|---|---|
| `dotnet build src\Demo.Services\Demo.Services.csproj --no-restore` | Passed |
| `dotnet test oquery\src\OQuery.UnitTest\OQuery.UnitTest.csproj --no-restore` (.NET 10) | Passed: 434, Failed: 0, Skipped: 27 |
| Same test suite (.NET 9) | Passed: 408, Failed: 0, Skipped: 53 |
| Same test suite (.NET 8) | Passed: 408, Failed: 0, Skipped: 53 |
| `npm run build` from `src\Demo.Frontend` | Passed |

The complete UI solution build was attempted. Compilation reached all changed
projects successfully, but the final copy step was blocked because the
running `OQuery.UI` process (PID 33784) had
`src\OQuery.UI\bin\Debug\net10.0\Demo.Services.dll` open.

The previously reported completion HTTP 400 was not reproduced from the
current frontend/backend request path, so no speculative fallback or silent
error handling was added for it.

## Monaco editor remediation

The editor-only follow-up pass added:

- Declared context names and projected aliases to completion candidates.
- Whitespace aliases such as `ProductId ProductKey` and
  `SUM(...) TotalRevenue` to the dynamic symbol table.
- Context projection fields for repeated context selections.
- Relation traversal from the active query source, so paths such as
  `Employees: Department.` resolve through `Employees -> Departments`.
- Deduplication of repeated context action buttons.
- Explicit Monarch token rules for clause keywords and function calls.

Validation:

| Check | Result |
|---|---|
| `dotnet build src\Demo.Services\Demo.Services.csproj --no-restore` | Passed |
| `npm run build` from `src\Demo.Frontend` | Passed |

The browser-only HTTP 400 completion report still requires a live Monaco
retest after restarting the backend so the rebuilt suggestion service is
loaded. SQL generation and query execution were intentionally excluded from
this pass.

## Live browser retest

After restarting the backend with the rebuilt assemblies:

- `ProductMaximum is ` now shows `ProductSales` as the first suggestion.
- `Employees: Department.` now shows related fields, including `Name`.
- The rebuilt endpoint returns `TotalRevenue` for the `Where` alias case.
- No new HTTP 400 completion errors were observed after cursor-position
  clamping during the focused retest.
- Monaco tokenization was subsequently refreshed when metadata and function
  definitions arrived.
- `SUM`, `Where`, and `Order` now receive distinct token styling.
- Entity and field metadata tokens remain distinct, and angle-bracket
  literals retain their literal styling.

## Alternate-port verification

The backend was also started on port `21211`, with a separate Vite instance on
port `4174`. The frontend initially called the alternate backend directly and
hit browser CORS errors. Vite configuration now separates the browser API base
URL from the proxy target through `VITE_BACKEND_PROXY_URL`, allowing the
frontend to remain same-origin while proxying to another backend port.

Verified at `http://127.0.0.1:4174/query-builder?mode=oquery`:

- `ProductMaximum is ` shows `ProductSales` first.
- The suggestion request reaches port `21211` through the Vite proxy.
- Frontend production build passes.

Direct relation completion was also verified for the live `Users` metadata
entity. `Users: ` returns both metadata fields and relation candidates,
including `MemberPolicies`, `Orders`, `PatientVisits`, `FirstName`, `LastName`,
and `Id`. Normal entity headers are no longer mistaken for empty reusable
contexts during completion.

The backend startup path was also repaired to match the current core parser
API. Context execution now parses the document once and selects the requested
context from the parsed context map, allowing the service to build and remain
available on port `21211`.

## Monaco tokenization lifecycle

The editor now reconfigures the OQuery language when metadata or function
definitions change, reassigns the mounted model to `oquery`, and enables
case-insensitive Monarch matching. Function-call tokens use the visible
keyword token category so they remain distinguishable in the active theme.
