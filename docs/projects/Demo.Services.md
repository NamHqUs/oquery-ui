# Demo.Services project guidance

## Scope

This project contains application services for dynamic queries, metadata,
functions, operators, and reports. It coordinates contracts, repositories, and
the OQuery core engine.

## Before changing code

- Trace the incoming contract, repository interface, controller caller, and
  core OQuery API before changing a service method.
- Search provider-selection and operator/function registration paths before
  changing SQL generation.
- Read nearby exception handling and logging patterns.

## Generating code

- Keep orchestration in services and query compilation/execution in OQuery
  core; do not duplicate the engine.
- Preserve section/user isolation and configured storage-provider behavior.
- Validate input at the service boundary and return explicit errors using the
  established project conventions.
- Do not catch broad exceptions or convert failures into empty successful
  responses.
- Keep services testable through the existing interfaces and dependency
  injection.

## Validation

Run `dotnet build .\src\OQuery.UI.slnx`.
