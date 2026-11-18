# Homepage item 07: fit and use cases

## Purpose

Visitors need enough context to decide whether OQuery belongs in their
architecture. This document turns broad product claims into concrete scenarios
and clearly states the boundaries of the product.

## Good-fit scenarios

### Internal reporting

Teams can expose a controlled set of entities, fields, relationships, and
aggregates for reports that change more often than a release cycle. The
application still owns metadata design, authorization, and result delivery.

### Back-office search

Administrative users can combine projections and filters without requiring a
new endpoint for every search variation. The UI should constrain available
fields and operators to the configured model.

### Self-service data exploration

An application can let permitted users explore related business data through a
query builder or text editor. This is appropriate when transparency and
controlled flexibility matter more than a fixed workflow.

### Multiple business areas

A shared database can support several logical domains. Each domain can expose
the entities and relationships meaningful to its business scope instead of
forcing one global vocabulary on every consumer.

### Frequently changing rules

Metadata and function definitions can represent changes that would otherwise
require new query code. Teams must still validate definitions, migrate data
when necessary, and test changes before publishing them.

## Poor-fit scenarios

### Write-heavy applications

OQuery is a read/query surface. Use explicit command APIs and domain workflows
for inserts, updates, deletes, transactions, and side effects.

### Fixed one-off scripts

If a script has one stable query and no need for a logical model or dynamic
variation, direct SQL or a simpler data-access API may be more appropriate.

### Unbounded ad-hoc SQL

OQuery is not intended to expose arbitrary SQL text to untrusted users.
Consumers operate within the configured query vocabulary and supported
operations.

## Use-case copy rules

- Name the user's job before naming an engine feature.
- Explain the required setup or boundary in the same section.
- Do not imply that dynamic querying removes testing, review, or deployment.
- Link each technical scenario to a guide or example where possible.
- Keep “multi-tenant” claims conditional on the verified authorization
  integration.

## Homepage placement

The fit list belongs near the hero so visitors can self-select early. Detailed
use-case cards may appear later, but they must not repeat the hero word for
word. The later section should explain the workflow and the boundary.

## Acceptance checklist

- [ ] At least three concrete good-fit scenarios are represented.
- [ ] Read-only scope is explicit.
- [ ] Poor-fit cases are respectful and technically accurate.
- [ ] No scenario promises automatic tenant isolation or zero configuration.
