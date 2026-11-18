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

Built-in datasets live under [`oquery/data-storage`](./oquery/data-storage), one
folder per dataset listed in `Setup:DataSets` (currently `northstar-demo` and
`unit-test`). Each dataset has the same layout:

- `domains/` - domain JSON files
- `metadata/` - metadata YAML/JSON files
- `queries/` - shared, read-only saved query JSON files
- `scripts/` - database schema and data scripts, named `{dataset}.{provider}.sql`

The built-in root is set by `Setup:BuiltinPath` (default `../../oquery/data-storage`).
User data stays under `Setup:FileStoragePath` (default `../../data-storage`) in
`UserData/{sectionId}/...`. Docker images include the built-in datasets
independently of the custom-data volume.

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
