# Bug Fix Report: Editor Selection, Count Engine, Aggregate Suggestions

## Changes

### 1. Editor: clicking a line number selected the whole row

- **Cause:** Monaco's `selectOnLineNumbers` option defaults to `true`. A click on
  the line-number gutter selects the whole line.
- **Fix:** [oquery-editor.tsx](/D:/SourceCode/Github/public/oquery-ui/src/Demo.Frontend/src/components/oquery-editor/oquery-editor.tsx)
  sets `selectOnLineNumbers: false` in the Monaco options.
- **Not affected:** the run-context glyph in the glyph margin, which only prevents
  focus stealing, and the fold controls.

### 2. Engine: `Employees.Count()` was rejected

- **Cause:** the `Count` builtin defaulted its argument to the `*` token. The
  engine rejects `COUNT(*)` on purpose, so the omitted-argument form failed too.
- **Fix:** the default is now the constant `1`, which renders `COUNT(@p0)` with
  parameter `1`. No column is read, and the row count is the same as counting a key.
- **Unchanged:** an explicit `Count("*")` or `COUNT(*)` is still rejected with
  `COUNT(*) is not allowed`.
- **Files:** [SqlFunctionDefinitionBuiltinBase.cs](/D:/SourceCode/Github/public/oquery-ui/oquery/src/OQuery/Contracts/SqlDialects/SqlFunctionDefinitionBuiltinBase.cs),
  [OQUERY-SYNTAX.md](/D:/SourceCode/Github/public/oquery-ui/oquery/OQUERY-SYNTAX.md),
  [07-aggregates-basics.md](/D:/SourceCode/Github/public/oquery-ui/oquery/docs/07-aggregates-basics.md).

### 3. Suggestions: aggregate functions were offered as general functions

- **Cause:** the general function list kept aggregates whenever the cursor was in a
  collection path (for example `Employees.Avg(`), so `Avg`, `Sum`, `Max` and others
  appeared inside an aggregate's own argument. Nested aggregates are not valid SQL.
- **Fix:** [oquery-completions.ts](/D:/SourceCode/Github/public/oquery-ui/src/Demo.Frontend/src/components/oquery-editor/oquery-completions.ts)
  filters with `!definition.isAggregate` from the function metadata. No names are
  hard-coded. The `collectionPath` helper is removed because nothing else used it.
- **Metadata check:** all listed aggregates exist in the builtin definitions
  (`Avg`, `AvgIf`, `Sum`, `SumIf`, `Max`, `MaxIf`, `Min`, `MinIf`, `CountIf`, `Count`).
  No definitions were missing.
- **Suggestion rules (current):**
  - After a collection dot (`Employees.`), only aggregates (`isAggregate`) are offered.
    Scalar functions such as `DateSub` are hidden because their first argument is not a collection.
  - After a lookup or scalar dot without a matching first argument, no function is offered.
  - In the root context, all functions are offered, including aggregates.
  - Inside an argument list, aggregates stay hidden (nested aggregates are not valid SQL).
  - Scalar receivers (`HireDate.`) offer only functions whose first argument has the same data type.
  - Collection-argument design: [FUNCTION-ARGUMENTS.md](/D:/SourceCode/Github/public/oquery-ui/oquery/FUNCTION-ARGUMENTS.md).

## Tests

| Area | Command | Result |
|------|---------|--------|
| OQuery engine (aggregate, count, function, SQL, authorization, query filters) | `dotnet test` in `oquery/src/OQuery.UnitTest` | 329 passed, 0 failed, 186 skipped (the skips are existing) |
| Completion suggestions | `node --test` on `oquery-completions.test.mjs` | 14 passed |
| Editor spec | `vitest run src/components/oquery-editor` | 12 passed |

Test changes:

- `FunctionMetadataTests`: `CountRejectsOmittedAndWildcardArguments` became
  `CountWithoutArgumentCountsRowsWithoutReadingAColumn`. It expects `COUNT (@p0)` and
  still expects the explicit `*` to be rejected.
- `SqlDiagnosticsTests`: `CountWithoutAFieldIsRejected` became `CountWithoutAFieldCountsRows`.
- `oquery-completions.test.mjs`: the aggregate-suggestion test now expects only
  `AnyFunction` inside `Employees.Avg(` and `Employees.Sum(`. Added cases for the
  collection-dot filter (`Employees.` shows only aggregates) and the root context
  (aggregates are offered).

## Not verified

- The editor click fix was checked against the Monaco source
  (`mouseHandler.js`: `selectOnLineNumbers`), not in a running browser.
- The frontend tests `query-loading`, `query-save` and `oquery-feedback` fail. They
  live in the query-builder folder and do not import the completion or editor code.
  I did not compare them against a clean baseline.

## Notes

- Git reports many modified `data-storage/` and frontend files that this change did
  not touch (for example the domain and query JSON files). They were left as they
  were.
- `COUNT(1)` counts the rows of the current collection without naming a column. The
  explicit `*` rule is kept. Confirm that the `COUNT(1)` behavior is acceptable under
  your authorization policy.
