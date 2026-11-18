# Homepage item 05: developer model and extensibility

## Purpose

This section answers the developer's adoption question: what must my team
define, and where can we extend OQuery? It should make the platform
configurable without implying that configuration eliminates engineering work.

## Section framing

### Kicker

`FOR DEVELOPERS`

### Heading

**Define your data. Extend what your application can do.**

### Introductory copy

Every application has business concepts, data relationships, and access
rules. OQuery lets developers define the logical data model an application
exposes, then add functions and capabilities that make that model useful
across query surfaces.

## Required capability cards

### Entities

Expose business-oriented entities instead of requiring consumers to understand
physical tables. Explain that an entity belongs to a configured domain/scope
and is resolved through metadata.

### Fields

Choose which values are available and map them to database columns or
expressions. A field is part of the public query vocabulary only when the
metadata makes it available.

### Relationships

Describe how entities connect so consumers can navigate related data by
logical paths. Relationship direction, cardinality, and join behavior remain
metadata/engine concerns; the homepage should not pretend every relationship
is interchangeable.

### Logical views

Combine or reshape physical data into a logical entity where the supported
metadata model allows it. Make clear that this is a logical exposure layer,
not necessarily a new database view.

### Permissions

Control which entities and fields a consumer may use. Link to the security
content for enforcement details, and avoid presenting the card as proof that
every permission scenario is already implemented.

### Functions

Extend expressions through function definitions, including function names,
parameters, parser templates, and supported data types. Link to the function
definition UI or reference documentation.

### Database providers

Use existing SQL dialects or extend the provider architecture when a new
database is required. Provider support must be verified separately from
metadata support.

### Application integration

Embed the engine or call the frontend/API surface from an application. The
application remains responsible for authentication, tenant selection,
operational policy, and handling results.

## Live statistics

The demo may show counts for entities, relationships, and functions. These
values must be:

- loaded from the current home domain and function service;
- labeled as demo metadata;
- replaced with an explicit loading/unavailable state when requests fail; and
- never used as product-wide feature counts.

## Supported definition formats

The homepage may say that metadata can be defined with YAML, JSON, or .NET
only when the linked documentation demonstrates the format currently
supported by this repository. Link to the canonical format/reference rather
than embedding a partial definition that could become misleading.

## Actions

- **Explore metadata and entity definitions** opens the Metadata area.
- **Explore extensibility** opens the Function Definitions area.

## Acceptance checklist

- [ ] Cards explain what a developer controls, not only what the product
  names.
- [ ] Permissions are described as a boundary, not a blanket guarantee.
- [ ] Live counts are clearly demo-scoped.
- [ ] Extension links open real destinations.
- [ ] The section distinguishes logical metadata from physical schema changes.
