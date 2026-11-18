# Homepage item 04: query interfaces and one engine

## Purpose

This section tells a technical evaluator that OQuery is not tied to one editor.
Different input surfaces share the same logical model and engine rather than
implementing separate, incompatible query behavior.

## Section framing

### Kicker

`ONE ENGINE · QUERY CAPABILITIES`

### Heading

**Rich inputs. One engine. Multiple databases.**

### Introductory copy

Use the input style that fits the application and development workflow. Text
queries, structured definitions, fluent code, and frontend requests use the
same data model; OQuery then generates database-specific SQL for execution.

## Interface cards

### OQuery text

**Express queries in concise, readable text.**

For interactive query experiences, users, and programmatic clients.

```oquery
Products:
```

Link to the OQuery syntax guide and the live Playground.

### QueryDefinition

**Define queries with structured .NET classes.**

For developers who need explicit objects, validation, serialization, or
programmatic construction. Link to the query model reference rather than
repeating the complete contract on the homepage.

### Fluent API

**Build queries naturally in C#.**

For .NET developers who prefer compile-time composition and fluent calls. Link
to the canonical fluent syntax document.

### Frontend API

**Submit dynamic queries over HTTP.**

For frontend applications that need controlled query variation without a
dedicated backend endpoint for every projection and filter. The current demo
uses the dynamic-query endpoint; keep the displayed path synchronized with
the API contract.

## One-engine diagram

The diagram must show:

```text
Text | QueryDefinition | Fluent API | Frontend API
                         |
                    OQuery engine
        Metadata · functions · SQL dialects
                         |
             Configured database provider
```

The provider list must come from the application state or verified provider
documentation. Do not hardcode a provider as available merely because a
binary exists in a local build.

## Claims and boundaries

Allowed:

- The interfaces converge on the same query model/engine.
- Metadata supplies entity, field, relationship, and function context.
- SQL generation is dialect-specific.
- Applications can choose the interface that matches their integration.

Not allowed without evidence:

- “Every interface supports every feature identically.”
- “All databases have identical performance.”
- “Frontend requests bypass authorization.”
- “The frontend API replaces all backend API design.”

## Links

The section must expose:

- **Explore query interfaces** — documentation page covering the interfaces.
- **View database connections** — the application connection/provider view.

Links must be tested after route changes. A visually attractive card with a
dead link is a content defect.

## Acceptance checklist

- [ ] All four interface cards use current product names.
- [ ] Each card identifies its audience.
- [ ] The diagram has one engine, not four separate execution paths.
- [ ] Provider names are verified against the current implementation.
- [ ] The text does not promise feature parity without verification.
