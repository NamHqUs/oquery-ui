# Playground schema panel (design)

Status: proposal. Layout and behavior only. No code is changed by this document.

## Problem

Writing a query means knowing entity names, fields, and relations. The schema diagram answers those
questions, but on a narrow laptop screen (about 1280px or less) it cannot sit beside the editor
without making both unusable.

## Goals

- Show the schema while writing, without leaving the playground.
- Keep the editor at least 60% of the content width.
- Insert an entity or field into the editor with one click.
- Keep saved-playground behavior unchanged (open tabs, unsaved-changes indicator, Save / Save as).

## Layout by width

| Width | Layout | Behavior |
| --- | --- | --- |
| ≥ 1440px | Editor and schema side by side, with a draggable divider | Both always visible. Divider has a minimum width of 360px per pane. |
| 1024px to 1439px | Editor full width; schema as a collapsible strip above the editor | Strip height defaults to 200px and can be collapsed to a single toolbar row. |
| < 1024px | Editor full width; schema opens as a full-height drawer from the right | Drawer covers results; closes on entity selection unless pinned. |

Mockups:

- Narrow laptop (strip above editor): [image-6e15ad6b862d376c.png](c:/Users/namhq/.copilot/session-state/6b57e029-7383-4238-9125-6fdca571c8be/images/image-6e15ad6b862d376c.png)
- Wide screen (split with divider): [image-ffce4c366913a64b.png](c:/Users/namhq/.copilot/session-state/6b57e029-7383-4238-9125-6fdca571c8be/images/image-ffce4c366913a64b.png)

Note: the first mockup file name is `image-6e15ad6b862d376c.png` (narrow layout) and the second is
`image-ffce4c366913a64b.png` (wide layout). The earlier playground mockup is `image-7f6548917769dd92.png`.

## Schema panel behavior

- **Toggle:** a "Diagram" button in the editor toolbar shows or hides the panel. The state is kept per
  playground, so reopening a saved playground restores the last layout.
- **Pin:** pinning keeps the panel open across Run and tab switches. Unpinned panels hide on Run in
  narrow layouts so results are visible.
- **Filter:** a search field filters entities by name. Matching entities stay visible; their direct
  relations are highlighted.
- **Focus mode:** selecting an entity shows only that entity and its direct relations. This keeps the
  diagram readable at small sizes. "Fit" resets the view.
- **Insert:** clicking an entity inserts its name at the cursor. Clicking a field inserts `Entity.field`.
  Relations insert the join condition as a snippet the user can edit.
- **Zoom:** zoom in, zoom out, and fit buttons. The diagram does not auto-fit on every edit, so the
  view does not jump while typing.

## Interaction with the editor

- The editor keeps focus when the diagram is toggled, where possible.
- Inserting an entity or field returns focus to the editor at the insertion point.
- The "Unsaved changes" indicator is unaffected by toggling or pinning the panel. Only editor text
  changes mark the playground as dirty.

## Algorithm (cost and performance)

- Entity filtering is a substring match over the entity list: O(n) where n is the number of entities in
  the domain. Domains are small enough that this is instant without indexing.
- Focus mode uses the relation list already loaded with the domain, so selecting an entity needs no
  extra request. Its direct relations are one level deep, so the visible set is bounded by the entity's
  degree.
- The diagram renders only the visible set. Entities outside the view are not laid out, which keeps
  large domains responsive on low-end laptops.
- Layout positions are cached per domain and reused when the panel reopens, so toggling does not re-run
  the layout algorithm.

## Responsive and accessibility notes

- Minimum touch target for toolbar buttons is 32px. Entity and field rows are at least 28px tall.
- The divider is keyboard-resizable with arrow keys when focused.
- Drawer and strip are reachable by keyboard; Escape closes the drawer.
- Color is not the only signal for relation cardinality; labels `1` and `N` are always shown.

## Implementation plan (after approval)

1. Add a `SchemaPanel` component that takes the domain's entities and relations as props.
2. Add a width-based layout controller (the three breakpoints above) inside the playground view.
3. Wire the Diagram toggle and Pin state to the playground view state, persisted with the saved playground.
4. Implement insert-at-cursor for entities, fields, and relation snippets through the editor's existing
   insertion path.
5. Update [studio-guide.md](/D:/SourceCode/Github/public/oquery-ui/docs/frontend/studio-guide.md) and
   [oquery-ui-prototypes.md](/D:/SourceCode/Github/public/oquery-ui/docs/design/oquery-ui-prototypes.md) to match.

Validation: `npx vite build` and `npx vitest run` in `src/OQuery.UI.Frontend`, plus manual checks at
1280px, 1440px, and 1920px widths.

## Open questions

- Should the pinned state be per playground or global for the user?
- Should inserted relations use the join snippet or only the entity name?
