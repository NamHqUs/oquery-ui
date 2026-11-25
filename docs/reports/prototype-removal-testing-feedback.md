# Prototype removal: testing feedback

## What changed

| Area | Before | After |
| --- | --- | --- |
| Playground Overview | Hard-coded counts (24 entities, 128 queries), fake success rate, freshness, chart, health | Real entity, relation, and saved-query counts for the selected domain. Recent saved queries open their playground. Quick actions navigate. |
| Playground Saved queries | Hard-coded list of five names, owners, and a fake inspector | Real saved playgrounds for the selected domain, with search, "New query", and "Open" per row. |
| Security & access | Hard-coded policies and "UI preview" badge; no backend exists | Removed (nav item, route, page map, and sidebar entry). |
| AI assistant | Mock reply adapter (`mock-chat-adapter.ts`) | Removed: the column, its splitter, and `copilot-chat/` files. `@assistant-ui/react` uninstalled. |
| Saved playground route | `/playground/:projectId/:domainId/:queryId` showed the id as the tab title | Opens the saved playground with that id. It loads once per URL, so a new unsaved playground is not replaced. |

## Verification

- `npx vite build` passes.
- `npx vitest run`: 193 pass, 12 fail. The failures are in `oquery-language.spec.ts` and two `api-services.spec.ts` cases and predate this change. Nothing in those areas was touched.
- Browser, domain `EXAMPLES_DOMAIN`:
  - Overview shows 7 entities, 8 relations, 1 saved query.
  - Saved queries lists "abc" with an Open button.
  - Clicking Open routes to `/playground/pf3FfXm9/EXAMPLES_DOMAIN/u6dcjvdbK3vv` and shows "abc" in the editor.
  - The sidebar no longer shows Security. The AI assistant column is gone.

## Developer notes

- Overview and Saved queries call `getDomain` and `fetchPlaygrounds`. Both are cached or already used by the playground, so no new endpoint was added.
- Saved playgrounds have no timestamp in the API, so "Recent" means the first four items in API order.
- `PlaygroundWorkspace` switches to the playground view when an open action runs. Without that, a route change inside the same mounted component would keep showing the list.

## Left for follow-up

- Dead CSS: `security-*` rules in `src/styles.css`, and `.playground-copilot*` and `.copilot` rules in `main-layout-compat.css`. They no longer match any element.
- The legacy shell in `main.tsx` still renders a hard-coded "N" avatar on pages outside the playground.
- `docs/design/oquery-ui-prototypes.md` keeps the historical design prototype and screenshots. It describes the removed features as design history.
- A real security feature needs a backend policy resource. It was not designed here.
