# Demo.DbServices project guidance

## Scope

This project contains database-provider services used by the demo API,
including connection setup, schema access, provider selection, and database
scripts/configuration integration.

## Before changing code

- Trace the relevant contract in `Demo.Contracts` and all controller/service
  callers before changing behavior.
- Search provider-specific branches and configuration keys before adding a
  provider or changing defaults.
- Inspect the matching SQL scripts under `scripts/` and Docker service
  configuration before changing initialization behavior.
- Treat connection strings and credentials as configuration; never hard-code
  secrets or log them.

## Generating code

- Keep provider-specific behavior behind existing abstractions.
- Surface connection and schema errors explicitly; do not swallow exceptions or
  return success-shaped empty data.
- Preserve the configured provider names and database schema conventions.
- Keep SQL parameterized and preserve existing identifier quoting rules.
- Ensure Docker and local development paths work from the repository root.

## Validation

Run `dotnet build .\src\OQuery.UI.slnx`. For provider changes, start only the
required Docker service and run the matching focused integration tests.
