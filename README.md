# OQuery UI

The UI, API, frontend, and demo projects for [OQuery](https://github.com/NamHqUs/oquery).
The OQuery engine is included as the `oquery` Git submodule.

Clone with the submodule initialized:

```powershell
git clone --recurse-submodules https://github.com/NamHqUs/oquery-ui.git
```

If you already cloned the repository, initialize the submodule with:

```powershell
git submodule update --init --recursive
```

## Run the demo

Install the **.NET 10 SDK**, **Node.js with npm**, and **Windows Terminal**,
then run this from the repository root in PowerShell:

```powershell
.\demo-start.ps1
```

The script installs frontend dependencies on first run, then opens the API and
frontend in separate Windows Terminal tabs. The API's Swagger UI is at
<http://localhost:21210/swagger>; the frontend is at <http://localhost:5173>.

The API and demo projects are in `src/`; the OQuery engine is in
`oquery/src/OQuery`. Build the complete solution with:

```powershell
dotnet build .\src\OQuery.UI.slnx
```

Run the UI-specific tests with:

```powershell
dotnet test .\src\OQuery.UI.UnitTest\OQuery.UI.UnitTest.csproj
```
