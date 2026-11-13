# Demo.Share project guidance

## Scope

This project contains shared demo metadata and demo-only definitions consumed
by repositories, services, and UI tests. It references the OQuery core model.

## Before changing code

- Search every consumer of `BuiltinMetadata` before changing entity names,
  schemas, fields, or relationships.
- Compare metadata with the matching SQL schema and database seed scripts.
- Keep demo metadata separate from core engine behavior.

## Generating code

- Preserve entity and relation names used by saved query definitions.
- Keep schema/table mappings and relation key direction explicit.
- Prefer immutable/read-only collection exposure for shared definitions.
- Do not add UI, HTTP, persistence, or provider-connection logic here.

## Validation

Run `dotnet build .\src\OQuery.UI.slnx`. For metadata changes, run the
affected UI and database integration tests.
