# OQuery Editor — Gap Analysis and Implementation Status

Scope: review of `oquery-editor-implementation-and-testing.md` against the
`Demo.Frontend` editor, the Monaco migration made in this pass, and what remains.

## 1. Architecture after this pass

| Responsibility | File |
|----------------|------|
| Editor component (Monaco host, props contract, Enter / Run-selection keys, external text sync, error marker, context decorations) | `src/Demo.Frontend/src/components/oquery-editor/oquery-editor.tsx` |
| Monaco setup (worker, language, theme, global providers dispatched by model URI) — the only module importing `monaco-editor` | `oquery-monaco-setup.ts` |
| Language definition (Monarch tokenizer, language configuration) — pure | `oquery-monaco-language.ts` |
| Monaco shape adapters (completion snippets, folding ranges, context lenses, error range, minimal edits) — pure | `oquery-monaco-adapters.ts` |
| OQuery list-aware Enter behavior — pure | `oquery-editor-enter.ts` |
| Completions / validation / comments / folding ranges / context keys — pure services | `oquery-completions.ts`, `oquery-validation.ts`, `oquery-comments.ts`, `query-design/oquery-folding.ts`, `query-design/oquery-context-colors.ts` |
| Monaco test double for DOM tests | `monaco-test-double.ts` |

Removed in this pass: the textarea-over-overlay editor, its custom undo/redo
stacks, the folding projection (`getFoldedOquery`, `applyFoldedOqueryEdit`),
the textarea keyboard module, and the line-command module written earlier in
this pass (Monaco provides these commands natively).

## 2. Decisions taken

- **Engine:** Monaco Editor 0.57.0 (`monaco-editor` dependency). Chosen by the user.
- **DOM harness:** Vitest 5 + jsdom, `*.spec.tsx` files (`npm run test` runs
  both the `node --test` suites and Vitest).
- **Ctrl+Enter:** with a selection, runs the selected text (existing behavior);
  without a selection it uses Monaco's native Insert Line Below. Chosen by the user.

## 3. Status against the specification

Status: **Done** (implemented and checked), **Native** (Monaco built-in, not
individually verified in the browser), **Partial**, **Missing**.

### 3–4. Architecture and basic editing

| Spec item | Status | Notes |
|-----------|--------|-------|
| Engine reuse for text editing, undo/redo, multi-cursor, folding, search | Native | Monaco replaces the custom textarea logic. |
| Undo / Redo, Cut / Copy / Paste, Select All | Native | Copy/cut with no selection copies the line (Monaco default). |
| Delete / Duplicate / Move / Insert line | Native | Monaco actions; keybindings are Monaco defaults. |
| Indent / Outdent, Toggle Comment | Native | `#` line comments via language configuration; 2-space indent. |
| Enter inside OQuery list sections | **Done** | `oquery-editor-enter.ts`, covered by unit and DOM tests. |
| Join Lines, Trim Trailing Whitespace | Native, unbound | Monaco actions exist; no keybinding or menu entry added. |
| Sort lines, remove empty lines | Missing | Product decision. |

### 5–6. Selection and navigation

Character, word, line, document selection, Go to Line (Ctrl+G), matching
bracket, add cursor above/below, column selection, and expand/shrink selection
are **Native** in Monaco. None were exercised in the browser yet.

### 7. Find and replace

**Native** (Monaco find/replace widget, Ctrl+F / Ctrl+H, regex, case, whole
word). Not yet exercised in the browser.

### 8–9. Multi-line and code features

| Spec item | Status |
|-----------|--------|
| Folding | Native, driven by `getOqueryFolds` through a folding range provider |
| Line numbers, read-only, word wrap off, minimap off | Done (options) |
| Auto-closing brackets and quotes | Done (language configuration) |
| Bracket matching highlight | Native |
| Active-line highlight | Done (`renderLineHighlight: "line"`) |
| Whitespace rendering, font size shortcuts, theme switch | Missing |
| Performance measurement, debounced language work | Missing; completions and decorations are recomputed on content change |

### 10. OQuery language integration

| Spec item | Status | Notes |
|-----------|--------|-------|
| Syntax highlighting | Done | Monarch tokenizer, function names from metadata; context-key colors via decorations. |
| Entity / field / relation / function completion | Done | Completion provider wraps `getOQueryCompletions`; snippet caret stops from `cursorOffset`. Not yet exercised in the browser. |
| Hover, signature help | Missing | |
| Diagnostics | Partial | One error marker from `errorPosition`, with the server message. Multiple diagnostics not supported. |
| Formatting | Missing | No safe formatter exists; the spec asks for an interface and a report. |
| SQL preview / validate / execute | Partial | Run selection and Run context (CodeLens) only. |

### 11. Keyboard shortcuts

- Monaco defaults are used. The only custom binding is Ctrl/Cmd+Enter with a
  selection (Run), and plain Enter in OQuery sections.
- Shortcut definitions are still split across `oquery-editor.tsx` (custom keys)
  and Monaco's defaults. The spec asks for one central table; not done.
- Save (Ctrl+S) ownership is still undefined.

### 12–13. UI and configuration

Missing: toolbar, status bar (line/column), theme switch, font-size shortcuts,
persisted editor settings. A dark theme (`oquery-dark`) matches the previous palette.
Monaco's built-in context menu is available but not reviewed.

## 4. Behavior changes

- Run-context button is now a CodeLens shown for every context header.
  `showContextRunAlways` was removed; its only caller in `home-page.tsx` was updated.
- Fold controls are Monaco's gutter folding; `showFoldControls` maps to `folding`.
- Validation errors show a Monaco marker with the message from `errorMessage`
  (`query-design.tsx` now passes `oqueryError`).
- Editor CSS: the overlay rules in `query-design.css` were replaced. Dead
  `:has(.query-oquery-completions)` z-index rules were removed from
  `query-design.css`, `query-builder.css`, `home.css`, and `home-landing.css`.
- `oquery-folding.ts` keeps only `getOqueryFolds`; its projection functions and
  their tests were removed.

## 5. Verification

Commands and results:

```text
npx vite build                                  -> built successfully
npx vitest run (src/**/*.spec.tsx)              -> 6 passed
node --test oquery-monaco.test.mjs              -> 8 passed
node --test (all oquery-editor + query-design)  -> 42 tests: 30 pass, 12 fail
```

The 12 failures are the same pre-existing failures as before this pass (CSS
and highlight assertions in `oquery-context-colors.test.mjs`, `oquery-editor-layout.test.mjs`,
`oquery-feedback.test.mjs`, and `query-loading.test.mjs` / `query-save.test.mjs`).
They are unrelated to the editor migration and were not changed.

Browser smoke test (Vite dev server, Chromium through the integrated browser):

- The home page renders with no runtime error. The first run exposed a real bug
  (`brackets` must be `[open, close]` tuples); it is fixed.
- Two Monaco instances mount; OQuery tokens and context-key decorations render.
- A real Enter keystroke in the playground inserts a line through the OQuery handler.

Not verified in the browser: completion popup, find/replace, multi-cursor,
Run-selection on Ctrl+Enter, CodeLens click, error marker rendering.

Notes:

- Port 4173 was already in use on this machine, so the dev server ran on 4174.
- Type checking: the project has no `tsconfig.json`. A temporary `tsc` run over
  the editor files reported no errors in the new modules; the remaining errors
  are in pre-existing files (`query-builder-slice.ts`, `oquery-completions.ts`).

## 6. Decisions still open

1. Whether to bind Join Lines and Trim Trailing Whitespace (no keybinding exists).
2. Whether Save (Ctrl+S) belongs to the editor or the host page.
3. Whether to register a formatter for OQuery (the spec says not to write a fragile one).
4. Whether hover and multiple-diagnostic support are in scope for this phase.

## 7. Corrections needed in the specification

1. §11.2 Expand/Shrink Selection (macOS): `Ctrl + Shift + Cmd + Right` is not the
   VS Code mapping; VS Code uses `Shift + Option + Right/Left`.
2. §11.1 Ctrl+Enter: state that Run-selection takes precedence when text is selected.
3. §11.1 Save: state who owns it.
4. §3 "Keep the generic editor separate": describe the current split (see section 1).
5. §10 Syntax highlighting: frontend has no parser; highlighting is a Monarch tokenizer.
6. §14 Testing: the repo now has Vitest + jsdom with a Monaco test double; the
   spec's "real editor" shortcut tests still need a browser runner such as Playwright.

## 8. Files changed in this pass

New:
- `src/Demo.Frontend/src/components/oquery-editor/oquery-monaco-setup.ts`
- `src/Demo.Frontend/src/components/oquery-editor/oquery-monaco-language.ts`
- `src/Demo.Frontend/src/components/oquery-editor/oquery-monaco-adapters.ts`
- `src/Demo.Frontend/src/components/oquery-editor/oquery-editor-enter.ts`
- `src/Demo.Frontend/src/components/oquery-editor/oquery-monaco.test.mjs`
- `src/Demo.Frontend/src/components/oquery-editor/oquery-editor.spec.tsx`
- `src/Demo.Frontend/src/components/oquery-editor/monaco-test-double.ts`
- `src/Demo.Frontend/vitest.config.ts`
- `docs/reports/oquery-editor-gap-analysis.md` (this report)

Rewritten or changed:
- `src/Demo.Frontend/src/components/oquery-editor/oquery-editor.tsx`
- `src/Demo.Frontend/src/components/query-builder/query-design/oquery-folding.ts`
- `src/Demo.Frontend/src/components/query-builder/query-design/oquery-folding.test.mjs`
- `src/Demo.Frontend/src/components/query-builder/query-design/query-design.tsx`
- `src/Demo.Frontend/src/components/query-builder/query-design/query-design.css`
- `src/Demo.Frontend/src/components/query-builder/query-builder.css`
- `src/Demo.Frontend/src/components/home/home-page.tsx`
- `src/Demo.Frontend/src/components/home/home.css`
- `src/Demo.Frontend/src/components/home/home-landing.css`
- `src/Demo.Frontend/package.json` and `package-lock.json` (monaco-editor, vitest, jsdom; `test` script)

Removed:
- `oquery-editor-keyboard.ts`, `oquery-editor-line-commands.ts`, `oquery-editor-line-commands.test.mjs`
