# Sidebar collapse behavior (design)

Status: proposal. Defines when side panels collapse.

## Implemented (main menu)

The main menu in `src/OQuery.UI.Frontend/src/components/main-layout/main-layout-sidebar.tsx` implements:

- Groups: **Domain** (Playground, Queries, Domain Diagram), **Project** (Overview, Database explorer,
  Security), and **Library** (Custom functions). When the project has no domains, the Domain group
  shows a hint instead of its items. Collapsed, group labels become thin dividers.
- Collapse state `auto` / `expanded` / `collapsed`, stored in local storage under `oquery.main-sidebar`.
  `auto` collapses below 1280px with a 150ms resize debounce; an explicit toggle is kept across
  pages and reloads.
- Menu items on the Domain Diagram page open the matching view. Custom functions opens the route
  `/sqlfunctions` (`CUSTOM_FUNCTIONS_PATH`), with the project passed as `?project=`, and renders inside the
  same `MainLayout` shell as the Playground and Domain Diagram. The old `/function-definitions` and
  `/functions` URLs redirect there.

Not yet implemented: the 1024px overlay, keyboard shortcuts, the Reset layout action, and the
Playground entities panel rules below. Custom functions still require a project, because the
function-definition API is scoped per project; without a valid `?project=` the page shows the project
selector with no project chosen.

## Problem

Side panels (the workspace sidebar and the Playground's Saved | Entities panel) need to free space on
narrow screens. Collapsing them without the user asking can hide content they are working with, so the
rule must separate automatic layout from user intent.

## Principles

1. **User intent wins.** A collapse or expand the user chose is never overridden by a resize.
2. **Automatic collapse is a fallback.** It applies only when the user has made no explicit choice.
3. **Automatic changes are reversible.** An automatic collapse expands again when the window grows, but
   an explicit user choice is never reversed automatically.
4. **No layout jumps while dragging.** Resize-driven changes are debounced, and the panel never changes
   state during an active splitter drag.

## State model

Each collapsible panel stores one of three values:

| Value | Meaning | Set by |
| --- | --- | --- |
| `auto` | No explicit choice. Follows the breakpoint rule. | Default, or after the user clears their choice |
| `expanded` | User chose to keep the panel open. | Toggle button or expand gesture |
| `collapsed` | User chose to keep the panel closed. | Toggle button, collapse gesture, or Ctrl+B |

The value is stored per user in local storage, keyed by panel id (for example
`sidebar.workspace`, `playground.entities`). It is not stored per playground, so opening another
playground keeps the user's choice.

## Breakpoint rule (applies only when state is `auto`)

| Viewport width | Workspace sidebar | Playground entities panel |
| --- | --- | --- |
| ≥ 1280px | Expanded | Expanded (150px default) |
| 1024px to 1279px | Collapsed to icons (56px) | Expanded |
| < 1024px | Hidden; opens as an overlay from the left | Collapsed to icons; opens as an overlay |

Overlay means the panel floats over content, and the content width does not change.

## Transitions

- **Window shrinks below a breakpoint** (state `auto`): collapse the panel, after a 150ms debounce.
- **Window grows back above a breakpoint** (state `auto`, previously auto-collapsed): expand the panel.
- **Any explicit toggle**: set the state to `expanded` or `collapsed`. Resizing never changes it after that.
- **Reset:** a "Reset layout" action in Settings sets every panel back to `auto`.

## Controls

- **Toggle button:** at the top of each sidebar. Its `aria-expanded` reflects the current state.
- **Keyboard:** Ctrl+B toggles the workspace sidebar; Ctrl+Shift+B toggles the Playground entities panel.
  Escape closes an overlay.
- **Splitter:** double-clicking the Playground splitter toggles the entities panel. Dragging it below
  48px collapses the panel and records `collapsed`. Dragging back above 48px records `expanded`.
- **Overlay:** opening an overlay moves focus into the panel. Closing it returns focus to the toggle.

## Algorithm

```text
onResize(width):
    debounce 150ms
    for each panel:
        if state == auto:
            panel.collapsed = width < panel.breakpoint
        // explicit states are left unchanged

onToggle(panel):
    panel.state = panel.isCollapsed ? expanded : collapsed

onSplitterDragEnd(panel, width):
    panel.state = width < 48 ? collapsed : expanded
```

The check is constant time per panel and runs only on debounced resize, so it adds no measurable cost.

## Accessibility

- Collapsed icon buttons have text labels (`aria-label`), so screen readers still announce them.
- Overlays trap focus while open and are announced as dialogs.
- Collapsed and expanded states are conveyed by `aria-expanded`, not by color alone.

## Implementation plan (after approval)

1. Add a `usePanelState(panelId, breakpoint)` hook that returns the state and toggle, backed by local storage.
2. Apply the breakpoint rule through the hook's debounced resize listener.
3. Replace the entities panel's implicit 48px rule with the explicit state (keep the 48px hidden threshold
   for the splitter gesture).
4. Add the Reset layout action and keyboard shortcuts.
5. Update [playground-schema-panel.md](/D:/SourceCode/Github/public/oquery-ui/docs/design/playground-schema-panel.md)
   to reference this behavior.

Validation: `npx vite build` and `npx vitest run` in `src/OQuery.UI.Frontend`, plus manual checks at
1280px, 1100px, and 900px widths, with and without an explicit choice.

## Open questions

- Should explicit choices be per user across devices (stored in the account) or per browser (local storage)?
- Should the Playground entities panel's auto rule follow the workspace sidebar's breakpoints?
