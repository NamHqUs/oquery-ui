# Demo.Contracts project guidance

## Scope

This project defines the UI/demo contracts: DTOs, repository interfaces,
service interfaces, and application abstractions. It targets .NET 10 and
references the OQuery core library through the parent `oquery` submodule.

## Before changing code

- Read the interface and DTO files in the same namespace before adding a type.
- Search all implementations and consumers of an interface before changing its
  members; update every implementation and test together.
- Check nullable annotations, JSON serialization attributes, and existing
  naming patterns.
- Do not place business logic, database access, ASP.NET controllers, or
  frontend concerns in this project.

## Generating code

- Prefer small, explicit interfaces with dependency-inversion boundaries.
- Keep DTOs serialization-friendly and preserve existing property names.
- Use `IReadOnlyList<T>`/`IReadOnlyCollection<T>` for returned collections when
  callers must not mutate the contract-owned collection.
- Preserve async and cancellation-token conventions used by neighboring APIs.
- Reference core OQuery types only when they are part of the established
  contract; do not duplicate core models.

## Validation

Run `dotnet build .\src\OQuery.UI.slnx` from the UI repository root. If an
interface changes, run the focused UI unit tests and inspect all implementers.
