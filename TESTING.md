# Validation

## Gutter Run scroll flicker

- Reproduced a temporary page-height drop from 1381px to 1335px when execution
  removed the displayed three-row result. Gutter clicks also blurred and
  temporarily disabled the editor through validation.
- Gutter Run now preserves textarea focus and selection for pointer clicks;
  normal keyboard button activation remains available.
- Visual, text, and context executions retain displayed data/SQL during loading
  and mark the result section `aria-busy`. Success replaces the result; failure
  clears it and displays the error. Explicit edit-triggered clearing is unchanged.
- Verified the main-query gutter Run while scrolled to the page bottom:
  scroll position stayed at 481px, page height stayed at 1381px, all three rows
  remained visible, and the textarea stayed focused and enabled throughout.
  Busy status changed from true to false when the new result arrived.
- All 20 targeted tests passed, including loading, success, rejection, and
  explicit-clearing tests for all three execution actions.
- `npm run build` and `git diff --check` passed; the existing bundle-size
  warning remains.

## Query Builder validation feedback and first-click execution

- Validation feedback now occupies a permanent 52px scrollable area in the
  header above the OQuery editor, including loading, checking, success, and
  error states. No message is inserted below the editor.
- Kept the Check OQuery button label stable and added `aria-busy`; changing
  its label during blur validation previously caused an additional 18px
  header-wrapping shift.
- Verified on the user's open Query Builder screen with the Chain Reference
  query: one physical click on the result-grid Run Query button while the
  textarea was focused sent exactly one execution request and returned three
  rows. Blur validation displayed Valid OQuery in the reserved header area.
- Mutation measurements across checking, validation, execution, and results
  showed zero layout change in editor position/height, design section
  position/height, and result-grid action position/height.
- Browser measurement helpers were removed; query text was preserved and no
  query was saved or database connection changed.
- All 17 targeted frontend tests passed, including
  `oquery-feedback.test.mjs`, comment/CRLF regressions, layout, and folding.
- `npm run build` passed with the existing large-bundle warning.
- `git diff --check` passed.

## Home editor cursor alignment and comment undo

- Removed the home example's inherited 13px margin from the OQuery highlight
  layer. Browser measurements show zero horizontal and vertical offset between
  highlighted text and textarea content across all four home examples.
- Verified 24 click-to-caret positions at 1280px and 600px viewport widths,
  including positions before and after leading indentation.
- Verified insertion and backspace on an indented line, synchronized horizontal
  scrolling, and switching between SQL and OQuery examples.
- Ctrl+/ replaces the current line when no text is selected, or all explicitly
  selected lines, through the native textarea editing
  command instead of assigning React state directly. This retains browser undo
  history; unsupported editing commands report an explicit editor status.
- Comment highlighting is limited to individual lines, rather than extending
  from the first `#` through the rest of the context.
- Browser checks passed for current-line and selected-line comment undo/redo,
  uncomment undo, and undoing earlier typing after undoing a comment. Test
  queries were restored without executing or saving them.
- Verified actual forward and backward mouse drags select multiple lines and
  Ctrl+/ comments all selected lines. With no selection, only the current line
  receives `#`, and only that line receives comment coloring.
- Reproduced the first-comment CRLF corruption with the supplied six-line
  query: two extra spaces appeared and the next `Ref1` became `f1`.
- Normalized line endings at initial binding, subsequent text overrides, and
  imperative `setText`, so internal offsets match the textarea's LF values.
- Browser checks passed for the first comment, undo, redo, and uncomment with
  CRLF documents supplied through `initialText`, `value`, asynchronously bound
  `textOverride`, and imperative `setText`. Every case preserved `Ref1` and
  the original two-space indentation. Temporary test editors were removed.
- From `src\Demo.Frontend`, the targeted command passed (16 tests):

  ```powershell
  node --test .\src\components\query-builder\oquery-editor\oquery-comments.test.mjs .\src\components\query-builder\oquery-editor\oquery-editor-layout.test.mjs .\src\components\query-builder\query-design\oquery-folding.test.mjs
  ```

- `npm run build` passed; Vite reported the existing large-bundle warning.
- `git diff --check` passed.

## YAML query-definition migration

- `dotnet build .\src\OQuery.UI.slnx --no-restore` passed.
- `dotnet test .\oquery\src\OQuery.UnitTest\OQuery.UnitTest.csproj --no-restore` passed:
  - .NET 8: 403 passed, 53 skipped
  - .NET 9: 403 passed, 53 skipped
  - .NET 10: 429 passed, 27 skipped
- `npm run build` passed from `src\Demo.Frontend`.
- `git diff --check` passed for the repository and the `oquery` submodule.

The remaining `ParseFromYml` references are for metadata authorization files,
not query definitions.
