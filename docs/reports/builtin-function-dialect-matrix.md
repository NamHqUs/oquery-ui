# Built-in function x dialect matrix

## Scope

- Test: `BuiltinFunctionDialectMatrixTests` (`src/OQuery.UI.UnitTest/Tests/Providers/BuiltinFunctionDialectMatrixTests.cs`).
- 44 OQuery queries, one per built-in function (including `Any`/`NotAny` in projection and `Where`), run on 9 dialects against the Sales domain.
- Dialects: SQLite (docker `main.db`), SQL Server, PostgreSQL, CockroachDB, MariaDB, Oracle, DB2, Firebird, SAP HANA.
- Pass criterion: the query compiles, executes, and returns at least one row. Result values are **not** yet compared with a reference.

## Results

| Run | Passed | Failed |
| --- | ---: | ---: |
| Initial run | 203 | 193 |
| After harness and data fixes | 337 | 59 |
| After engine and dialect fixes | 391 | 5 |
| Final | **396** | **0** |

Final suite results: matrix 396/396, full `OQuery.UI.UnitTest` 753/753, `OQuery.UnitTest` (core) 31/31.

## Bugs fixed

| Dialect | Function | Cause | Fix |
| --- | --- | --- | --- |
| All except SQL Server | `ElapsedYears` | Not in `BuiltinSqlFunctions.CreateAllFunctions`; SQL Server appended it itself | Added to the base list; removed the SQL Server duplicate |
| SQL Server (and any dialect) | `Any`, `NotAny` in SELECT list | A bare `EXISTS (...)` is a predicate, not a value | Projected collection predicates render as `CASE WHEN EXISTS (...) THEN 1 ELSE 0 END` (`SqlStatementGenerator.RenderProjection`). `Where` is unchanged. |
| PostgreSQL, CockroachDB | `ElapsedYears` | `EXTRACT(EPOCH FROM <integer days>)` is invalid | `((CAST(end AS DATE) - CAST(start AS DATE)) / 365.2425)` |
| Firebird | `ElapsedYears` | `EXTRACT(EPOCH ...)` is invalid | Same as above |
| Firebird | `DateAdd`, `MonthAdd`, `YearAdd` | PostgreSQL `INTERVAL '1 day'` syntax | `DATEADD(DAY|MONTH|YEAR, n, date)` |
| SAP HANA | `Day` | Registered as `DAYOFMONTH`, so `Day(...)` was unknown | Registered as `Day`, SQL remains `DAYOFMONTH` |
| DB2 | `CountIf` | Default row marker bound as an untyped parameter (SQL0418N) | DB2 override casts it: `COUNT(CASE WHEN {2} THEN CAST({1} AS INTEGER) END)` |

## Test and harness fixes

- `AnyWhere` lacked the comma after the projection, so the parser read `Id Where Items` as a relation. Fixed in the query text.
- `NotAnyWhere` had no matching rows (every order has an item). It now filters with `Quantity > <100>`.
- Flat-layout databases (MariaDB, Oracle, Firebird, SAP HANA) have no `SA`/`MAIN` schema prefix. The matrix drops `DbSchema` for them.
- `TestDatabase.GetNorthStarSqliteDockerConnection` now uses `Pooling=False`. It ATTACHes the same databases on every call, and pooled connections caused "database hr is already in use" in the full suite.
- `NorthStarDomainSqlServerTests.LoadDomain` and `GetDomainsRoot` are now `internal` so the matrix can reuse them.

## Environment notes (not code changes)

- SAP HANA: the container was empty. I loaded `northstar-demo.saphana.sql` with `hdbsql` (`NORTHSTAR`, 17 tables).
- Oracle: the entrypoint script runs only on an empty data volume, and this volume was reused. I loaded `northstar-demo.oracle.sql` as `NORTHSTAR` (16 tables).
- `docker-compose.dbservers.yml`, `sqlite` service: the init script path `/scripts/northstar-demo.sqlite.sql` is not mounted, so the container cannot rebuild its data. The existing `sqlite-data` files were used.
- The running OQuery.UI.Api (PID 20120, port 21210) locks `OQuery.UI.Api\bin`. I built the changed projects directly and built the test project with `-p:BuildProjectReferences=false`. The running API still uses the old binaries until it is restarted.

## Known issues not covered by the matrix

The matrix checks execution, not values. Code inspection found these, which I did not change:

- Firebird `Concat` ignores its separator argument: `({1} || ' ' || {3})`.
- Firebird `Round` ignores `digits`: `ROUND({1}, 2)`.

These should get value-level tests before the matrix can claim correctness.
