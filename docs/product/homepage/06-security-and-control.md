# Homepage item 06: security and control

## Purpose

Dynamic querying must be presented as controlled access to an application data
model, not as a raw SQL console. This section establishes the boundary and
links to the authoritative implementation/security documentation.

## Section framing

### Kicker

`SECURITY AND CONTROL`

### Heading

**Flexible data access. Defined boundaries.**

### Introductory copy

Dynamic querying should not mean unrestricted database access. OQuery uses the
application's data definitions and access rules to control what a query can
reach.

## Current claims

The homepage may list these controls when they match the current code and
tests:

1. **Resolve entities and fields through the configured data model.** A
   consumer cannot use a logical field that is not available in the query
   metadata.
2. **Enforce field-level permissions.** Exposed fields must be filtered by the
   application's authorization model where the integration supports it.
3. **Generate parameterized SQL.** Values supplied by the query are represented
   through the engine's parameterization path rather than concatenated into
   SQL.
4. **Validate query input before execution.** Syntax, model, and supported
   operation errors must be surfaced before the database executes the request.

## Roadmap claims

Tenant-aware access rules must be labeled **Roadmap** unless the current
release has a verified implementation and test. Roadmap text must not appear
in the same visual style as shipped controls without a clear label.

## Security language rules

Prefer:

- “configured data model”
- “application access rules”
- “validated before execution”
- “controlled query surface”

Avoid:

- “secure by default” unless the integration contract proves it;
- “impossible to access unauthorized data”;
- “SQL injection is impossible”;
- “permissions are automatic”; and
- “multi-tenant isolation” unless tenant resolution and enforcement are
  actually part of the deployed path.

The homepage cannot establish authorization by copy alone. The backend trust
boundary and integration contract are authoritative.

## Error behavior

If the live demo cannot load metadata or execute a query, show an explicit
error state. Never replace a security or authorization failure with an empty
success-shaped result.

## Link target

The security action must open the security/architecture documentation or the
most authoritative documentation page available. If no dedicated page exists,
the content owner must create one before adding stronger security claims.

## Acceptance checklist

- [ ] Shipped controls and roadmap items are visually distinguished.
- [ ] No absolute security guarantee appears without evidence.
- [ ] The section describes authorization as an application boundary.
- [ ] Query validation and parameterization claims match current tests.
- [ ] Errors are visible and not converted into empty results.
