# OQuery UI documentation

This folder is the central source of truth for the repository. Start here,
find the row that matches your question, and open that file. When two files
disagree, the file named as canonical wins.

## Find the right file

| Question | Open this | Status |
|---|---|---|
| Why does this product exist, and what is the design? | [product/product-definitions.md](./product/product-definitions.md) | spec |
| What should the homepage say and show? | [product/homepage-spec.md](./product/homepage-spec.md) | spec |
| Where is the homepage built? | `src/Demo.Frontend/src/components/home/` | code |
| How do I run the demo? | [../README.md](../README.md) | canonical |
| How does the frontend work, page by page? | [frontend/api-by-page.md](./frontend/api-by-page.md) | canonical |
| How do I use the Studio UI (Metadata, Playground, Docs)? | [frontend/studio-guide.md](./frontend/studio-guide.md) | guide |
| What are the rules for the frontend project? | [projects/Demo.Frontend.md](./projects/Demo.Frontend.md) | canonical |
| What are the rules for the backend projects? | [projects/](./projects/) (one file per project, see below) | canonical |
| How does the OQuery engine work? | [oquery/README.md](./oquery/README.md) (index of core docs) | canonical |
| How do I write OQuery text? | [oquery/OQUERY-SYNTAX.md](../oquery/OQUERY-SYNTAX.md) | canonical |
| Which open bugs and improvements exist? | [reports/bugs-and-improvements.md](./reports/bugs-and-improvements.md) | report |
| What did the last UI validation find? | [reports/validation-report.md](./reports/validation-report.md) | report |
| What is wrong or missing in these docs? | [reports/documentation-audit.md](./reports/documentation-audit.md) | report |

## Folder map

| Folder | Contents |
|---|---|
| `product/` | Product definition and homepage specification. Source for homepage copy. |
| `projects/` | One guidance file per project: scope, conventions, and what to read before changing code. |
| `frontend/` | API calls per page and the Studio user guide. |
| `oquery/` | Index of the OQuery core documents. The documents themselves live in the `oquery` submodule. |
| `reports/` | Dated reports, bug lists, and the audit. Not design sources. |

## Project guidance files

| Project | File |
|---|---|
| `src/Demo.Contracts` | [projects/Demo.Contracts.md](./projects/Demo.Contracts.md) |
| `src/Demo.DbServices` | [projects/Demo.DbServices.md](./projects/Demo.DbServices.md) |
| `src/Demo.Frontend` | [projects/Demo.Frontend.md](./projects/Demo.Frontend.md) |
| `src/Demo.Repositories` | [projects/Demo.Repositories.md](./projects/Demo.Repositories.md) |
| `src/Demo.Services` | [projects/Demo.Services.md](./projects/Demo.Services.md) |
| `src/Demo.Share` | [projects/Demo.Share.md](./projects/Demo.Share.md) |
| `src/OQuery.UI` | [projects/OQuery.UI.md](./projects/OQuery.UI.md) |
| `oquery/` (core engine) | [../oquery/AGENT.md](../oquery/AGENT.md) |

The Copilot instruction map in `.github/copilot-instructions.md` uses the same
mapping.

## Status labels

| Label | Meaning |
|---|---|
| canonical | Owns the topic. Other documents must agree with it. |
| spec | Intended behavior or copy. Code should follow it; verify before quoting it as fact. |
| guide | Learning material. Links to canonical files for details. |
| reference | Detailed contract that must match the code. |
| report | Point-in-time findings. Not a design source. |

## Naming rules

- Brand: **OQuery**. The name `MQuery` in older files is a known conflict
  (see the audit); use `OQuery` in new text.
- Project guidance files do not use the word "agent" in their names.
- Keep one topic in one canonical file. Link to it instead of copying it.
