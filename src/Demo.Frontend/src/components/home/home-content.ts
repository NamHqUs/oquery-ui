import type { IconName } from "../icon/icon";

export const PRODUCT_NAME = "OQuery";
export const GITHUB_URL = "https://github.com/NamHqUs/oquery-ui";
export const HERO_QUERY = "Products:";

export type HomeExample = {
  id: string;
  letter: string;
  title: string;
  summary: string;
  query: string;
};

// Every example is executed by the live engine against the northstar-demo metadata.
export const HOME_EXAMPLES: HomeExample[] = [
  {
    id: "view",
    letter: "A",
    title: "View data",
    summary: "Ask for an entity. See its data.",
    query: "Products:",
  },
  {
    id: "fields",
    letter: "B",
    title: "Choose the fields you need",
    summary: "Show only the information you need.",
    query: "Employees: FirstName",
  },
  {
    id: "relations",
    letter: "C",
    title: "Follow relationships",
    summary: "Ask for related information by name. No need to write the joins yourself.",
    query: "Employees: FirstName, Location.Name, Department.Name",
  },
  {
    id: "calculate",
    letter: "D",
    title: "Calculate values",
    summary: "Calculate values across related data without manually writing the grouping and join logic.",
    query: `Departments:
    Name,
    Employees.CountIf(
        Location.Name like <%Atlanta%>
    ) EmployeesInAtlanta`,
  },
  {
    id: "compare",
    letter: "E",
    title: "Compare calculated values",
    summary: `Use calculated values in your conditions. ${PRODUCT_NAME} works out the SQL operations required.`,
    query: `Products:
    Name,
    Revenue.Avg() Average,
    OrderItems.Sum(Quantity * UnitPrice) Revenue
WHERE Revenue > Average`,
  },
  {
    id: "hierarchy",
    letter: "F",
    title: "Explore hierarchical data",
    summary: "Query hierarchical data without manually building the recursive SQL.",
    query: `EmployeeTree is Employees:
    FirstName ManagerName,
    Members.Count(Id) TotalMembers,
    tree.FirstName MemberName,
    INNER JOIN EmployeeTree tree on Id = tree.ManagerId`,
  },
];

export type HomeCard = { icon: IconName; title: string; text: string; roadmap?: boolean };

export const REVEAL_POINTS = [
  "Work with business entities instead of database table names.",
  "Follow related information without writing join conditions.",
  "Use logical data structures that can combine multiple physical tables.",
  "Expose only the information an application or user should access.",
  "Adapt the available data model to different applications and customers.",
];

export const DEVELOPER_CARDS: HomeCard[] = [
  { icon: "table", title: "Entities", text: "Expose business-oriented entities rather than forcing consumers to understand physical tables." },
  { icon: "type", title: "Fields", text: "Choose which fields are available and map them to database columns or expressions." },
  { icon: "link", title: "Relationships", text: "Describe how entities connect so queries can navigate related data naturally." },
  { icon: "group", title: "Logical views", text: "Combine multiple physical tables into one logical entity, or expose different views of the same data." },
  { icon: "key", title: "Permissions", text: "Control which entities and fields are available to different consumers." },
];

export const INTERFACE_CARDS: (HomeCard & { audience: string; code?: string })[] = [
  { icon: "query", title: PRODUCT_NAME, text: "Express queries in concise, readable text.", audience: "For interactive query experiences, users, and programmatic clients.", code: HERO_QUERY },
  { icon: "code", title: "QueryDefinition", text: "Define queries with structured .NET classes.", audience: "For developers who prefer explicit, structured query definitions." },
  { icon: "function", title: "Fluent API", text: "Build queries naturally in C#.", audience: "For .NET developers who want a programmatic, fluent experience." },
  { icon: "upload", title: "Frontend API", text: "Submit dynamic queries over HTTP.", audience: "For frontend applications that need flexible data access without a dedicated endpoint per variation.", code: "POST /dynamic-query/query/from-text" },
];

export const USE_CASES: HomeCard[] = [
  { icon: "chart-bar", title: "Dynamic reporting", text: "Let users select fields, relationships, filters, and aggregations instead of implementing every report variation." },
  { icon: "operator", title: "Business conditions", text: "Define and evaluate conditions against application data without hardcoding every condition into backend code." },
  { icon: "chart-line", title: "Workflows and alerts", text: "Use query results and evaluated conditions to trigger workflows, notifications, and alerts." },
  { icon: "grid", title: "Dynamic frontend experiences", text: "Allow frontend applications to request different data combinations through a controlled API." },
  { icon: "schema", title: "Multi-tenant applications", text: "Provide tenant-specific logical data models, relationships, and permissions." },
  { icon: "query", title: "AI-assisted data exploration", text: "Help users discover and understand application data through guided, metadata-aware questions.", roadmap: true },
];

export const EXTENSION_CARDS: HomeCard[] = [
  { icon: "schema", title: "Define your data model", text: "Use YAML, JSON, or .NET to define the entities, fields, relationships, and permissions your application exposes." },
  { icon: "function", title: "Extend the query language", text: "Add functions and expressions through FunctionDefinition, including names, parser templates, and parameters." },
  { icon: "database", title: "Support different databases", text: "Use existing SQL dialects or extend the architecture with additional database providers." },
  { icon: "sliders", title: "Integrate with your application", text: "Embed the query engine and connect it to application-specific data models and access rules." },
];

export const SECURITY_POINTS: { text: string; roadmap?: boolean }[] = [
  { text: "Resolve entities and fields through the configured data model." },
  { text: "Enforce field-level permissions." },
  { text: "Generate parameterized SQL." },
  { text: "Validate query input before execution." },
  { text: "Apply tenant-aware access rules.", roadmap: true },
];

export const DATABASE_PROVIDERS: { name: string; icon: IconName }[] = [
  { name: "SQLite", icon: "sqlite" },
  { name: "SQL Server", icon: "sqlserver" },
  { name: "PostgreSQL", icon: "postgres" },
  { name: "CockroachDB", icon: "postgres" },
  { name: "MySQL / MariaDB", icon: "mysql" },
  { name: "Oracle", icon: "oracle" },
  { name: "Firebird", icon: "firebird" },
  { name: "IBM Db2", icon: "database" },
  { name: "SAP HANA", icon: "database" },
];
