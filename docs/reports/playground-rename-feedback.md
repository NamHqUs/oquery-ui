# Playground rename and tab fixes: feedback

## Changes

- **Double-click keeps the icon and layout.** Editing a saved playground or a tab now keeps the file icon in place. The saved item also keeps its unsaved marker while editing, so the row no longer shifts.
- **Saved playground rename is in memory.** Double-clicking the open saved playground renames it in the editor. The change is marked unsaved and is written only when Save is clicked. Renaming no longer writes the stored playground.
- **Non-open saved items.** Double-click only renames the open playground. Open another saved item first to rename it.
- **Tab border.** The selected editor tab sits above the strip's bottom line, so the line no longer runs under it.
- **Tab Escape.** Escape on a tab rename cancels cleanly. A blur that follows does not commit the draft.

## Round 2

- **Saved item edit:** the pencil icon replaces the saved icon in front of the name while editing. The name input takes only the space left in the row (`flex: 1 1 0; width: 0`), so the row no longer stretches.
- **Sidebar width:** the default Saved/Entities sidebar width increased from 150px to 240px (`ENTITY_WIDTH.default`). The maximum is unchanged.
- Build passes. The open browser tab still served the previous bundle when checked, so reload it to see the new width.

## Round 3

- **Row height:** saved rows now have a fixed 30px height with horizontal padding only, so the button and the edit input render at the same height.
- **Unsaved marker:** the trailing pencil and its "Unsaved changes" tooltip are removed from saved rows. The leading icon switches to the pencil while the open playground is dirty or being renamed, replacing the saved icon.
- The header's "Unsaved" status text and the unsaved-changes dialogs are unchanged.

## Round 4

- **Pencil color:** the leading pencil on a dirty or renaming row is yellow (`#f0b429`), the same color as the old right-side marker. The icon sits in a `playground-saved-icon` span so the color applies.
- **Icon shift:** the global `button` rule in `styles.css` sets `padding: 6px 10px !important`, which made button rows 4px wider than edit rows. The saved row now sets `padding: 0 6px !important` on `button.playground-saved-item`, so the icon keeps the same x-position when the input appears.
- Measured in the browser with injected row markup: row height 30px in both modes, icon at the same x-position, pencil color `rgb(240, 180, 41)`.

## Round 5

- **Header z-index:** `.playground-header` dropped from `z-index: 30` to `10`. It tied with the Project/Domain menu (`.main-layout-select-menu`, also 30) and, being later in the DOM, painted over the dropdown. It still sits above page content.
- **Domain switching:** the Domain dropdown options are clickable again. Checked in the browser: the menu receives the click, Main shows no saved playgrounds, and switching back to Examples lists "123".

## Files

- `src/OQuery.UI.Frontend/src/components/playground/playground.tsx`: `snapshotOf` includes the playground name; `renameSaved` replaced by in-memory `setPlaygroundName`; `SavedPlaygroundItem` and `PlaygroundTabButton` keep their icon during edit.
- `src/OQuery.UI.Frontend/src/components/main-layout/main-layout-compat.css`: active-tab bottom line, edit-mode tab label, saved-item input sizing.
- `docs/design/oquery-ui-prototypes.md`: rename behavior updated.

## Verification

- `npx vite build`: passes.
- `npx vitest run`: the playground has no spec. Failures are in `api-services.spec.ts` and `oquery-language.spec.ts`, which are outside this change.
- Not yet checked in a browser: the double-click feel and the tab border. Please check both in the Playground.

## Test checklist

1. Double-click the open saved playground: icon and unsaved marker stay, rename applies on Enter or blur, Escape cancels.
2. After renaming, the header and list show the new name with the unsaved marker. Reloading or switching away asks to discard or save. Save writes the new name.
3. Double-click a tab: icon stays, Enter or blur commits, Escape cancels.
4. The selected tab shows no line under it; unselected tabs keep the line.
