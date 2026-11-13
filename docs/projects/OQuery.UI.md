# OQuery.UI project guidance

## Scope

This is the ASP.NET Core demo API host. It wires controllers, middleware,
configuration, Swagger, dependency injection, demo services, repositories,
database services, and file storage.

## Before changing code

- Read the endpoint/controller, contract DTO, service, and middleware chain
  before changing an API behavior.
- Search registration in `Program.cs`, configuration in `appsettings.json`,
  and relevant root `data-storage` fixtures.
- Check the UI solution and the `oquery` submodule reference before changing
  project paths or Docker behavior.
- Preserve existing HTTP status codes, problem-details handling, and Swagger
  metadata.

## Generating code

- Keep controllers thin; put business logic in `Demo.Services`.
- Use dependency injection and existing exception-handling middleware.
- Validate request models and return explicit, meaningful failures.
- Never expose secrets, connection strings, or filesystem internals.
- Keep paths portable and repository-root-relative; avoid machine-specific
  paths in project files, launch settings, or scripts.
- Update API documentation and frontend consumers when endpoint contracts change.

## Validation

Run `dotnet build .\src\OQuery.UI.slnx`. Build the Docker image when Dockerfile,
scripts, or container paths change.
