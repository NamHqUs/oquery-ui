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
is present. Indented lines under `Products:` offer fields and relations from
`Products`, while a new unindented line remains a header context and offers
all metadata entities, including `MyProducts`. Member completion is resolved
from the path after `.`; the all-metadata field list is used only when the
current entity cannot be resolved.

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

## Metadata toolbar transition

The metadata toolbar now switches its action set immediately when navigation
starts. This prevents the entity toolbar's `BUILT-IN · READ-ONLY` status from
painting briefly while navigating from a selected domain diagram back to the
Domains catalog. If an unsaved-changes guard cancels navigation, the previous
toolbar remains active.

Validation:

| Check | Result |
|---|---|
| `npm run build` from `src\Demo.Frontend` | Passed |
| Active browser: Domains → All → Domains | Passed; only domain actions were visible at 0–240 ms, and the read-only label had a 0 × 0 layout box |

The toolbar ownership was subsequently simplified so `MetadataBuilder` mounts
only the complete action group for the pending or active section. Inactive
entity and domain action groups are no longer rendered into hidden toolbar
slots.

The pending section update is committed synchronously before the asynchronous
dirty-state guard runs, preventing the previous group from painting for an
intermediate frame.

## Domain editing scenario validation

Validation date: 2026-11-10  
Environment: local API on `http://localhost:21210`, frontend on
`http://localhost:4173`, domain under test: `HR`.

Each mutation was performed as an isolated browser action. Before the action,
the complete `HR` JSON model was fetched from `GET /metadata/domains`. After
saving, the response was fetched again and compared against the expected
single change. The original JSON model was restored with `PUT /metadata/domains/HR`
after every test.

| # | Isolated action | Result | JSON comparison |
|---:|---|---|---|
| 1 | Edit domain name (`HR` → `HR QA Name`) | PASS | Saved model contained the new name; restore returned HTTP 200 |
| 2 | Edit description | PASS | Saved model contained `QA description`; restore returned HTTP 200 |
| 3 | Add entity (`Users`) | PASS | Entity count increased from 5 to 6 and `Users` was present |
| 4 | Update entity name (`Departments` → `Departments QA`) | PASS | Saved model contained `Departments QA` |
| 5 | Remove entity (`Locations`) | PASS | `Locations` was absent from the saved model |
| 6 | Add field (`QAField`) | PASS | `QAField` was present on `Departments` |
| 7 | Update field (`Id` → `Id QA`) | PASS | `Departments.fields` contained `Id QA` |
| 8 | Remove field (`Name`) | PASS | `Name` was absent and the remaining field list was preserved |
| 9 | Add relation (`QA Relation`) | PASS | Relation count increased and `QA Relation` was present |
| 10 | Update relation (`Employees` → `Employees QA`) | PASS | `Departments.relations` contained `Employees QA` |
| 11 | Remove relation | PASS | The selected relation was absent from the saved model |

### Finding

The field update was also attempted through the Domain Wizard's Step 2
generated entity preview. Editing the existing `Departments` field there did
not change the persisted JSON model. The same field update through the
diagram's visible Entity Definition editor passed. This is a scoped workflow
failure: existing-entity field edits should either be persisted by the wizard
or the wizard should clearly make the entity editor the required path.

### Final-state verification

The final `HR` model matched the original model used for each isolated test:

- 5 entities: `Departments`, `LeaveRequests`, `PerformanceReviews`,
  `Employees`, and `Locations`
- `Departments` fields: `Id`, `Name`
- `Departments` relation: `Employees`
- No temporary QA names, fields, relations, or descriptions remained

## Relation workflow scope clarification

The Domain Wizard edit flow is intended to edit the domain sources/entities and
their generated metadata. It is not the workflow for explicitly creating or
maintaining custom relations. Relation creation, renaming, and removal belong
to the Entity Definition editor, which exposes explicit relation controls.

Entity removal has an additional integrity requirement: removing an entity
must remove every relation that references it from both sides of the
relationship. No dangling relation may remain on another entity.

Every relation condition must also require both key columns: the From/source
column and the To/target column must be non-null and non-empty. Incomplete
relation conditions must not be saveable.

### Unsaved entity removal finding

Removing an entity in the Domain editor before saving currently filters the
entity from the selected list but does not remove relations pointing to that
entity from the remaining in-memory entities. For example, after removing
`Employees` from Healthcare, selecting `Visits` can still show a relation
referencing `Employees`.

Expected behavior: entity removal must immediately clean both sides of every
affected relation in the unsaved editor state, before the user saves or
selects another entity. The same invariant must also be enforced when the
domain is persisted.

The earlier check that renamed a relation in Entity Definition and then saved
through the Domain Wizard was a cross-workflow scenario and is therefore
**out of scope**, not a confirmed Domain Edit defect. Relation-specific
validation should be performed entirely in Entity Definition, with the JSON
model compared after each individual relation action.
