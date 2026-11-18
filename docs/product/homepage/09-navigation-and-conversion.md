# Homepage item 09: navigation and conversion

## Purpose

The homepage should move a visitor from curiosity to a useful next action.
Every action must have a clear destination and preserve the visitor's
understanding of what they just saw.

## Header navigation

Use concise labels:

- Playground
- Examples
- Documentation
- Metadata
- GitHub

The primary action is **Try Playground** or **Open Playground**, but the label
must be consistent across the header and final section.

## Section actions

| Action | Destination | Expected outcome |
|---|---|---|
| Open Playground | Query Builder/Playground | Visitor can edit and execute a query. |
| Explore More | Examples domain/request | Visitor starts with a valid example query. |
| See domain | Metadata diagram for the home domain | Visitor sees the relationships behind the example. |
| Explore all domains | Metadata domains page | Visitor can choose another business scope. |
| Explore query interfaces | Documentation | Visitor learns text, structured, fluent, and HTTP inputs. |
| View database connections | Data Sources/connection view | Visitor sees available provider configuration. |
| Explore metadata | Metadata/entity definitions | Developer can inspect logical model authoring. |
| Explore extensibility | Function definitions | Developer can inspect supported extensions. |
| Read security documentation | Security/architecture documentation | Visitor can evaluate enforcement details. |
| Read the documentation | Documentation | Visitor gets the supported learning path. |

## Final section

### Heading

**Start with one query.**

### Supporting copy

Try a simple query, explore what OQuery can do, and see how it fits into your
application.

### Actions

- Primary: **Open Playground**
- Secondary: **Read the documentation**

The final section should not introduce a new promise. It closes the journey
started by the hero.

## URL and state behavior

- Navigation must use the application's existing route contract.
- Links that open a domain must preserve the domain ID, not use a display name
  as the identifier.
- Returning to the homepage must not leave a stale result that appears to
  belong to a different query.
- External GitHub links must point to the current repository.
- A route that cannot be loaded must show the application error state.

## Accessibility and analytics

- Buttons are used for in-page state changes; links are used for navigation.
- Every action has a unique, descriptive accessible name.
- Tabs expose selected state and their associated panel.
- Analytics, when enabled, must record action intent without recording query
  contents or credentials.

## Acceptance checklist

- [ ] Every CTA opens a real destination.
- [ ] Header and final CTA labels are consistent.
- [ ] Domain navigation uses IDs.
- [ ] In-page tabs are keyboard accessible.
- [ ] The final CTA works even if the hero demo failed to load.
