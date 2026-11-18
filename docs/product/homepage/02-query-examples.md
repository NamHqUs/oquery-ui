# Homepage item 02: query examples

## Purpose

The examples section proves that the hero is not a single hardcoded demo.
Each example should teach one capability, show executable OQuery text, and
let the visitor run or modify it in the same Playground.

## Section framing

### Kicker

`DISCOVERY`

### Heading

**One line to start. More power when you need it.**

### Introductory copy

View data, follow relationships, calculate values, and explore more complex
questions through the same query experience.

## Example contract

Every example is a data record with an ID, letter, title, summary, query, and
known demo prerequisites. The UI must not invent a result for an example that
cannot execute.

Each example card must communicate:

1. the question the query answers;
2. the OQuery text;
3. the concept being demonstrated;
4. whether the query is live in the current demo; and
5. an action that opens the example in the Playground.

## Required examples

### A — View data

```oquery
Products:
```

**Teaching point:** An entity name requests a logical collection. This is the
lowest-friction starting point.

### B — Choose fields

```oquery
Seller: FirstName, JobTitle, EmploymentType
```

**Teaching point:** A query can project only the fields needed by the
consumer. The example must use entity and field names present in the demo
metadata.

### C — Follow relationships

```oquery
# Who manages whom on the sales team?
Seller: FirstName, Department.Name, Manager.FirstName
```

**Teaching point:** A dotted path follows metadata relationships. The copy
must say that OQuery resolves the relationship; it must not imply that
arbitrary database joins are inferred without metadata.

### D — Calculate values

```oquery
# Which products are our top sellers?
Products:
    Name Product,
    Category,
    Items.Sum(Quantity) UnitsSold,
    Items.Count(distinct Order.Id) OrderCount,
    Items.Sum(Quantity * UnitPrice - DiscountAmount).Round(2) NetRevenue
  Order UnitsSold DESC
  Take 10
```

**Teaching point:** Aggregates can operate over related collections and can be
combined with ordering and limiting. The result should make the calculation
visible rather than only showing a successful status.

### E — Compare calculated values

```oquery
# Which products earn more than the average?
Products:
    Name,
    Items.Sum(Quantity * UnitPrice) Revenue,
    AverageOver(Revenue) AverageRevenue
  Where Revenue > AverageRevenue
```

**Teaching point:** A calculated value can participate in a condition. Keep
the wording precise: the engine lowers the request to the SQL operations
required by the supported query model.

### F — Explore hierarchy

```oquery
# Who reports to whom, and how big is each team?
EmployeeTree is Seller:
    Inner Join EmployeeTree tree on Id = tree.ManagerId
    Select
      FirstName ManagerName,
      Members.Count(Id) TotalMembers,
      tree.FirstName MemberName,
```

**Teaching point:** Named contexts and recursive relationships can represent
hierarchical reads. This example must be marked unavailable rather than shown
as live if the current demo cannot execute it.

### G — Combine complex filters

Use the maintained query in
[`home-content.ts`](../../../src/OQuery.UI.Frontend/src/components/home/home-content.ts)
as the source for this example. It demonstrates `AND`, `OR`, ranges, lists,
patterns, `Any`, and `NotAny` in a seller/order scenario.

**Teaching point:** Complex conditions remain attached to logical entities and
relationships instead of requiring a new endpoint for every filter combination.

## Interaction behavior

- Selecting a tab updates the active example without a full page navigation.
- The selected query is copied into an editable Playground.
- “Explore More” opens Query Builder with the examples domain and a valid
  starter request.
- The result panel shows loading, success, empty, and error states.
- A failed example must identify the unsupported prerequisite.
- Switching examples must not silently report the previous example's result as
  the current result.

## Content rules

- Keep each summary to one sentence.
- Describe the user-visible outcome before implementation vocabulary.
- Use “relationship” or “collection” when that is what the query expresses;
  do not call every path a join.
- Never display SQL as generated output unless it came from the engine.
- Verify every query against the current northstar demo metadata before release.

## Acceptance checklist

- [ ] Each visible example has a stable ID and a unique title.
- [ ] Each executable example runs in the current demo.
- [ ] Each unsupported example is explicitly labeled.
- [ ] The selected query and result stay synchronized.
- [ ] Examples demonstrate increasing capability rather than repeating simple
  entity selection.
