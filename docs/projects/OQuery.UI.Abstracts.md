# Demo.Contracts project guidance

## Scope

This project defines the UI/demo contracts: DTOs, repository interfaces,
service interfaces, and application abstractions. It targets .NET 10 and
references the OQuery core library through the parent `oquery` submodule.

## Project model

A `ProjectDto` is the unit of metadata. Projects are stored as files only.

```text
projects/{projectId}/
  project.json        Id, Name, Description, DbConnectionProfile (name only)
  domains/
    main.json         Main domain, plus the FullDomain (every entity, field, and relation from the DB schema)
    {subDomain}.json  one SubDomain per file
  queries/            as before
  functions/          as before
```

- Legacy `domains/fulldomain.json` files are merged into `main.json` and deleted the first time
  the project's domains or FullDomain are read.
- `FullDomain` is generated from `LoadDatabaseSchema`. Entity and field names
  are the original physical names.
- A `SubDomain` lists only the entities it exposes. An entity that is not
  listed is excluded. A listed entity with no changes carries only its name.
- Overrides are keyed by original names:
  - `EntityName` renames an entity.
  - `Fields` maps an original field name to a new `Name`; `ExcludedFields`
    hides fields.
  - `Relations` keeps relation names on both sides. Relations are defined by
    physical column pairs (`RefKeys`), so excluding a field does not change a
    relation, and an entity without a reference field still joins.
  - Only `Name` can be overridden for entities, fields, and relations.
    `DbColumn`, raw SQL statements (`RawSqlEntity`, `RawField`), and reference
    DB columns stay as in the `FullDomain`.
- `MetadataProvider` resolves a request by starting from `FullDomain` and
  applying the chosen `SubDomain`.
- Security and permissions are out of scope for this model.

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
