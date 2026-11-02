# YAML Editor - Root and Nested Empty-Line Behavior Review

Reviewed the YAML editor at:
`http://127.0.0.1:4173/query-builder?section=diagram&request=HR+2.+Manager+span+and+team+profile`

## Change verified

The Enter behavior now depends on the current indentation level:

- Empty root-level line: inserts a new line.
- Empty indented line: removes one indentation level in place.

## Root-level behavior

Input:

```yaml
Entity: Users
```

Pressing Enter at the root produces a new line:

```yaml
Entity: Users

```

## Nested context behavior

Input with an empty deeply indented projection line:

```yaml
Entity: Users
Contexts:
  - Name: ReviewSummary
    Query:
      Entity: PerformanceReviews
      Projection:
          
```

Pressing Enter removes one indentation level without inserting another line:

```yaml
Entity: Users
Contexts:
  - Name: ReviewSummary
    Query:
      Entity: PerformanceReviews
      Projection:
        
```

Repeated Enter presses continue moving the caret toward the parent indentation
level in place.

## Verification results

- Root empty line creates a new line: passed.
- Indented empty line dedents in place: passed.
- Nested context projection dedents one level: passed.
- No unwanted list marker is created: passed.
- Frontend build: passed.

## Overall assessment

The editor now preserves normal root-level newline behavior while providing
in-place multi-level dedentation for nested YAML structures.
