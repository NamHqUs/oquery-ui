# Documentation audit

Date of audit: 2026-11-12. Scope: every Markdown file in the repository,
including the `oquery` submodule and the git-ignored instruction files.

## 1. What changed in this pass

| Before | After | How |
|---|---|---|
| `.PROJECT-DEFINITIONS.md` (git-ignored) | [product/product-definitions.md](../product/product-definitions.md) | moved |
| `.HOMEPAGE.md` (git-ignored) | [product/homepage-spec.md](../product/homepage-spec.md) | moved |
| `src/*/*.AGENT.md` (7 files, git-ignored) | [projects/](../projects/) with names without "agent" | moved and renamed; titles edited |
| `TESTING.md` | [reports/bugs-and-improvements.md](./bugs-and-improvements.md) | `git mv`; the file is a bug list, not a test guide |
| `OQUERY-UI-VALIDATION-REPORT.md` | [reports/validation-report.md](./validation-report.md) | `git mv` |
| `src/Demo.Frontend/API-BY-PAGE.md` | [frontend/api-by-page.md](../frontend/api-by-page.md) | `git mv` |
| `src/Demo.Frontend/README.md` | [frontend/studio-guide.md](../frontend/studio-guide.md) | `git mv`; it describes the Studio UI, not the npm package |
| (none) | [README.md](../README.md), [oquery/README.md](../oquery/README.md) | new index files |
| `.github/copilot-instructions.md` map | points to `docs/projects/*.md` | updated; removed entry for a folder that does not exist |

The root [README.md](../../README.md) is kept at the repository root for
GitHub, and it now links to the docs index.

## 2. Conflicts

| # | Conflict | Where | Resolution | Status |
|---|---|---|---|---|
| C1 | Brand is **MQuery** in product docs and **OQuery** in code, namespaces, and all other docs. | `product/product-definitions.md` (55 occurrences), `product/homepage-spec.md` (25) | Canonical brand is OQuery (decided). | Open: the text still says MQuery. Replacing it needs about 80 targeted edits. |
| C2 | Instruction map pointed at `*.AGENT.md` files that were not committed. Three map targets did not exist at all. | `.github/copilot-instructions.md` | Map now points at `docs/projects/*.md`. Core entries point at `oquery/AGENT.md`. | Resolved in the repo. See O2 for the outside instruction. |
| C3 | `ToListWithTotal` and `ToListWithTotalAsync` are documented, but the code exposes `ToListWithTotalRecords` and `ToListWithTotalRecordsAsync`. | `oquery/MANUAL.md` lines 351, 361, 715 | Code name is canonical. | Open: in the submodule. |
| C4 | `oquery/docs/` guide and `MANUAL.md` both describe install and first queries. | `oquery/docs/02-quickstart.md`, `oquery/MANUAL.md` | Guide is simple; MANUAL is reference. Recorded in [oquery/README.md](../oquery/README.md). | Documented. The duplicate text remains. |
| C5 | `FULENT-SYNTAX.md` and the C# section of `MANUAL.md` both describe `Where`, `Select`, ordering, and paging. | `oquery/FULENT-SYNTAX.md`, `oquery/MANUAL.md` | `FULENT-SYNTAX.md` is canonical for the fluent API. | Open: the MANUAL section should link instead of repeat. |

## 3. Duplicates

| # | Duplicate | Decision |
|---|---|---|
| D1 | Editor shortcuts appear in `frontend/studio-guide.md` and in the in-app Documentation page. | Keep the studio guide as canonical. The in-app page should later be generated from the docs (see M3). |
| D2 | Homepage copy repeats product claims from `product/product-definitions.md`. | Product definition owns claims; homepage spec owns wording. |
| D3 | Root `README.md` and `oquery/MANUAL.md` both give build and test commands. | Root README owns the demo commands. MANUAL owns core build and test. |
| D4 | JSON shape is described in `MANUAL.md`, `TECH.md`, and `QUERY-MODEL-REFERENCE.md`. | `QUERY-MODEL-REFERENCE.md` is canonical. |

No file was deleted in this pass. Deleting or merging the core duplicates
would change the submodule, so it is left for a submodule commit (see O3).

## 4. Missing

| # | Missing | Impact |
|---|---|---|
| M1 | No document describes the metadata YAML format used in `oquery/data-storage/metadata/*.yml`. | Users cannot write metadata without reading code. |
| M2 | No API reference for the backend endpoints in `src/Demo.Services` and `src/OQuery.UI`. `api-by-page.md` covers only what the frontend calls. | Backend changes can break the frontend silently. |
| M3 | The homepage has no generator or mapping from `homepage-spec.md` to `src/Demo.Frontend/src/components/home/`. The spec is not yet a source of truth in code. | Homepage copy and layout can drift from the spec. |
| M4 | No glossary of terms: entity, field, relation, context, metadata, domain, scope. | Terms are used with different meanings in product and core docs. |
| M5 | `oquery/docs/` (the simple guide) covers only the first 11 topics. The detail and advanced topics are planned in `oquery/docs/agenda.yml`. | Learners stop after the basics. |

## 5. Unclear

| # | Item | Reason |
|---|---|---|
| U1 | `frontend/studio-guide.md` was the README of the frontend project. | Its name suggests the npm package. It is now a user guide. |
| U2 | `reports/bugs-and-improvements.md` has the heading "IMPROMENTS". | Typo in the file. It also mixes fixed and open items; there is no status per item. |
| U3 | `oquery/FULENT-SYNTAX.md` filename. | Misspelled (should be FLUENT). Renaming it is a submodule change, so it is left. |
| U4 | `product/product-definitions.md` calls the query language "MQuery — Plain-Text Query Syntax" (section 5.1). | Unclear whether MQuery syntax is the same as OQuery text. Needs a product decision. |
| U5 | `reports/validation-report.md` is dated 2026-11-10 and 2026-11-11. | Point-in-time report. It may be out of date with the code. |

## 6. Broken links

| Link | Location | Status |
|---|---|---|
| `artifacts/query-architecture.svg` | `oquery/TECH.md` | Missing file. Open (submodule). |
| `./db-scripts.sqlite.sql` | `oquery/data-storage/scripts/sales-report-queries.md` | No such file. The sales script is `sale-demo.sqlite.sql`. Open (submodule). |

All links in the root `docs/` tree and the root README resolve.

## 7. Open decisions and actions

| # | Item | Who |
|---|---|---|
| O1 | Replace the 80 `MQuery` occurrences in `product/*.md` with `OQuery`. | Next step. Needs the edit tool, one unique match at a time. |
| O2 | `.git/info/exclude` hides any file whose name contains "agent" or "instructions". The environment-level instructions still say to read `ProjectName.AGENT.md`. | Local setting. The user must update it, or keep compatibility stubs. Not changed here. |
| O3 | `oquery/` is a separate repository. Changes there (the `docs/` guide, the broken links, the `ToListWithTotal` fix, the FULENT rename, the `AGENT.md` rename) need a commit in that repository. | User decision. Nothing committed in the submodule. |
| O4 | `oquery/AGENT.md` keeps the name "AGENT" because it lives in the submodule. | Rename it with O3. |
| O5 | Nothing has been committed in the parent repository. The new and moved files are staged or untracked. | User commits when satisfied. |

## 8. Verification

- Scanned every Markdown link in the repository for local targets. Two broken
  links were found (section 6). No other broken links.
- Searched code for references to the moved files: none found.
- Checked that the instruction map targets exist: `docs/projects/*.md` and
  `oquery/AGENT.md`.
- Confirmed the "MQuery" count with a regex across the product files.
