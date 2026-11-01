# OQuery UI workspace instructions

This repository is a split .NET/TypeScript workspace. Before searching for
code or generating changes, identify the project directory containing the
target file and read its nearest `ProjectName.AGENT.md` file.

## Project instruction map

- `src/Demo.Contracts/**` -> `src/Demo.Contracts/Demo.Contracts.AGENT.md`
- `src/Demo.DbServices/**` -> `src/Demo.DbServices/Demo.DbServices.AGENT.md`
- `src/Demo.Frontend/**` -> `src/Demo.Frontend/Demo.Frontend.AGENT.md`
- `src/Demo.Repositories/**` -> `src/Demo.Repositories/Demo.Repositories.AGENT.md`
- `src/Demo.Services/**` -> `src/Demo.Services/Demo.Services.AGENT.md`
- `src/Demo.Share/**` -> `src/Demo.Share/Demo.Share.AGENT.md`
- `src/OQuery.UI/**` -> `src/OQuery.UI/OQuery.UI.AGENT.md`
- `src/OQuery.UI.UnitTest/**` -> `src/OQuery.UI.UnitTest/OQuery.UI.UnitTest.AGENT.md`
- `oquery/src/OQuery/**` -> `oquery/src/OQuery/OQuery.AGENT.md`
- `oquery/src/OQuery.UnitTest/**` -> `oquery/src/OQuery.UnitTest/OQuery.UnitTest.AGENT.md`

For cross-project work, load every mapped file for the projects being changed.
Search existing symbols, project references, tests, and documentation before
adding new abstractions. Keep the `oquery` submodule boundary intact: UI code
may reference the core project, while core code must not reference UI or demo
projects.

Use the smallest relevant build or test command after changes. Do not commit
generated `bin`, `obj`, frontend dependency, or build-output directories.
