# Inline result SQL copy button — testing feedback

## Change

- `src/OQuery.UI.Frontend/src/components/oquery-editor/oquery-inline-result.ts`: when the result view is in **SQL** mode and SQL is available, the header shows a copy icon button. Clicking it writes the SQL to the clipboard, and the icon turns green with a "Copied" title for 1.5 seconds. Failures show "Copy failed" in the title.
- `src/OQuery.UI.Frontend/src/components/oquery-editor/oquery-inline-result.css`: styles for `.query-oquery-inline-copy` (hover and `.copied` states).

## Verification

- `npx vite build` in `src/OQuery.UI.Frontend`: passed.
- `npx vitest run src/components/oquery-editor`: 86 passed, 10 failed. All 10 failures are in `oquery-language.spec.ts` (syntax highlighting). That file does not import the inline result module, so these failures are unrelated to this change. I did not check them against a clean baseline.

## Manual checks to run

- Run a query in the OQuery editor, switch the result to **SQL**, and click the copy icon. Paste into another editor and confirm the text matches the displayed SQL.
- Switch to **Data** mode and confirm the copy icon is hidden.
- Open a context with no SQL yet and confirm no copy icon appears.

## Developer notes

- The header is built with DOM APIs, so the icon is an inline SVG rather than the React `Icon` component.
- The copy button stops `pointerdown`/`mousedown` propagation through the existing node listeners, so Monaco does not steal the click.
