# Demo.Repositories project guidance

## Scope

This project implements demo persistence and repository adapters, including
file-storage and in-memory repositories. It consumes contracts and shared
metadata but must remain independent of controllers.

## Before changing code

- Read the repository interface and every caller before changing persistence
  semantics.
- Inspect root `data-storage` conventions, file names, YAML/JSON shapes, and
  path layout before changing file-backed behavior.
- Search storage-provider registration and tests before adding an adapter.

## Generating code

- Keep file paths rooted in configured storage paths; do not use machine-local
  absolute paths.
- Validate file existence, serialization, and user/section isolation explicitly.
- Preserve atomicity and deterministic ordering where existing behavior relies
  on it.
- Surface malformed data and I/O errors; do not silently return empty data.
- Keep repository implementations free of HTTP/controller concerns.

## Validation

Run `dotnet build .\src\OQuery.UI.slnx` and the focused UI unit tests. Include
fixture updates when a serialized storage shape changes.
