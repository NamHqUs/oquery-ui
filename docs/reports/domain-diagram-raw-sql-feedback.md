# Domain Diagram: raw SQL flag ignored

## Problem

An entity mapped to a table (`IsRawSql: false`, e.g. `Customers` -> `Users`) was shown as a raw SQL statement in the entity editor, and the diagram card did not reflect the entity mode.

## Root cause

- The API already returns and persists `IsRawSql` on each entity (`EntityDto.IsRawSql` in `src/OQuery.UI.Abstracts/Dto/DomainDto.cs`), but the frontend dropped it (`DomainEntityDto` / `MetadataEntity` / `toEntityPayload`).
- `entity-definition.tsx` guessed raw SQL mode from `rawSql !== entityName`. When the mapped table is not loaded (for example, a SQLite `main` schema on a SqlServer connection), that guess was always true.

## Change

- `MetadataEntity` and `DomainEntityDto` carry `isRawSql`; `toEntityPayload` sends it back on save.
- The entity editor uses `draft.isRawSql` as the only source of truth. The "Raw SQL Statement" menu item sets it to `true`; "Switch to table selection" and choosing a table set it to `false`.
- `DiagramTable.isRawSql` is set by `toDiagramTables`; the diagram card shows a `code` icon for raw SQL entities and the `table` icon otherwise.

## Testing

- `npx vitest run src/components/domains`: 9/9 pass, including the new `toDiagramTables` case.
- Browser (Domain Diagram, `KtrPNRg3` / `Examples_Domain`): `Customers` opens in table mode after reload; switching to raw SQL shows the SQL box, and switching back restores table mode.
- Unrelated pre-existing failures: `api-services.spec.ts` and `oquery-language.spec.ts` (12 tests).

## Follow-up: schema case mismatch

- Saved schema `main` (lowercase) did not match the database schema `Main`, so the entity-to-table lookups failed. Effects: the editor showed "Select a table" for Customers, and the diagram did not flag Customers as differing from the database while Sellers (saved as `Main`) was flagged.
- Fix: `isSameSchema` in `domain-model.ts` compares schemas case-insensitively; it is used by the editor's selected-table lookup (`domain-page.tsx`) and by `dbSchemaChangedEntityNames` (`diagram-model.ts`).
- Verified in browser: Customers shows "Main.Users" in the table picker and is flagged "differs from database schema", the same as Sellers. No console errors.

## Notes

- Entities saved without an `IsRawSql` value are treated as table-mapped. Raw SQL entities saved by older builds need `IsRawSql: true` in their JSON to keep raw mode.
- The card icon is not visible while an entity has unsaved edits (`editing` status hides the icon), which is existing behavior.
- `Customers` shows "Select a table" because its saved schema `main` does not exist on the connected SqlServer database. This is a data mismatch, not a code issue.
