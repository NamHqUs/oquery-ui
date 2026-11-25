# Load Project From Disk: testing feedback

## Scope

- `/workspace` (reached from Home > Try Playground) always shows: the project list, **New project**, and **Load Project From Disk**. The page no longer redirects to `/projects/create` when there are no projects.
- **Load Project From Disk** picks a project folder with `showDirectoryPicker` (Chromium only; the button is disabled elsewhere). It reads `project.json`, `domains/*.json`, `queries/*.json` and `{domainId}/playground/*.json`, then posts them to `POST /metadata/projects/import`.
- Import rules: the project ID is kept when free and replaced otherwise; the encrypted connection is kept as stored and must decrypt with this server's key; project and domain names must be unique; nothing is written on failure.

## Automated checks

| Check | Result |
| --- | --- |
| `ProjectServiceTests` (NUnit, `OQuery.UI.Api.UnitTest`) | 9 passed, including 4 new import tests |
| `project-folder-reader.spec.ts` (Vitest) | 2 passed |
| `vite build` (frontend) | Passed |
| Full frontend Vitest run | 12 failures in `oquery-language.spec.ts` and `api-services.spec.ts`. Those files are not part of this change; they were not investigated. |

## Manual API check (separate API instance on port 5555)

- Import of a sample bundle returned 201 and wrote `project.json`, `domains/main.json`, `queries/q1.json` and `main/playground/pg1.json`, matching the layout the reader expects.
- Re-importing the same name returned 400 ("A project named 'Imported demo' already exists.").
- A taken project ID was replaced with a new ID.

## Not verified

- The browser flow (picking a real folder in Chromium and landing on the playground) was not exercised end to end. The running dev API process was left untouched.
- Importing a carried connection encrypted with a different key was covered by a unit test, not by a live run.
- Legacy-format folders (`domains/fulldomain.json`, or a domain file with `FullDomain`) are rejected with a message asking the user to open the project once in the current version.

## Developer notes

- Import validation runs before the first write. A failure after the first write deletes the project folder, as `CreateFromDatabase` does.
- The import returns the project from the request and does not connect to its database, so a database that is down does not block an import.
- IDs in the import are limited to ASCII letters, digits, `-` and `_`, because they become folder and file names.
