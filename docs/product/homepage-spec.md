# OQuery homepage content specification

This file is the index for the homepage content system. It is intentionally
not the complete copy for every section. Each content item has its own
document so that wording, audience, proof, interaction, accessibility, and
implementation acceptance criteria can be reviewed independently.

## Content ownership

The homepage is a product introduction, not a replacement for the OQuery
reference documentation. It should:

- explain the problem OQuery solves;
- show a working query before making architectural claims;
- use the live demo as proof rather than illustrative screenshots;
- link readers to the detailed documentation when they need implementation
  guidance; and
- distinguish implemented behavior from roadmap ideas.

The product definition owns the product's underlying claims. The documents
below own the homepage's audience, sequence, copy, evidence, and acceptance
criteria.

## Content documents

| Order | Homepage item | Content document |
|---:|---|---|
| 1 | Hero and live playground | [01-hero-and-playground.md](./homepage/01-hero-and-playground.md) |
| 2 | Query examples | [02-query-examples.md](./homepage/02-query-examples.md) |
| 3 | Metadata explanation | [03-metadata-explanation.md](./homepage/03-metadata-explanation.md) |
| 4 | Query interfaces and one engine | [04-query-interfaces.md](./homepage/04-query-interfaces.md) |
| 5 | Developer model and extensibility | [05-developer-model.md](./homepage/05-developer-model.md) |
| 6 | Security and control | [06-security-and-control.md](./homepage/06-security-and-control.md) |
| 7 | Fit and use cases | [07-fit-and-use-cases.md](./homepage/07-fit-and-use-cases.md) |
| 8 | Database support | [08-database-support.md](./homepage/08-database-support.md) |
| 9 | Navigation and final conversion | [09-navigation-and-conversion.md](./homepage/09-navigation-and-conversion.md) |
| 10 | Content governance and release checks | [10-content-governance.md](./homepage/10-content-governance.md) |

## Reading and implementation order

1. Read the hero document to understand the promise and the first interaction.
2. Read the examples document to understand the evidence required to support
   the promise.
3. Read the metadata and interface documents to understand the explanation
   that follows the evidence.
4. Read the developer, security, and database documents before publishing
   technical claims.
5. Read the navigation and governance documents before changing links, labels,
   or release behavior.

## Current implementation map

The React implementation is in
[`src/OQuery.UI.Frontend/src/components/home/`](../../src/OQuery.UI.Frontend/src/components/home/).
The primary content constants are in
[`home-content.ts`](../../src/OQuery.UI.Frontend/src/components/home/home-content.ts),
and the section composition is in
[`home.tsx`](../../src/OQuery.UI.Frontend/src/components/home/home.tsx).

These documents are the content contract; they do not instruct a contributor
to rebuild the homepage in this task. A future implementation change should
update the relevant content document and the code together.

## Non-goals

- This is not a visual design file.
- This is not an API reference.
- This is not a complete OQuery syntax tutorial.
- This does not authorize claims about features that are marked roadmap,
  unavailable in the live demo, or not verified by tests.
