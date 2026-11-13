# MQuery Homepage

## Content strategy and section-by-section copy

> **Introduce metadata as the source of possibility, then prove its value immediately.**
>
> Make visitors curious with a question such as “What can metadata make possible?” Do not make them read an explanation before they see the answer. Immediately show a practical query—`Products:`—and real data returned by the engine.
>
> The story is: metadata gives MQuery an understanding of the application's data; that understanding lets people ask for data in a simpler, more natural way. The first screen should communicate both the idea and the practical result.
>
> MQuery's syntax is not the whole product. It is the easiest way to experience what the metadata foundation makes possible.

---

## 1. Header

**Logo:** MQuery

**Navigation**
- Playground
- Examples
- Documentation
- For Developers
- GitHub

**Primary action:** Try Playground

Keep navigation concise. The Playground should be the most visible destination.

---

## 2. Hero — Make metadata intriguing, then show what it enables

### Headline

# What can metadata make possible?

### Supporting text

Define your data once. MQuery uses that understanding of your entities, fields, and relationships to make querying simpler.

Keep this explanation short. The visitor should not need to understand the implementation before seeing the result.

### Immediate practical demonstration

Introduce the live Playground with a prompt:

**Ask for what your metadata makes possible:**

Preload the editor with:

```mquery
Products:
```

Show a real result table immediately beside or below the editor.

**Result panel**
- Product records from a safe sample dataset.
- A row count, if available.
- A collapsible **See how it works** or **View generated SQL** disclosure.

**Generated SQL preview**

```sql
SELECT ...
FROM sa.Products;
```

The exact SQL must come from actual engine output. Do not present illustrative SQL as generated output.

### Actions

- **Try it yourself** — focuses the editor or opens the Playground.
- **Explore examples** — jumps to the examples section.

### Small supporting line

Metadata gives MQuery the context. You simply ask for the data.

### Design direction

- Put the metadata question and practical query/result together in the first screen.
- Do not put a long metadata explanation before the Playground.
- Preload the example; never show an empty editor.
- Make the result visible immediately, not hidden behind a click.
- Keep the explanation short and concrete.
- Use the live example to answer the headline's question.

---

## 3. Discovery — It starts with one line

### Headline

# One line to start. More power when you need it.

### Supporting text

View data, follow relationships, calculate values, and explore more complex questions—all through the same query experience.

Present the examples as selectable tabs or cards. Selecting an example should load it into the Playground and show its real result.

### Example A — View data

**Query**

```mquery
Products:
```

**Short explanation**

Ask for an entity. See its data.

### Example B — Choose the fields you need

**Query**

```mquery
Employees: FirstName
```

**Short explanation**

Show only the information you need.

### Example C — Follow relationships

**Query**

```mquery
Employees: FirstName, Location.Name, Department.Name
```

**Short explanation**

Ask for related information by name. No need to write the joins yourself.

### Example D — Calculate values

**Query**

```mquery
Departments:
    Name,
    Employees.CountIf(
        Location.Name like <%Atlanta%>
    ) EmployeesInAtlanta
```

**Short explanation**

Calculate values across related data without manually writing the grouping and join logic.

### Example E — Compare calculated values

**Query**

```mquery
Products:
    Name,
    Revenue.Avg() Average,
    OrderItems.Sum(Quantity * UnitPrice) Revenue
WHERE Revenue > Average
```

**Short explanation**

Use calculated values in your conditions. MQuery works out the SQL operations required.

### Example F — Explore hierarchical data

**Query**

```mquery
EmployeeTree is Employees:
    FirstName ManagerName,
    Members.Count(Id) TotalMembers,
    tree.FirstName MemberName,
    INNER JOIN EmployeeTree tree on Id = tree.ManagerId
```

**Short explanation**

Query hierarchical data without manually building the recursive SQL.

**Section action:** Explore all examples

**Publishing rule:** Only show examples supported by the current implementation and verified against the public demo. If a feature is not executable yet, label it as a language example rather than implying it is available in the live Playground.

---

## 4. The reveal — What metadata actually makes possible

The hero has already introduced metadata and shown a working result. This section now explains the idea in practical terms and connects it to the capabilities visitors have just experienced.

### Headline

# Metadata gives MQuery an understanding of your data.

### Supporting text

Metadata describes the logical entities in your application, the fields they expose, and how those entities relate. MQuery uses that context to understand what you ask for and work out how to retrieve it from your database.

### Visual example

**Your application data**

```text
Employees
Locations
Departments
```

**What you want to see**

```text
Employee name
Location name
Department name
```

**Your query**

```mquery
Employees: FirstName, Location.Name, Department.Name
```

**What MQuery handles**

```text
Find the employee data
    |
Follow the Location relationship
    |
Follow the Department relationship
    |
Build the required database query
```

**Result:** An employee list with location and department names.

### Supporting points

- Work with business entities instead of database table names.
- Follow related information without writing join conditions.
- Use logical data structures that can combine multiple physical tables.
- Expose only the information an application or user should access.
- Adapt the available data model to different applications and customers.

**Action:** See how MQuery understands your data

Use the word “metadata” openly, but explain it through concrete examples rather than abstract architecture language. Show how the definitions enable the query experience visitors have already tried.

---

## 5. For developers — Shape the data experience

This is where the page can begin using more technical language. Visitors have already seen the experience and understand why the underlying model matters.

### Headline

# You define the data. MQuery makes it queryable.

### Supporting text

Every application has its own business concepts, data relationships, and access rules. MQuery lets developers define the logical data model their applications expose, independently of the physical database structure.

### What developers can define

**Entities**

Expose business-oriented entities rather than forcing consumers to understand physical tables.

**Fields**

Choose which fields are available and map them to database columns or expressions.

**Relationships**

Describe how entities connect so queries can navigate related data naturally.

**Logical views**

Combine multiple physical tables into one logical entity, or expose different views of the same underlying data.

**Permissions**

Control which entities and fields are available to different consumers.

**Tenant-specific definitions**

Provide different logical data models and permissions for different tenants.

### Technical detail

In MQuery's architecture, these definitions are called **Metadata**. They are the context that allows the query engine to understand entity names, field paths, relationships, and available operations.

Metadata can be defined through YAML, JSON, or programmatic .NET definitions.

**Action:** Explore metadata and entity definitions

---

## 6. One engine — Multiple ways to work

### Headline

# Your interface. One query engine.

### Supporting text

Use the interface that fits your application and development style. Every interface uses the same data model and feeds the MQuery engine.

### MQuery

**Express queries in concise, readable text.**

For interactive query experiences, users, and programmatic clients.

```mquery
Products:
```

### QueryDefinition

**Define queries with structured .NET classes.**

For developers who prefer explicit, structured query definitions.

### Fluent API

**Build queries naturally in C#.**

For .NET developers who want a programmatic, fluent experience.

### Frontend API

**Submit dynamic queries over HTTP.**

For frontend applications that need flexible data access without a dedicated backend endpoint for every query variation.

**Action:** Explore query interfaces

---

## 7. Use cases — What can you build?

### Headline

# From querying data to building dynamic applications.

### Supporting text

Use the same data model and query engine in different application scenarios.

### Dynamic reporting

Let users select fields, relationships, filters, and aggregations instead of requiring a developer to implement every report variation.

### Business conditions

Define and evaluate conditions against application data without hardcoding every condition into backend code.

### Workflows and alerts

Use query results and evaluated conditions to trigger application workflows, notifications, and alerts.

### Dynamic frontend experiences

Allow frontend applications to request different data combinations through a controlled API.

### Multi-tenant applications

Provide tenant-specific logical data models, relationships, and permissions.

**Action:** Explore use cases

---

## 8. Extend it to your application

### Headline

# Make it yours.

### Supporting text

MQuery is designed to fit different application architectures and evolve with your data model.

### Define your data model

Use YAML, JSON, or .NET to define the entities, fields, relationships, and permissions your application exposes.

### Extend the query language

Add functions and expressions through FunctionDefinition, including function names, parser templates, and parameters.

### Support different databases

Use existing SQL dialects or extend the architecture with additional database providers.

### Integrate with your application

Embed the query engine and connect it to application-specific data models and access rules.

**Action:** Explore extensibility

---

## 9. Security and control

### Headline

# Flexible data access. Defined boundaries.

### Supporting text

Dynamic querying should not mean unrestricted database access. MQuery uses the application's data definitions and access rules to control what a query can reach.

### Points to communicate

- Resolve entities and fields through the configured data model.
- Enforce field-level permissions.
- Apply tenant-aware access rules.
- Generate parameterized SQL.
- Validate query input before execution.

Only describe controls that are implemented and tested. Explain the actual enforcement points in the security documentation.

**Action:** Read the security documentation

---

## 10. Database support

### Headline

# One query model. Multiple databases.

### Supporting text

MQuery translates its common query representation into database-specific SQL through its SQL dialect architecture.

Display the database providers that are currently implemented and tested.

**Content to include**
- Provider name and supported version range, where verified.
- Supported query capabilities or known limitations, where relevant.
- Link to provider-specific documentation.

The project definition states that MQuery supports nine database providers. Publish the exact provider names only after verifying the current implementation.

**Action:** View database compatibility

---

## 11. Final call to action

### Headline

# Start with one query.

### Supporting text

Try a simple query, explore what MQuery can do, and see how it fits into your application.

**Primary action:** Open Playground

**Secondary action:** Read the documentation

---

## 12. Recommended visitor journey

The homepage should reveal information progressively:

| Visitor moment | What they see | What they should understand |
|---|---|---|
| First few seconds | “What can metadata make possible?” followed immediately by `Products:` and a result table | Metadata gives MQuery context, and that context makes querying simpler |
| First interaction | They edit and run a query | I can explore data myself |
| Exploring examples | Related fields and calculations | This can do much more than table browsing |
| Understanding the reveal | MQuery follows the application's data relationships | It knows how my data connects |
| Technical evaluation | Logical data definitions, interfaces, architecture, security | I can integrate and control it |
| Adoption | Documentation and Playground | I know where to start |

---

## 13. Implementation priorities

### Must have for the first release

1. A working Playground with `Products:` preloaded.
2. A real result table using a safe sample database.
3. A way to edit and execute the query.
4. A generated-SQL disclosure showing actual engine output.
5. Three or four working examples that demonstrate increasing capability.
6. Links to documentation and source code, if publicly available.

### Add as the product matures

1. Selectable examples that load into the Playground.
2. Visual query builder.
3. Logical data model visualization.
4. Database provider comparison.
5. Interactive architecture explanation.
6. AI-assisted query demonstration, once implemented and secured.

---

## 14. Copywriting and design rules

- Lead with a question about what metadata makes possible, then answer it immediately with a working example.
- Introduce metadata from the beginning, but explain it through visible outcomes rather than architecture terminology.
- Make `Products:` the practical proof—not a disconnected syntax hook.
- Show actual output next to the query.
- Keep explanations short and attach them to examples.
- Reveal how MQuery understands the application's data only after the visitor has seen the benefit.
- Use approachable language such as “your data model,” “business entities,” and “how your data connects” before introducing “metadata.”
- Treat MQuery syntax as a demonstration of the platform, not the entire product.
- Avoid blanket claims such as “no coding required”; setup and integration still require developers.
- Do not show generated SQL unless it is actual output from the engine.
- Make every primary CTA lead to a working destination.
- Keep deep technical explanations in documentation and lower-page sections for developers who want them.

## 15. The message to remember

Make visitors curious about what metadata makes possible, then show them immediately: `Products:` and the data it returns. Explain the underlying model after they have experienced the result.

**Show the simplicity first. Create curiosity. Reveal the capability. Explain the technology when the visitor is ready.**
