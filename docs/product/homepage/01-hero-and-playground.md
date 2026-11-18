# Homepage item 01: hero and live playground

## Purpose

The hero must answer two questions in the first viewport:

1. What is OQuery?
2. Why should a visitor try it now?

The answer must be demonstrated by a runnable query. The hero is not a
marketing-only banner and must not leave the editor empty or show a fake
result.

## Audience

The primary audience is a developer or technical product owner who has data
spread across business entities and needs flexible read access. The visitor
may understand SQL but should not need to understand OQuery metadata before
trying the example.

## Required message

### Eyebrow

`METADATA-DRIVEN QUERYING`

### Headline

**Your data, ready for any question.**

### Supporting copy

Metadata helps your application stay independent of the physical database.
Define business scope and domains once, then build each question from those
definitions.

The copy must not promise that every possible question is answered without
configuration. Metadata, permissions, and application integration are
developer responsibilities.

## Live demonstration

The right side of the hero contains the real Playground component. It must:

- load the home domain;
- load current metadata, relationships, functions, and filter operators;
- render a non-empty query;
- validate the query using the same engine used by Query Builder;
- show the returned result or an explicit connection/error state;
- allow the visitor to edit and run the query; and
- provide a path to inspect the domain metadata.

The current demonstration query is the team-size example:

```oquery
# Which sellers lead teams of more than five people?
Seller: FirstName, LastName, Members.Count() TeamSize
Where TeamSize > 5
```

The query is deliberately more useful than `Products:` because it shows an
entity, a collection aggregate, an alias, and a filter. If the demo dataset
changes, update this document and the source constant together.

## Supporting benefit cards

The hero may show these four benefit cards below the introductory copy:

| Card | Exact message | Meaning |
|---|---|---|
| Table changed? | No query changes. Update the table's definition only. | Logical metadata absorbs physical mapping changes. |
| New business rule? | No app rebuild. Rules are defined, not compiled in. | Dynamic definitions can express changing read logic. |
| Users need new views? | No backend coding. They pick fields and filters on screen. | The controlled query surface supports dynamic read experiences. |
| Same table, different teams? | No one-table-fits-all. Each domain sets logic per team. | Business scope can expose different logical views. |

These are bounded benefits, not claims that no code is ever required.

## Fit guidance

Show both a good-fit list and a non-fit list. This improves trust and reduces
misleading expectations.

### Good fit

- Internal reports and dashboards
- Back-office and administrative search
- Self-service data explorers
- Several business areas on one database
- Business rules that change often

### Not a fit

- Applications that modify data; OQuery is a read/query surface
- One-off scripts with a fixed query and no need for dynamic behavior

## Interaction requirements

- The primary hero action opens or focuses the Playground.
- The Playground remains usable on narrow screens; the editor and result must
  stack rather than become horizontally inaccessible.
- Loading, validation, execution, and connection failures must be visible.
- The query must remain editable when execution fails.
- Any generated SQL shown by the Playground must be actual engine output.
- The metadata action must open the corresponding domain/diagram view, not a
  generic documentation page.

## Accessibility requirements

- The hero has one `h1`.
- The Playground has a visible or programmatic label.
- Result, loading, and error states are announced appropriately.
- Benefit and fit lists use semantic list markup.
- The primary action has an unambiguous accessible name.

## Acceptance checklist

- [ ] A new visitor can identify OQuery without reading below the hero.
- [ ] A non-empty query is visible on first load.
- [ ] The query runs against the live demo domain.
- [ ] The result is real, or the failure explains what is unavailable.
- [ ] The copy does not say “MQuery”.
- [ ] The hero does not claim write support or no-code setup.
