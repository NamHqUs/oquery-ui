# Validation

## YAML query-definition migration

- `dotnet build .\src\OQuery.UI.slnx --no-restore` passed.
- `dotnet test .\oquery\src\OQuery.UnitTest\OQuery.UnitTest.csproj --no-restore` passed:
  - .NET 8: 403 passed, 53 skipped
  - .NET 9: 403 passed, 53 skipped
  - .NET 10: 429 passed, 27 skipped
- `dotnet test .\src\OQuery.UI.UnitTest\OQuery.UI.UnitTest.csproj --no-restore` passed:
  - .NET 10: 12 passed
- `npm run build` passed from `src\Demo.Frontend`.
- `git diff --check` passed for the repository and the `oquery` submodule.

The remaining `ParseFromYml` references are for metadata authorization files,
not query definitions.
