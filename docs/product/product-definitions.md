# Meta Query (MQuery)

## A Dynamic Query Platform for Applications

> **Internal technical definition:** MQuery is a metadata-driven query platform. Its metadata model is what gives the query engine the context to understand logical business data, provide a customizable query experience, and translate user intent into database-specific SQL.
>
> **Product-facing principle:** Lead with what people can do, not with the internal mechanism. Visitors should experience the simplicity first. Explain the underlying model only after they understand its value.

## 1. Vision

Make data accessible, queryable, and actionable without requiring developers to hardcode every business scenario.

MQuery provides a flexible way for applications, developers, and users to work with data. It introduces a logical layer between applications and physical databases, together with a query engine that understands the application's data model.

Instead of implementing a separate backend endpoint, query, or business rule for every reporting requirement and data scenario, applications can use shared data definitions and dynamic query capabilities to respond to changing requirements at runtime.

**Core idea:** Define how an application exposes and relates its data, then let different consumers query and use that data through multiple interfaces.

## 2. The Problem

Companies and software projects frequently need to access and interact with data in ways that were not anticipated when an application was first built.

Traditional application development commonly requires developers to:

1. Define database entities and classes.
2. Write query implementations and business logic.
3. Build APIs to expose the required data.
4. Test and deploy the implementation.

This works well for predefined scenarios, but becomes restrictive when requirements change frequently.

In practice:

- New reporting requirements emerge.
- Existing filters, conditions, and business rules need to change.
- Users need different data views and filtering capabilities.
- Business relationships and reporting requirements evolve.
- Applications need to evaluate conditions and trigger actions dynamically.
- Frontend applications need different combinations of data without requiring a new backend implementation for every combination.
- Different applications or tenants may need different logical views of the same underlying database.

Each new scenario can require code changes, testing, and deployment. The application becomes increasingly dependent on predefined implementations, even when the underlying need is simply to retrieve or evaluate data differently.

## 3. The Solution

MQuery introduces a logical data model between applications and physical databases.

Rather than requiring every consumer to understand physical tables, columns, and foreign-key relationships, developers define the data concepts that an application should expose. Consumers query those logical entities and relationships.

This model is called **Metadata** within the MQuery architecture.

Metadata describes:

- **Entities** and their underlying database mappings.
- **Fields** and their physical column or expression mappings.
- **Relationships** between entities.
- **Logical data structures** that can combine multiple physical tables.
- **Available fields and permissions** for different consumers.
- **The query context** that determines which entities, fields, relationships, and expressions are meaningful and available.

The model is similar in concept to Entity Framework metadata, but MQuery metadata can be defined and changed dynamically at runtime through YAML, JSON, or programmatic definitions.

An entity does not have to map one-to-one to a physical table. It can expose a subset of fields, combine multiple tables, or present a business-oriented view of the data.

### 3.1 Metadata does more than describe the database

Metadata is not merely a mapping configuration used to translate logical names into table and column names. It provides the context that makes MQuery's query experience possible.

The query engine uses metadata to understand:

- What an entity means in the current application context.
- Which fields belong to that entity.
- How entities are related.
- Which paths can be followed to reach related data.
- Which fields and relationships are available to the current consumer.
- How a logical request should be translated into physical database operations.

This context allows MQuery to offer a query experience that is different from traditional SQL.

For example, a consumer can write:

```mquery
Employees: FirstName, Location.Name, Department.Name
```

The consumer does not need to know the physical tables, foreign keys, aliases, or join conditions. The engine understands the logical relationships and generates the necessary SQL.

### 3.2 Metadata enables a customizable query experience

This is a central architectural principle of MQuery.

Without a logical model that describes the data and its relationships, a query engine has limited context. It generally has to expose database-oriented concepts or rely on hardcoded assumptions.

Because MQuery has that context, it can provide a more natural and application-specific query experience:

- Consumers query logical entities rather than physical tables.
- Related fields can be addressed through their logical paths.
- Relationships and joins can be resolved automatically.
- Aggregations can be expressed in the context of related entities.
- Complex SQL operations can be represented through higher-level expressions.
- Applications can expose different logical data models without changing the core engine.
- The available query vocabulary and capabilities can be extended.

**The important distinction:** MQuery does not merely shorten SQL. Its data model gives the query engine enough context to interpret a different, more expressive way of asking for data.

## 4. Platform Capabilities

MQuery is broader than SQL generation. The query engine is the core execution component; the platform capabilities use the logical data model and query engine to support dynamic data experiences.

### 4.1 Multi-Tenant SaaS

MQuery supports multi-tenant SaaS applications. Each tenant can have its own:

- Entities and metadata definitions.
- Tables and fields.
- Relationships.
- Data access permissions.
- Logical data structures.
- Exposed query context.

This allows applications to provide tenant-specific data models without requiring a separate query engine implementation for each tenant.

### 4.2 Dynamic Reporting

Applications and users can build reports dynamically using the logical data model instead of relying exclusively on predefined SQL queries or hardcoded report implementations.

Users can select fields, relationships, filters, and aggregations according to their permissions.

### 4.3 Dynamic Conditions, Workflows, and Alerts

Applications can define and evaluate conditions dynamically against the logical data model.

Instead of implementing every condition in backend business logic, applications can define conditions and use their results to trigger workflows, notifications, or alerts.

### 4.4 Dynamic Frontend Data Logic

Frontend applications can build data queries and filtering logic dynamically without requiring a dedicated backend implementation for every scenario.

This offers another approach to rigid, predefined API endpoints and can complement or provide an alternative to technologies such as OData and GraphQL.

## 5. Query Interfaces

MQuery provides multiple ways to define a query. All interfaces use the same logical data model and ultimately feed the same query engine.

The query interfaces are different ways to express the same underlying data request. They do not each implement their own query semantics or SQL generation.

### 5.1 MQuery — Plain-Text Query Syntax

MQuery (Meta Query) is a simplified, context-aware query syntax.

Traditional SQL exposes concepts such as `GROUP BY`, `HAVING`, aggregate functions, window functions, `CASE` expressions, and joins. MQuery aims to let users express the intended data request without having to manage all of those SQL mechanics explicitly.

The syntax is not the foundation of the platform by itself. Its capabilities come from the logical data model and the context supplied to the query engine. That context is what allows MQuery to interpret entity names, relationship paths, fields, and expressions meaningfully.

The syntax is designed for people as well as programmatic clients, including applications and APIs.

#### Basic query

```mquery
Products:
```

This requests the `Products` logical entity. The engine resolves the entity through metadata and generates the corresponding SQL.

Equivalent SQL:

```sql
SELECT * FROM sa.Products;
```

The short expression works because the engine already knows what `Products` represents and how it maps to the database.

#### Automatic relationships

```mquery
Employees: FirstName, Location.Name, Department.Name
```

MQuery resolves the entity relationships from metadata and generates the required joins.

Equivalent SQL (illustrative):

```sql
SELECT
    t0."FirstName" "FirstName",
    t1."Name" "Location.Name",
    t2."Name" "Department.Name"
FROM "Main"."Employees" t0
LEFT JOIN "Main"."Locations" t1 ON t1."Id" = t0."LocationId"
LEFT JOIN "hr"."Departments" t2 ON t2."Id" = t0."DepartmentId";
```

#### Recursive queries

```mquery
EmployeeTree is Employees:
    FirstName ManagerName,
    Members.Count(Id) TotalMembers,
    tree.FirstName MemberName,
    INNER JOIN EmployeeTree tree on Id = tree.ManagerId
```

MQuery supports recursive query definitions and translates them into recursive CTE statements.

#### Fluent aggregation

```mquery
Departments:
    Name,
    Employees.CountIf(
        Location.Name like <%Atlanta%>
    ) EmployeesInAtlanta
```

MQuery supports fluent aggregate expressions, including conditional aggregation, without requiring users to explicitly define complex joins and `GROUP BY` statements. Native aggregate expressions are also supported.

#### Automatic aggregate and window operations

```mquery
Products:
    Name,
    Revenue.Avg() Average,
    OrderItems.Sum(Quantity * UnitPrice) Revenue
WHERE Revenue > Average
```

MQuery can resolve aggregate dependencies and generate the required intermediate queries and window operations.

These examples illustrate the goal: users express the data they want, while MQuery uses the available data context to determine the SQL structure needed to retrieve it.

MQuery text is translated into a structured QueryDefinition and compiled by MQueryEngine.

### 5.2 QueryDefinition

QueryDefinition is a structured, .NET-based way to define queries.

Developers use .NET classes to describe query structure, fields, relationships, conditions, and other query components. The resulting definition is passed to MQueryEngine for compilation and execution.

### 5.3 Fluent API

Fluent provides a programmatic query interface for .NET developers.

Developers write queries using C# fluent syntax. The API compiles these expressions into the same internal query representation used by the other interfaces.

### 5.4 Frontend API

The Frontend API exposes MQuery capabilities to applications over HTTP.

Frontend applications can submit dynamic query definitions without requiring every query scenario to have a dedicated backend implementation. The API uses the same logical data model, permissions, and query execution infrastructure.

## 6. MQuery Engine

MQueryEngine is the central query compilation and execution component of the platform.

It receives input from the supported query interfaces, resolves that input against metadata and function definitions, creates an intermediate representation (IR), and translates the IR into database-specific SQL statements and parameters.

The engine separates the query interface from the database implementation. Different interfaces can express the same logical query, and different SQL dialects can generate database-specific statements from the shared representation.

The engine is extensible through metadata providers, function definitions, and SQL dialect implementations.

## 7. Architecture

### 7.1 Data flow

```text
Query Inputs
    |
    v
MQueryEngine
    |
    +-- MetadataProvider
    |
    +-- FunctionDefinitionProvider
    |
    +-- SqlDialect
    |
    v
Intermediate Representation (IR)
    |
    v
SqlGenerator
    |
    v
SQL Statement + Parameters
    |
    v
Database Execution
```

The query inputs include MQuery text, QueryDefinition, Fluent expressions, and requests submitted through the Frontend API.

### 7.2 Core components

#### Metadata

Metadata defines the logical data model exposed to applications and users.

It includes:

- Entities mapped to physical database tables or views.
- Fields mapped to physical columns or expressions.
- Relationships between entities.
- Logical entities combining multiple physical tables.
- Subsets of fields exposed to different consumers.
- Permission definitions.
- Tenant- or application-specific logical definitions.

A logical entity does not have to correspond directly to one physical database table. It can represent a business-oriented view over multiple physical structures.

#### FunctionDefinition

FunctionDefinition provides an extensibility mechanism for the MQuery language.

Developers can extend the query vocabulary by defining:

- Function names.
- Parser templates.
- Function parameters.
- Function-specific behavior.

This allows the language to be extended without hardcoding every supported function into the parser.

Function definitions extend the expressions the query engine can understand. Metadata supplies the data context in which those expressions are interpreted.

#### SQL Dialects

SQL Dialects provide database-specific SQL generation.

Developers can inherit and extend existing dialect implementations or introduce new database providers. MQuery currently supports nine database providers.

#### Intermediate Representation (IR)

IR provides a common internal representation of queries, separating input syntax from SQL generation.

Different query interfaces can produce the same logical query representation, allowing the engine to reuse its compilation and SQL generation infrastructure.

#### SqlGenerator

SqlGenerator translates IR into database-specific SQL statements and parameters using the selected SQL dialect.

## 8. Security and Access Control

Security is part of the query compilation and execution path. Dynamic querying must not mean unrestricted database access.

The security model includes:

- Field-level permission checks during query resolution and SQL generation.
- Tenant-aware metadata and data access.
- Parameterized SQL generation.
- Validation of query input and supported expressions.
- Validation of generated statements before execution, where applicable.
- Enforcement of application-defined access rules.

The engine should resolve requested entities, fields, and relationships against authorized metadata before generating SQL. Values should be passed as parameters rather than concatenated into SQL.

Any SQL-injection detection or guardrail should be applied before execution; a check performed only after a query has executed cannot prevent an injection that already occurred.

## 9. Extensibility and Integration

MQuery is designed to be embedded in applications and extended to fit different environments.

Its extension points include:

- Metadata providers and programmatic metadata definitions.
- YAML and JSON metadata definitions.
- Function definitions that extend the query vocabulary.
- SQL dialects and database providers.
- Application-specific entities, fields, relationships, and permissions.
- Tenant-specific logical data models.
- Multiple query interfaces feeding one engine.

The combination of metadata and function definitions is important: metadata defines the data context, while function definitions extend the operations and expressions available within that context.

## 10. Product Experience and Potential Platform Tools

The query engine is the foundation. A platform experience can make its capabilities accessible to developers and users.

The following are recommended product capabilities to consider; they are product directions, not claims that every capability is already implemented.

### Metadata Designer

A visual interface for defining entities, fields, relationships, mappings, and permissions.

### Query Playground

An environment where users can write MQuery, inspect generated SQL, execute queries, and view results.

The Playground should demonstrate the relationship between a short logical query and the SQL generated from it. For example, visitors should be able to enter `Products:` and immediately see the corresponding data.

### Visual Query Builder

A visual way to select entities, fields, relationships, filters, and aggregations, with the resulting query represented through MQuery or QueryDefinition.

### Dynamic Rules and Conditions

A way for applications to define, evaluate, and manage conditions that can drive workflows, alerts, and other actions.

### AI-Assisted Querying

An AI integration can discover relevant metadata and function definitions, then generate MQuery or structured query input. The engine remains responsible for validating permissions and compiling the request; AI-generated input is not trusted as executable SQL.

## 11. Positioning

MQuery is a platform for building dynamic data experiences in applications. Its technical foundation is a metadata-driven query engine, but the value to users and application developers is what that foundation makes possible.

MQuery is not simply a shorter SQL syntax or a SQL query builder.

- It is not an ORM intended to replace Entity Framework.
- It is not only a BI or reporting product.
- It is not a replacement for the underlying database.
- It is not limited to one query syntax or one application interface.

MQuery provides a logical data layer and a unified query engine that applications can use for dynamic querying, reporting, conditions, and data-driven experiences.

**Define how your application exposes data. Let people and applications query it naturally. Build dynamic experiences without hardcoding every scenario.**

---

## 12. Product Messaging Principle

The internal architecture uses the term **metadata**. Public-facing messaging should not lead with that term.

For most visitors, “metadata” sounds like an implementation detail and creates a new concept they must understand before they see the product's value.

The public experience should follow this order:

1. Show a simple query such as `Products:`.
2. Show the actual data returned.
3. Demonstrate related fields, calculations, and more complex queries.
4. Let visitors discover that the query engine understands the application's data and relationships.
5. Explain the logical data model in approachable language.
6. Introduce the technical term **metadata** in developer documentation, architecture explanations, and deeper technical material.

This is a messaging decision, not an architectural change. Metadata remains central to how MQuery works; it simply does not need to be the first thing a visitor reads.

## 13. Design Philosophy and Differentiation

MQuery is designed to make database querying easier without requiring developers to adopt an entirely different query-language model.

Its design principle is: **preserve the familiarity and expressive power of SQL while reducing the complexity users must manage themselves.**

### 13.1 SQL familiarity

MQuery intentionally stays close to the concepts developers already know from SQL. Concepts such as selecting entities and fields, filtering data, navigating relationships, and expressing calculations should feel recognizable.

MQuery is not intended to make developers learn a completely new way of thinking about data just to perform familiar query tasks. Its syntax should be approachable to developers with SQL experience, while remaining suitable for application users and programmatic clients.

### 13.2 Reduce query complexity, not query capability

Traditional SQL often requires users to manage implementation details explicitly, including:

- Writing joins and maintaining join conditions.
- Repeating relationship paths and table aliases.
- Constructing conditional aggregates and grouping logic.
- Managing intermediate queries, subqueries, and CTEs.
- Understanding when aggregate calculations require window functions or additional query layers.

MQuery aims to let users express the intended result while the engine resolves these details using metadata and query context.

For example, metadata allows `Location.Name` to represent a relationship path and allows `Employees.CountIf(...)` to express a conditional aggregate without requiring the consumer to manually construct every join and grouping operation.

The goal is not to remove advanced querying capabilities. It is to make those capabilities easier to express and use. MQuery should retain the ability to represent complex queries while reducing the amount of SQL machinery users need to write and maintain.

### 13.3 Metadata is what makes the simpler syntax possible

The SQL-like syntax and metadata model are not independent features. Metadata is what gives the query engine enough context to simplify query expression safely and consistently.

Metadata tells the engine what logical entities and fields mean, how relationships connect, which paths are valid, and what the current consumer is allowed to access. With that context, the engine can interpret concise expressions and generate the required database operations.

Without this context, a shorter syntax would mostly be a different spelling of SQL. With it, MQuery can understand application-specific data concepts and resolve details that would otherwise need to be written explicitly.

### 13.4 Reuse without changing the query-language philosophy

Reusable queries, shared definitions, and composable query structures are valuable capabilities. MQuery can support reuse through structured QueryDefinition objects and query composition while keeping its SQL-like query experience.

Reuse should complement the language rather than force users into a separate syntax or mental model. The objective is to make common query logic reusable without making everyday queries harder to read or learn.

### 13.5 Competitive reference: Malloy

Malloy is a relevant point of comparison because it combines a data model with a query language and supports reusable query logic. Its approach introduces its own modeling and query-language concepts.

MQuery takes a different design direction:

- **Malloy:** provides a distinct language and modeling approach for describing and querying data.
- **MQuery:** aims to retain a SQL-like experience while using metadata to hide much of the complexity involved in expressing and compiling queries.

This is a difference in design philosophy, not a claim that one language is universally more capable or that Malloy lacks useful abstractions. Malloy's reusable definitions and relationship-aware querying address real problems. MQuery's intended distinction is that developers can build on familiar SQL concepts instead of adopting a substantially different query-language model.

Other products, including semantic-layer and data API platforms, also overlap with parts of MQuery's architecture. MQuery should therefore be differentiated by its complete combination of capabilities and its application-development use cases—not by claiming that metadata, reusable queries, relationship resolution, or SQL generation are unique by themselves.

### 13.6 Design principles to protect

The following principles should guide future language and engine decisions:

1. **Familiarity over novelty:** Introduce new syntax only when it provides a meaningful improvement over familiar SQL concepts.
2. **Simplify expression, preserve capability:** Hide query implementation complexity without arbitrarily limiting what users can express.
3. **Use context instead of hardcoded assumptions:** Resolve entities, fields, relationships, permissions, and operations through metadata and definitions.
4. **Keep interfaces unified:** MQuery text, QueryDefinition, Fluent, and the Frontend API should converge on the same query semantics and engine.
5. **Make reuse composable:** Support reusable query definitions without making the everyday query syntax unnecessarily complex.
6. **Keep generated SQL transparent:** Developers should be able to inspect the SQL and parameters produced by the engine when debugging or validating behavior.

**Differentiation statement:** MQuery lets developers express database queries using familiar SQL concepts while its metadata-aware engine handles much of the complexity traditionally required to build those queries.
