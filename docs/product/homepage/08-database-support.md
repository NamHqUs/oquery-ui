# Homepage item 08: database support

## Purpose

Database support is a technical evaluation concern. The homepage should show
that OQuery has a dialect architecture while avoiding an unverified provider
matrix or implying identical behavior across databases.

## Message

### Heading

**One query model. Multiple databases.**

### Supporting copy

OQuery translates its common query representation into database-specific SQL
through its SQL dialect architecture.

## Provider display rules

Provider names must come from the current registered dialect modules or a
verified compatibility document. The UI may display a provider list loaded
from the application, but the content must define how that list is labeled:

- **Available** means registered and usable in the current deployment.
- **Supported** means covered by the project's compatibility/test evidence.
- **Roadmap** means planned and not available for execution.

Do not use “supports all features” for a provider unless the feature matrix
proves it.

## Required provider details

The linked compatibility page should document, where verified:

- provider name;
- supported engine/version range;
- connection or deployment prerequisites;
- query capabilities covered by tests;
- known dialect limitations;
- identifier, pagination, aggregate, and parameter behavior where relevant;
- date/time and type-specific caveats; and
- the last verification date.

The homepage should keep this information summarized and link out to the
detail. A list of names alone is not a compatibility guarantee.

## Connection action

The **View database connections** action opens the application's connection
view. It must not expose connection strings in the homepage, logs, or
documentation examples.

## Failure behavior

If provider discovery fails:

- keep the engine diagram understandable;
- show “Provider information unavailable” rather than an empty success state;
- do not infer provider support from a stale cached list; and
- provide a path to retry or read the compatibility documentation.

## Acceptance checklist

- [ ] Displayed providers are verified or explicitly runtime-discovered.
- [ ] Available, supported, and roadmap labels are distinct.
- [ ] No version range is published without evidence.
- [ ] Provider failures are visible.
- [ ] Connection credentials never appear in content.
