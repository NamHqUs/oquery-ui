# Homepage item 03: metadata explanation

## Purpose

This section explains why a short logical query can produce useful results.
It comes after the visitor has seen the Playground, so the explanation can
name the mechanism without making metadata a prerequisite for curiosity.

## Section framing

### Kicker

`HOW IT WORKS`

### Heading

**Metadata gives OQuery an understanding of your data.**

### Introductory copy

Metadata describes the logical entities in an application, the fields they
expose, and how those entities relate. OQuery uses that context to understand
what a consumer asks for and determine how to retrieve it from the database.

## The four-stage explanation

The visual and its text must show this sequence:

1. **Physical database** — tables, columns, keys, and schemas exist in the
   storage system.
2. **Metadata** — the application defines business entities, field mappings,
   and relationships that it wants to expose.
3. **OQuery request** — a consumer asks for logical entities and paths.
4. **Generated SQL** — the engine translates the request for the configured
   database dialect.

The visual must not suggest that metadata changes the database or that the
consumer can access every physical table automatically.

## Canonical example

Use this example consistently in copy and diagrams:

```oquery
Seller:
    FirstName,
    Department.Name
```

Explain the mapping in plain language:

- `Seller` is the logical entity requested by the consumer.
- `FirstName` is an exposed field.
- `Department.Name` follows an available relationship.
- The engine resolves the physical fields and relationship keys using
  metadata.
- The generated SQL is database-specific and should be shown only when it is
  actual output.

## Required vocabulary

| Term | Homepage meaning |
|---|---|
| Entity | A logical business collection that a query can address. |
| Field | A value exposed by an entity, mapped to a column or expression. |
| Relationship | A metadata-defined path between entities. |
| Domain | A business scope containing the entities and relationships available together. |
| Metadata | The definitions that give the engine this logical context. |

Avoid introducing “context” as a synonym for domain in this section. In
engine documentation, context can also mean a named query execution scope.
Link to the glossary/reference when that distinction matters.

## Supporting claims

The section may state that metadata lets applications:

- use business entities instead of physical table names;
- follow configured relationships without writing join conditions in each
  request;
- expose a subset of a database through logical fields;
- map a logical entity to more than one physical structure where supported;
- provide different domains or views for different application needs; and
- keep query consumers independent from storage-specific names.

Do not claim that every metadata change is automatically safe, permissioned,
or migration-free. Those concerns belong to the developer and security
documents.

## Domain diagram

The live domain diagram is evidence, not decoration. It must:

- use metadata loaded from the current home domain;
- show only relationships actually returned by the domain service;
- remain legible on mobile;
- identify the domain name;
- link to the full domain/diagram view; and
- provide a separate link to browse all domains.

If metadata loading fails, show a clear unavailable state rather than a stale
or fabricated diagram.

## Acceptance checklist

- [ ] The section appears after a working query example.
- [ ] The physical-to-logical-to-SQL flow is understandable without source
  code.
- [ ] The canonical query uses names present in the live domain.
- [ ] The diagram is live data or explicitly unavailable.
- [ ] “Metadata” is explained through a concrete mapping.
- [ ] The section does not claim unrestricted database discovery.
