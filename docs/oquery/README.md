# OQuery core documents

Index of the OQuery engine documents. The files live in the `oquery` submodule
and are linked here, not copied. Use this page to choose the file to read or
edit. The status column says how much each file can be trusted.

| Status | Meaning |
|---|---|
| canonical | The owner of the topic. Other documents must agree with it. |
| reference | Detailed API or contract. Keep in sync with the canonical file. |
| guide | Learning path. Simpler than the reference; links to canonical files. |

## Which file answers which question

| Question | Read first | Status |
|---|---|---|
| I am new. How do I run a query? | [Introduction](../../oquery/docs/01-introduction.md), then [Quickstart](../../oquery/docs/02-quickstart.md) | guide |
| How do I write OQuery text? | [OQUERY-SYNTAX.md](../../oquery/OQUERY-SYNTAX.md) | canonical |
| What does the engine guarantee (aliases, contexts, grouping, authorization)? | [OQUERY-ENGINE.md](../../oquery/OQUERY-ENGINE.md) | canonical |
| Which classes do what? | [TECH.md](../../oquery/TECH.md) | reference |
| What is the JSON query contract? | [QUERY-MODEL-REFERENCE.md](../../oquery/QUERY-MODEL-REFERENCE.md) | canonical |
| How do I use the C# fluent API? | [FULENT-SYNTAX.md](../../oquery/FULENT-SYNTAX.md) | canonical |
| How do I install, define metadata, and use providers? | [MANUAL.md](../../oquery/MANUAL.md) | reference |
| How do I build and test the core? | [MANUAL.md, Build and test](../../oquery/MANUAL.md#build-and-test) | canonical |
| What rules apply when editing the core repo? | [oquery/AGENT.md](../../oquery/AGENT.md) | canonical |
| Which sample reports exist? | [northstar-demo-queries.md](../../oquery/data-storage/scripts/northstar-samples-docs/northstar-demo-queries.md), [sales-report-queries.md](../../oquery/data-storage/scripts/sales-report-queries.md) | reference |

## Precedence when documents disagree

1. `OQUERY-ENGINE.md` decides execution behavior.
2. `OQUERY-SYNTAX.md` decides OQuery text.
3. `QUERY-MODEL-REFERENCE.md` decides JSON shape.
4. `FULENT-SYNTAX.md` decides the C# fluent surface.
5. `MANUAL.md` and `TECH.md` describe the rest. If they disagree with 1 to 4,
   the canonical file wins and the other file needs an update.
6. The `oquery/docs` guide is simple by design. It is not a reference.

## Known problems

Recorded in the [documentation audit](../reports/documentation-audit.md). The
most relevant to readers of this page:

- `MANUAL.md` uses `ToListWithTotal` and `ToListWithTotalAsync`. The code has
  `ToListWithTotalRecords` and `ToListWithTotalRecordsAsync`.
- `TECH.md` links to a missing `artifacts/query-architecture.svg`.
- `sales-report-queries.md` links to a missing `db-scripts.sqlite.sql`.
- No document describes the metadata YAML format in `data-storage/metadata`.
