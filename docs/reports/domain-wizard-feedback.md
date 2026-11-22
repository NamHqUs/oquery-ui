# Domain wizard feedback

## Changes in this round

- Step 1 and step 2: the All / Selected / Unselected filter sits above the table list (step 1) and above the Entities and Relations tabs (step 2).
- Step 2: more space between entity cards; entity and relation text reduced to 11px.
- Step 3: helper messages reduced to 10px.
- New domain, step 3: the button is now **Create domain**. It saves the domain to disk through `POST /metadata/projects/{project-id}/domains` and opens the diagram with the new domain selected.
- Earlier round (kept): entity count and "changes are only in memory until save" messages for edit mode; existing entities start collapsed; new relations have a thick green left border; step 2 uses tabs.

## Testing notes

- `wizard-draft.spec.ts` passes (5 tests), including the new `wizardChangeCounts` cases.
- `vite build` passes.
- Full `vitest run` has 12 failures in `api-services.spec.ts` and `oquery-language.spec.ts`. These files were not changed in this round.
- Not yet checked in a browser: visual spacing and font sizes, and the create-then-return navigation against a running API.

## Developer comments

- The create path reuses `applyWizardToGraph` with an empty graph, so create and edit share the same entity and relation rules.
- Create failures (duplicate names, relation problems) are shown in the wizard's error banner and nothing is navigated.
- Cancel still returns to the Main diagram for create. Only a successful create opens the new domain's diagram.
