import type { IconName } from "../shared/icon/icon";

export const PRODUCT_NAME = "OQuery";
export const GITHUB_URL = "https://github.com/NamHqUs/oquery-ui";
export const HERO_QUERY = "Products:";
export const HERO_TEAM_QUERY = [
  "# Which sellers lead teams of more than five people?",
  "Seller: FirstName, LastName, Members.Count() TeamSize",
  "Where TeamSize > 5",
].join("\n");

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
    query: "Seller: FirstName,  JobTitle,  EmploymentType",
  },
  {
    id: "relations",
    letter: "C",
    title: "Follow relationships",
    summary: "Ask for related information by name. No need to write the joins yourself.",
    query: `# Who manages whom on the sales team?
Seller: FirstName, Department.Name, Manager.FirstName`,
  },
  {
    id: "calculate",
    letter: "D",
    title: "Calculate values",
    summary: "Calculate values across related data without manually writing the grouping and join logic.",
    query: `# Which products are our top sellers?
Products:
    Name Product,
    Category,
    Items.Sum(Quantity) UnitsSold,
    Items.Count(distinct Order.Id) OrderCount,
    Items.Sum(Quantity * UnitPrice - DiscountAmount).Round(2) NetRevenue
  Order UnitsSold DESC
  Take 10`,
  },
  {
    id: "compare",
    letter: "E",
    title: "Compare calculated values",
    summary: `Use calculated values in your conditions. ${PRODUCT_NAME} works out the SQL operations required.`,
    query: `# Which products earn more than the average?
Products:
    Name,
    Items.Sum(Quantity * UnitPrice) Revenue,
    AverageOver(Revenue) AverageRevenue
  Where Revenue > AverageRevenue`,
  },
  {
    id: "hierarchy",
    letter: "F",
    title: "Explore hierarchical data",
    summary: "Query hierarchical data without manually building the recursive SQL.",
    query: `# Who reports to whom, and how big is each team?
EmployeeTree is Seller:
    Inner Join EmployeeTree tree on Id = tree.ManagerId
    Select 
      FirstName ManagerName,
      Members.Count(Id) TotalMembers,
      tree.FirstName MemberName,`,
  },
  {
    id: "filters",
    letter: "G",
    title: "Filter with complex conditions",
    summary: "Combine AND, OR, ranges, lists, and patterns across a seller's orders.",
    query: `# Who is closing the best retail deals?
Seller:
    FirstName + < > + LastName SalesRep,
    EmploymentType,
    Department.Name Department,
    Orders.CountIf(Status = <Completed>) CompletedOrders
  Where Department.Name = <Retail Sales> AND
    (EmploymentType = <Full-time> OR JobTitle like <%Sales%>) AND
    Orders.Any(Status = <Completed> AND Channel In <Online, Retail Store> AND OrderDate between <2025-06-01,2025-10-31>) AND
    Orders.NotAny(Status = <Cancelled>)
  Order CompletedOrders DESC, SalesRep
  Take 20`,
  },
];

export type HomeCard = { icon: IconName; title: string; text: string; roadmap?: boolean };

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

export const HERO_BENEFITS: HomeCard[] = [
  { icon: "database", title: "Table changed?", text: "No query changes. Update the table's definition only." },
  { icon: "operator", title: "New business rule?", text: "No app rebuild. Rules are defined, not compiled in." },
  { icon: "query", title: "Users need new views?", text: "No backend coding. They pick fields and filters on screen." },
  { icon: "schema", title: "Same table, different teams?", text: "No one-table-fits-all. Each domain sets logic per team." },
];

export const HERO_FIT_GOOD = [
  "Internal reports and dashboards",
  "Back-office and admin search",
  "Self-service data explorers",
  "Several business areas on one database",
  "Business rules that change often",
];

export const HERO_FIT_POOR = [
  "Apps that modify data (OQuery only reads)",
  "One-off scripts with a fixed query",
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
