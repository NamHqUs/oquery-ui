# Playground save and saved-playground tab: developer notes

## Storage layout

```
projects/{projectId}/{domainId}/playground/{id}.json
```

- Each saved playground is one JSON file holding `Id`, `Entity`, `DomainId`, and `Tabs` (`Title`, `Content`).
- `Content` is raw OQuery text. Saving does not parse or validate it.
- `queries/` and `domains/{domainId}.json` are unchanged. Moving them into the domain folder is a separate migration.

## API

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/playgrounds?projectId=&domainId=` | Lists playgrounds for one domain. |
| GET | `/playgrounds/{id}?projectId=&domainId=` | Returns one playground or 404. |
| POST | `/playgrounds?projectId=` | Body is `PlaygroundDto`. Returns 201. |
| PUT | `/playgrounds/{id}?projectId=` | Body's `DomainId` selects the file. Returns 404 if missing. |

The route is `playgrounds` rather than `playground` because the frontend already uses `/playground/:projectId/:domainId` for pages, and the Vite proxy would capture it.

## Frontend

- **Current playground** is either **New** (default, no saved selection) or **Saved** (a saved item is selected).
  - New shows **Save**. Saved shows **Save** and **Delete**.
  - The status line above the tabs shows the state and an "Unsaved changes" marker when the tabs differ from the last loaded or saved snapshot.
- **Switching** to another saved playground or to New while there are unsaved changes opens a dialog with Save, Discard, and Cancel. Save runs the save first (asking for a name if the playground is New), then switches. Re-clicking the playground that is already open does nothing.
- **Delete** asks for confirmation, then calls `DELETE /playgrounds/{id}?projectId=&domainId=` and returns to New.
- **Tab names** are editable: double-click a tab, then press Enter or click away to commit. Escape cancels, and an empty name keeps the old one.
- The entity panel has an **Entities / Saved** switch. Saved lists the current domain's playgrounds by name.
- Opening a saved playground replaces the tabs with its content and restores its name.
- Switching domains keeps the typed text as a New playground, so it does not trigger the unsaved-changes dialog.

## Testing

- `dotnet test OQuery.UI.Api.UnitTest --filter FileRepositoryProviderTests`: 7 passed, including `PlaygroundIsStoredInsideDomainPlaygroundFolder`.
- `npx vite build`: passes.
- `npx vitest run`: 12 tests fail in `oquery-language.spec.ts` and `api-services.spec.ts`. Those files are not touched by this change. I did not check them against the base commit.
- A running `OQuery.UI.Api` process locks the default output folder, so the test run used a temp `-o` folder.

## Manual checks

1. Open a domain in the playground, type a context block, and click Save. Confirm the file appears under `projects/{projectId}/{domainId}/playground/`.
2. Click Save again. Confirm the same file is updated.
3. Switch to the Saved tab and open the playground. Confirm the tabs are restored.
4. Switch domains. Confirm the Saved list shows only that domain's playgrounds.
