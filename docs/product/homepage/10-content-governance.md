# Homepage item 10: content governance and release checks

## Purpose

Homepage content is executable product communication. A query, provider name,
route, or capability claim can become incorrect when the engine or demo
changes. This document defines how to keep the separate content documents,
source constants, and live behavior aligned.

## Source-of-truth rules

1. Product definitions own the underlying product intent and architectural
   claims.
2. The individual homepage documents own section copy, evidence, audience,
   acceptance criteria, and links.
3. `home-content.ts` owns runtime query/example data consumed by the React
   page.
4. `home.tsx` owns section composition and interaction wiring.
5. OQuery core reference documents own syntax and execution guarantees.
6. API and frontend documentation owns routes, service ownership, and request
   behavior.

When two documents conflict, do not silently choose the more attractive copy.
Resolve the conflict at the canonical owner and update the homepage item.

## Change procedure

### Copy-only change

Update the relevant item document, then verify that the wording still matches
the current implementation. Do not edit React code for a documentation-only
request.

### Query example change

Update the item document and `home-content.ts` together. Run the query against
the current home/examples domain and verify the result and error states.

### Route or CTA change

Update the navigation document, the implementation, and the frontend API/page
documentation. Verify the destination from the running application.

### Capability claim change

Find the canonical engine/API/security evidence first. Add the claim only if
the implementation and tests support it. If the capability is planned, mark
it Roadmap in both content and UI.

## Required review checklist

- [ ] Brand is written as **OQuery**.
- [ ] No stale “MQuery” copy remains in the homepage content.
- [ ] Every code block uses the correct language fence.
- [ ] Every query example uses current entity, field, relationship, and
  function names.
- [ ] Every link target exists.
- [ ] Every provider claim has a verification source/date.
- [ ] Every security claim has an implementation/test source.
- [ ] Roadmap content is labeled.
- [ ] Loading, empty, and failure states are described where a live request is
  involved.
- [ ] Text is usable by screen readers and does not rely on color alone.

## Validation commands

The smallest useful validation is:

```powershell
git diff --check
```

For query or UI changes, also run the frontend checks documented in the
frontend project and execute the affected example through the live demo.
Documentation-only edits do not require a build, but links and terminology
must still be reviewed.

## Review output

A homepage content review should report:

- documents reviewed;
- claims changed;
- examples executed and their result status;
- links checked;
- unsupported or roadmap claims;
- follow-up implementation work; and
- any discrepancy between content and runtime behavior.

Do not hide a failed live example by deleting it from the document. Mark the
example unavailable and record the reason so the next contributor can resolve
the underlying issue.
