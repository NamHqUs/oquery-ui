# OQuery UI

The UI, API, frontend, and demo projects for OQuery.
The OQuery engine is included as the `oquery` Git submodule.

Documentation is centralized in [`docs/`](./docs/README.md). Start there to find
the right file for product, frontend, project, engine, or report questions.

Clone with the submodule initialized:

```powershell
git clone --recurse-submodules <repository-url>
```

If you already cloned the repository, initialize the submodule with:

```powershell
git submodule update --init --recursive
```

## Run the demo

Install the **x64 .NET 10 SDK**, **Node.js with npm**, and **Windows Terminal**,
then run this from the repository root in PowerShell:

```powershell
.\demo-start.ps1
```

The script installs frontend dependencies on first run, then opens the API and
frontend in separate Windows Terminal tabs. The API's Swagger UI is at
<http://localhost:21210/swagger>; the frontend is at <http://localhost:5173>.

The API host and database-services project target x64 because the IBM DB2
provider requires an x64 process.

Configuration is split by responsibility under `OQuery` in `appsettings.json`:

- `OQuery:Seeds:BasePath` - root of the built-in data. `OQuery:Seeds:DataSets`
  lists the dataset subfolders to load (for example `northstar-demo`,
  `unit-test`). Each dataset may contain `domains/`, `queries/` and
  `scripts/`. `BuiltinDataLoader` (SetupTests) reads them, and the built-in data
  is read-only and handed to the repositories, which never seed it.
- `OQuery:Seeds:Enabled` / `DBVersion` - control database initialization scripts
  (`scripts/*.{provider}.sql` from the chosen datasets).
- `OQuery:Repositories:Files:UserData` - file repository root for user data
  (`UserData/{sectionId}/...`).
- `OQuery:Repositories:Postgres:ConnectionString` - when set, Postgres stores
  user Domains and Queries (built-in rows are seeded from the consumer).
- `ConnectionStrings:Analytics` - local development defaults this to the same
  Postgres connection, enabling the analytics tables; production can override
  it with `ConnectionStrings__Analytics`.
- `OQuery:DialectPackagesPath` - folder of dialect DLLs used to validate the
  provider selected with `PUT /db/connection`.

The database is connected directly with `PUT /db/connection` (provider and
connection string).

The API and demo projects are in `src/`; the OQuery engine is in
`oquery/src/OQuery.Core` (engine) and `oquery/src/OQuery.Abstracts` (input and output contracts). Build the complete solution with:

```powershell
dotnet build .\src\OQuery.UI.slnx
```

Run the provider tests against every database service with:

```powershell
docker compose -f .\oquery\docker\docker-compose.dbservers.yml up -d
dotnet test .\src\OQuery.UI.UnitTest\OQuery.UI.UnitTest.csproj
```

The core, DB-independent tests live in `oquery/src/OQuery.UnitTest` and run
without any database: `dotnet test .\oquery\src\OQuery.UnitTest\OQuery.UnitTest.csproj`.

The compose file starts SQL Server, PostgreSQL, CockroachDB, MariaDB,
Firebird, Oracle, SAP HANA, SQLite, and IBM Db2. The provider tests run all
cases on .NET 10; Db2 cases are intentionally skipped on .NET 8 and .NET 9
because the IBM native client is only available for the .NET 10 target.

If Windows reserves PostgreSQL's default host port, start the services with a
different host port. The container continues to use PostgreSQL's standard
internal port:

```powershell
.\oquery\docker\start-dbservers.ps1 -PostgresHostPort 15432
$env:POSTGRES_HOST_PORT = "15432"
```

Set `POSTGRES_HOST_PORT` before running the provider tests so their PostgreSQL
connection uses the same host port:

```powershell
dotnet test .\src\OQuery.UI.UnitTest\OQuery.UI.UnitTest.csproj
```
