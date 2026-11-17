# Demo.Frontend project guidance

## Scope

This is the TypeScript frontend for the OQuery demo UI. It communicates with
the ASP.NET API in `OQuery.UI` and provides query building, metadata, reports,
data-source, and result experiences.

## Before changing code

- Search existing components, hooks, API clients, and shared types before
  creating a new one.
- Trace the API endpoint and DTO shape before changing a request or response.
- Reuse the established component, state-management, styling, and localization
  patterns in neighboring files.
- Check loading, empty, validation, error, and narrow-screen states.

## Generating code

- Keep components focused and preserve existing public props.
- Keep API calls in the existing client/service pattern rather than scattering
  fetch logic through presentational components.
- Preserve backend field names and query-definition semantics.
- Avoid unsafe `any` casts; define or extend shared TypeScript types.
- Do not introduce a frontend dependency without updating its manifest and
  validating the lockfile.

## Validation

Install dependencies only when required. Run the existing frontend lint/build
commands from this directory or the repository root, and manually verify the
affected flow when browser behavior changes.
