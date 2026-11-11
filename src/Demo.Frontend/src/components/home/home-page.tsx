import { useEffect, useRef, useState, type PointerEvent } from "react";
import Icon, { type IconName } from "../icon/icon";
import type { FunctionDefinition } from "../function-definition/types";
import OQueryEditor from "../oquery-editor/oquery-editor";
import { getOQuerySuggestionData } from "../oquery-editor/oquery-suggestion-data";
import type { DomainRelation, MetadataEntity, QueryResult } from "../query-builder/query-design/query-builder-slice";
import BarChart from "../charts/bar-chart/bar-chart";
import type { SimpleChartData } from "../charts/chart-types";
import type { DemoExampleKey } from "./home-demo-examples";
type DemoResultView = "grid" | "orgchart" | "barchart";
type DemoRepresentation = "query" | "csharp" | "sql";
type DemoResultViewOption = { value: DemoResultView; label: string };
const demoViewOptions: Record<DemoExampleKey, DemoResultViewOption[]> = {
  products: [{ value: "grid", label: "Grid" }],
  traversal: [{ value: "grid", label: "Grid" }],
  recursive: [
    { value: "orgchart", label: "OrgChart" },
    { value: "grid", label: "Grid" },
  ],
  revenue: [
    { value: "barchart", label: "BarChart" },
    { value: "grid", label: "Grid" },
  ],
};

function demoViewIcon(view: DemoResultView): IconName {
  switch (view) {
    case "grid": return "table";
    case "orgchart": return "schema";
    case "barchart": return "chart-bar";
  }
}
const PRODUCTS_OQUERY = "Products:";
const TRAVERSAL_OQUERY = "Orders: Id, OrderDate, User.FirstName, User.LastName";
const PRODUCT_SALES_OQUERY = `Products: 
    Name,
    Revenue.Avg() Average,
    OrderItems.Sum(Quantity * UnitPrice) Revenue
WHERE Revenue > Average`;
const PRODUCT_SALES_SQL = `SELECT *
FROM (
    SELECT p.Name,
        SUM(oi.Quantity * oi.UnitPrice) AS TotalRevenue,
        AVG(SUM(oi.Quantity * oi.UnitPrice)) OVER () AS Average
    FROM sa.OrderItems oi
    JOIN sa.Products p ON p.Id = oi.ProductId
    GROUP BY p.Name
) ProductSales
WHERE ProductSales.TotalRevenue > ProductSales.Average;`;
const EMPLOYEE_TREE_OQUERY = `EmployeeTree is Employees:
    FirstName ManagerName,
    Members.Count(Id) TotalMembers,
    tree.FirstName MemberName,
  INNER JOIN EmployeeTree tree on Id = tree.ManagerId`;
const EMPLOYEE_TREE_SQL = `WITH EmployeeTree AS
(
    SELECT
        e.Id,
        e.ManagerId
    FROM Main.Employees AS e
    WHERE e.ManagerId IS NULL

    UNION ALL

    SELECT
        e.Id,
        e.ManagerId
    FROM Main.Employees AS e
    INNER JOIN EmployeeTree AS tree
        ON e.ManagerId = tree.Id
)
SELECT
    manager.FirstName AS ManagerName,
    member.FirstName AS MemberName,
    COUNT(member.Id) OVER (
        PARTITION BY manager.Id
    ) AS TotalMembers
FROM EmployeeTree AS tree
INNER JOIN Main.Employees AS member
    ON member.Id = tree.Id
LEFT JOIN Main.Employees AS manager
    ON manager.Id = tree.ManagerId;`;
const PRODUCTS_CSHARP = `var products = db.Query("Products")
    .ToList();`;
const TRAVERSAL_CSHARP = `var orders = db.Query("Orders")
    .Select("Id", "OrderDate", "User.FirstName", "User.LastName")
    .ToList();`;
const RECURSIVE_CSHARP = `var employees = db.Query("Employees")
    .Recursive("Members", (manager, members) => new
    {
        ManagerName = manager["FirstName"],
        MemberName = members["FirstName"],
        TotalMembers = members["Id"].Count()
    })
    .ToList();`;
const REVENUE_CSHARP = `var sales = db.Query("OrderItems")
    .Select(item => new
    {
        ProductName = "Product.Name",
        TotalRevenue = "SUM(Quantity * UnitPrice)",
        Average = "AverageOver(TotalRevenue)"
    })
    .Where(item => item["TotalRevenue"] > item["Average"])
    .ToList();`;

const demoSqlKeywords = new Set([
  "WITH", "SELECT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER", "LIMIT", "OFFSET",
  "ASC", "DESC", "AS", "AND", "OR", "IN", "IS", "NULL", "LIKE", "JOIN", "LEFT", "RIGHT",
  "INNER", "OUTER", "ON", "DISTINCT", "TOP", "UNION", "ALL", "OVER", "PARTITION",
]);
const demoSqlContexts = new Set(["EMPLOYEETREE", "PRODUCTSALES"]);
const demoSqlTables = new Set(["EMPLOYEES", "ORDERITEMS", "PRODUCTS"]);
const demoCSharpKeywords = new Set([
  "VAR", "NEW", "OBJECT", "NULL", "TRUE", "FALSE", "USING", "DICTIONARY", "QUERY", "RECURSIVE", "SELECT", "WHERE", "TOLIST"
]);
const demoCSharpTypes = new Set(["DICTIONARY", "STRING", "OBJECT"]);

function highlightDemoQuery(query: string, language: DemoRepresentation, functionDefinitions: FunctionDefinition[]) {
  const keywords = language === "sql" ? demoSqlKeywords : demoCSharpKeywords;
  const functions = new Set(functionDefinitions.map((definition) => definition.name.toLocaleUpperCase()));
  const contexts = language === "sql" ? demoSqlContexts : new Set(["DB"]);
  const tables = language === "sql" ? demoSqlTables : demoCSharpTypes;
  return query.split(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/).map((token, index) => {
    const upperToken = token.toLocaleUpperCase();
    const className = keywords.has(upperToken)
      ? "query-oquery-protected-key"
      : functions.has(upperToken)
        ? "query-oquery-function"
        : contexts.has(upperToken)
          ? "query-oquery-context-key"
          : tables.has(upperToken)
            ? "query-oquery-table-key"
            : null;
    return className
      ? <span className={className} key={`${token}-${index}`}>{token}</span>
      : token;
  });
}

type HomePageProps = {
  onNavigateToPage: (page: "sources" | "metadata" | "builder") => void;
  metadataStatus: string;
  metadataError: string | null;
  metadata: MetadataEntity[];
  metadataRelations: DomainRelation[];
  demoResults: Partial<Record<DemoExampleKey, QueryResult>>;
  demoLoading: Partial<Record<DemoExampleKey, boolean>>;
  demoErrors: Partial<Record<DemoExampleKey, string>>;
  onRunDemo: (example: DemoExampleKey, query: string) => void;
  onCloseDemo: (example: DemoExampleKey) => void;
};

export default function HomePage({
  onNavigateToPage,
  metadataStatus, metadataError, metadata, metadataRelations, functionDefinitions,
  demoResults, demoLoading, demoErrors, onRunDemo, onCloseDemo,
}: HomePageProps) {
  const [demoRepresentations, setDemoRepresentations] = useState<Partial<Record<DemoExampleKey, DemoRepresentation>>>({});
  const [expandedHierarchyNodes, setExpandedHierarchyNodes] = useState<Set<string> | null>(null);
  const [expandedHierarchyLists, setExpandedHierarchyLists] = useState<Set<string>>(new Set());
  const [demoResultViews, setDemoResultViews] = useState<Partial<Record<DemoExampleKey, DemoResultView>>>({});
  const [activeDemoPopup, setActiveDemoPopup] = useState<DemoExampleKey | null>(null);
  const hierarchyChartRef = useRef<HTMLDivElement>(null);
  const hierarchyDragRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [demoQueries, setDemoQueries] = useState<Record<DemoExampleKey, string>>({
    products: PRODUCTS_OQUERY,
    traversal: TRAVERSAL_OQUERY,
    recursive: EMPLOYEE_TREE_OQUERY,
    revenue: PRODUCT_SALES_OQUERY,
  });
  const demoSelectionsRef = useRef<Partial<Record<DemoExampleKey, string>>>({});
  const [columnCount, setColumnCount] = useState(() => {
    const width = window.innerWidth;
    return width <= 600 ? 1 : width <= 860 ? 2 : 3;
  });

  useEffect(() => {
    const updateColumnCount = () => {
      const width = window.innerWidth;
      setColumnCount(width <= 600 ? 1 : width <= 860 ? 2 : 3);
    };
    window.addEventListener("resize", updateColumnCount);
    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  useEffect(() => {
    setExpandedHierarchyNodes(null);
    setExpandedHierarchyLists(new Set());
  }, [demoResults.recursive]);

  const runDemo = (example: DemoExampleKey, query: string) => {
    setActiveDemoPopup(example);
    onRunDemo(example, query);
  };
  const closeDemo = (example: DemoExampleKey) => {
    if (activeDemoPopup === example) setActiveDemoPopup(null);
    onCloseDemo(example);
  };

  const renderRecursiveHierarchyChart = (result: QueryResult) => {
    const normalizeColumn = (column: string) => column.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const managerIndex = result.columns.findIndex((column) => normalizeColumn(column) === "managername");
    const memberIndex = result.columns.findIndex((column) => normalizeColumn(column) === "membername");
    const totalIndex = result.columns.findIndex((column) => normalizeColumn(column) === "totalmembers");
    if (managerIndex < 0 || memberIndex < 0 || totalIndex < 0) return null;

    const groups = new Map<string, { total: number; members: string[] }>();
    result.rows.slice(0, 20).forEach((row) => {
      const manager = row[managerIndex]?.trim();
      const member = row[memberIndex]?.trim();
      if (!manager || !member) return;
      const total = Number(row[totalIndex]);
      const group = groups.get(manager) || { total: Number.isFinite(total) ? total : 0, members: [] };
      if (!group.members.includes(member)) group.members.push(member);
      groups.set(manager, group);
    });
    type HierarchyNode = { name: string; total?: number; members: HierarchyNode[] };
    const memberNames = new Set([...groups.values()].flatMap((group) => group.members));
    const roots = [...groups.keys()].filter((manager) => !memberNames.has(manager));
    const buildNode = (name: string, path: Set<string>): HierarchyNode => {
      const group = groups.get(name);
      if (!group || path.has(name)) return { name, members: [] };
      const nextPath = new Set(path).add(name);
      return {
        name,
        total: group.total,
        members: group.members
          .map((member) => buildNode(member, nextPath))
          .sort((left, right) => Number(right.members.length > 0) - Number(left.members.length > 0)),
      };
    };
    const rootName = (roots.length ? roots : [...groups.keys()])[0];
    if (!rootName) return null;
    const hierarchyRoot = buildNode(rootName, new Set());
    const expandedNodes = expandedHierarchyNodes ?? new Set([rootName]);
    const toggleNode = (path: string) => setExpandedHierarchyNodes((current) => {
      const next = new Set(current ?? [rootName]);
      if (next.has(path)) {
        if (expandedHierarchyLists.has(path)) {
          setExpandedHierarchyLists((lists) => {
            const nextLists = new Set(lists);
            nextLists.delete(path);
            return nextLists;
          });
          return next;
        }
        next.delete(path);
        setExpandedHierarchyLists((lists) => {
          const nextLists = new Set(lists);
          nextLists.delete(path);
          return nextLists;
        });
      } else {
        next.add(path);
      }
      return next;
    });
    const toggleMemberList = (path: string) => {
      const next = new Set(expandedHierarchyLists);
      if (next.has(path)) next.delete(path); else next.add(path);
      setExpandedHierarchyLists(next);
    };
    const renderNode = (node: HierarchyNode, path: string): ReactNode => {
      const hasMembers = node.members.length > 0;
      const isExpanded = expandedNodes.has(path);
      const isMemberListExpanded = expandedHierarchyLists.has(path);
      const visibleMembers = node.members.slice(0, 6);
      const additionalMembers = isMemberListExpanded ? node.members.slice(6) : [];
      const hasMoreMembers = node.members.length > visibleMembers.length;
      const nodeContent = <><strong>{node.name}</strong>{node.total !== undefined && <span>{node.total} members</span>}</>;
      return (
      <div className="new-home-hierarchy-branch" key={path}>
        {hasMembers
          ? <button type="button" className={`new-home-hierarchy-node${isExpanded ? " expanded" : ""}`} aria-expanded={isExpanded} onClick={() => toggleNode(path)}>{nodeContent}</button>
          : <div className="new-home-hierarchy-node">{nodeContent}</div>}
        {hasMembers && isExpanded && <div className="new-home-hierarchy-children">
          <div className="new-home-hierarchy-visible-children">
            {visibleMembers.map((member, index) => renderNode(member, `${path}.${index}:${member.name}`))}
          </div>
          {hasMoreMembers && <div className="new-home-hierarchy-overflow">
            {additionalMembers.map((member, index) => renderNode(member, `${path}.${index + 6}:${member.name}`))}
            <button type="button" className="new-home-hierarchy-more" onClick={() => toggleMemberList(path)}>{isMemberListExpanded ? "Show less" : `+ ${node.members.length - visibleMembers.length} More`}</button>
          </div>}
        </div>}
      </div>
      );
    };

    const handleHierarchyPointerDown = (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0
        || !hierarchyChartRef.current
        || (event.target instanceof Element
          && event.target.closest(".new-home-hierarchy-node, .new-home-hierarchy-more"))) return;
      hierarchyDragRef.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: hierarchyChartRef.current.scrollLeft,
        scrollTop: hierarchyChartRef.current.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    };
    const handleHierarchyPointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const drag = hierarchyDragRef.current;
      if (!drag || !hierarchyChartRef.current) return;
      hierarchyChartRef.current.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
      hierarchyChartRef.current.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    };
    const stopHierarchyDrag = (event: PointerEvent<HTMLDivElement>) => {
      hierarchyDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    return (
      <div className="new-home-hierarchy-chart" role="img" aria-label="Members grouped by organization hierarchy">
        <div
          ref={hierarchyChartRef}
          className="new-home-hierarchy-chart-body"
          onPointerDown={handleHierarchyPointerDown}
          onPointerMove={handleHierarchyPointerMove}
          onPointerUp={stopHierarchyDrag}
          onPointerCancel={stopHierarchyDrag}
        >
          <div className="new-home-hierarchy-tree">{renderNode(hierarchyRoot, rootName)}</div>
        </div>
      </div>
    );
  };

  const renderDemoChart = (result: QueryResult) => {
    const normalizeColumn = (column: string) => column.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const labelIndex = result.columns.findIndex((column) => normalizeColumn(column) === "name");
    const metricIndex = result.columns.length - 1;
    if (metricIndex < 0) {
      return <div className="new-home-demo-chart-empty">No numeric result field is available for this sample.</div>;
    }
    const data: SimpleChartData = {
      kind: "simple",
      points: result.rows.slice(0, 12).flatMap((row, index) => {
        const value = Number(row[metricIndex]);
        return Number.isFinite(value)
          ? [{ label: row[labelIndex >= 0 ? labelIndex : 0] || `Record ${index + 1}`, value, xValue: index + 1 }]
          : [];
      }),
    };
    return <div className="new-home-demo-chart"><BarChart data={data} /></div>;
  };

  const renderDemoResult = (example: DemoExampleKey) => {
    if (activeDemoPopup !== example) return null;
    const result = demoResults[example];
    const loading = Boolean(demoLoading[example]);
    const error = demoErrors[example];
    const hierarchyChart = result && example === "recursive"
      ? renderRecursiveHierarchyChart(result)
      : null;
    const viewOptions = demoViewOptions[example];
    const selectedView = demoResultViews[example]
      && viewOptions.some((option) => option.value === demoResultViews[example])
      ? demoResultViews[example]!
      : viewOptions[0]!.value;
    return (
      <div className="new-home-example-result">
        {error && <p className="query-message error" role="alert">{error}</p>}
        {loading && !result
          ? <p className="new-home-example-result-status">Loading the first 20 records...</p>
          : result
            ? <div className="new-home-example-view-container">
              <div className="new-home-example-result-head">
                <span>{result.totalRecords < 0
                  ? `Showing ${Math.min(result.rows.length, 20)} records / total unavailable`
                  : `${result.totalRecords} total records${result.rows.length > 20 ? " / showing first 20" : ""}`}</span>
                <div className="new-home-example-result-actions">
                  {viewOptions.length > 1 && <div className="new-home-example-view-controls" role="group" aria-label="Choose display type">
                    {viewOptions.map((option) => <button
                      key={option.value}
                      type="button"
                      className={`new-home-example-view-button${option.value === selectedView ? " active" : ""}`}
                      aria-label={option.label}
                      aria-pressed={option.value === selectedView}
                      title={option.label}
                      onClick={() => setDemoResultViews((current) => ({ ...current, [example]: option.value }))}
                    >
                      <Icon name={demoViewIcon(option.value)} size={13} />
                    </button>)}
                  </div>}
                  <button className="demo-icon-button" type="button" aria-label="Close query result" title="Close query result" onClick={() => closeDemo(example)}><Icon name="close" size={13} /></button>
                </div>
              </div>
              {selectedView === "orgchart" && hierarchyChart}
              {selectedView === "barchart" && renderDemoChart(result)}
              {selectedView === "grid" && <div className="new-home-example-table"><div className="table-wrap"><table><thead><tr>{result.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{result.rows.slice(0, 20).map((row, rowIndex) => <tr key={rowIndex}>{result.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ""}</td>)}</tr>)}</tbody></table>{!result.rows.length && <p className="empty-state">No records matched this query.</p>}</div></div>}
            </div>
            : null}
      </div>
    );
  };

  const demoRunQuery = (example: DemoExampleKey) =>
    demoSelectionsRef.current[example]?.trim() || demoQueries[example];
  const suggestionData = getOQuerySuggestionData(metadata, metadataRelations);

  const renderDemoQuery = (
    example: DemoExampleKey,
    query: string,
    csharpQuery: string,
    sqlQuery: string,
    representation: DemoRepresentation,
    onRepresentationChange: (next: DemoRepresentation) => void,
  ) => <div className="new-home-example-code">
    <div className="new-home-example-toggle" role="tablist" aria-label={`${example} example representation`}>
      <button type="button" role="tab" aria-selected={representation === "query"} className={representation === "query" ? "active" : ""} onClick={() => onRepresentationChange("query")}>OQuery</button>
      <button type="button" role="tab" aria-selected={representation === "csharp"} className={representation === "csharp" ? "active" : ""} onClick={() => onRepresentationChange("csharp")}>C#</button>
      <button type="button" role="tab" aria-selected={representation === "sql"} className={representation === "sql" ? "active" : ""} onClick={() => onRepresentationChange("sql")}>SQL</button>
    </div>
    {representation !== "query"
      ? <pre><code>{highlightDemoQuery(
        representation === "sql" ? sqlQuery : csharpQuery,
        representation,
        functionDefinitions,
      )}</code></pre>
      : <div className="new-home-example-editor"><OQueryEditor
        aria-label={`${example} OQuery example`}
        oquery
        compact
        showLineNumbers={false}
        showContextRunAlways
        showFoldControls={false}
        rows={Math.max(1, query.split("\n").length)}
        initialText={query}
        functionDefinitions={functionDefinitions}
        suggestionFields={suggestionData.fields}
        suggestionEntities={suggestionData.entities}
        suggestionEntitiesMetadata={suggestionData.entitiesMetadata}
        onTextChange={(text) => setDemoQueries((current) => ({ ...current, [example]: text }))}
        onSelectionChange={(text) => {
          demoSelectionsRef.current[example] = text;
        }}
        onExecuteContext={() => runDemo(example, demoRunQuery(example))}
        onExecuteSelectedText={(text) => runDemo(example, text)}
      /></div>}
  </div>;

  return (
    <div className="home-workspace new-home-story">
    <section className="new-home-intro" aria-labelledby="home-hero-title">
      <div className="new-home-hero">
        <div className="new-home-copy">
          <span className="eyebrow">OQUERY / METADATA-DRIVEN QUERYING</span>
          <h1 id="home-hero-title">Dynamic data <span>infrastructure</span> <span className="new-home-h1-tail">for application developers</span></h1>
          <p>Build a dynamic data foundation for your application. Define business entities, compose relationships, and expose reusable data capabilities without rebuilding application-specific data-access code for every report, alert, or workflow.</p>
        </div>
      </div>
    </section>
    <section id="oquery-problem" className="new-home-shift-section" aria-labelledby="oquery-problem-title">
      <div className="new-home-shift-intro">
        <span className="eyebrow">01 / THE PROBLEM → THE SOLUTION</span>
        <h2 id="oquery-problem-title">A new data question should not <span>become a new release.</span></h2>
        <p>Reports, filters, views, tenants, and business rules change faster than delivery cycles. Traditionally, each change is a new path through entities, query code, APIs, and deployment. OQuery turns it into a query definition over metadata you describe once.</p>
      </div>
      <div className="new-home-shift-board" role="table" aria-label="Delivering a new data requirement: traditional development compared with OQuery">
        <div className="new-home-shift-head" role="row">
          <span role="columnheader">New requirement</span>
          <span role="columnheader" className="new-home-shift-head-before"><Icon name="code" size={13} /> Traditional delivery</span>
          <span role="columnheader" className="new-home-shift-head-after"><Icon name="query" size={13} /> With OQuery</span>
        </div>
        {[
          { need: "Revenue per product", hint: "New report", query: "Products: Name, OrderItems.Sum(Quantity * UnitPrice) Revenue" },
          { need: "Orders with the customer who placed them", hint: "Different data view", query: "Orders: Id, OrderDate, User.FirstName, User.LastName" },
          { need: "Team size for every manager", hint: "Changing business rule", query: "Employees: FirstName, Members.Count(Id) TotalMembers" },
        ].map((row) => (
          <div className="new-home-shift-row" role="row" key={row.need}>
            <div className="new-home-shift-need" role="cell"><small>{row.hint}</small><strong>{row.need}</strong></div>
            <div className="new-home-shift-before" role="cell" aria-label="Define entities, write query logic, build an API, test and deploy">
              <span>Entity</span><i /><span>Query code</span><i /><span>API</span><i /><span>Deploy</span>
            </div>
            <div className="new-home-shift-after" role="cell"><code>{row.query}</code></div>
          </div>
        ))}
        <div className="new-home-shift-foot" role="row">
          <span role="cell">Every change</span>
          <span role="cell" className="new-home-shift-foot-before">4 steps, another endpoint to maintain</span>
          <span role="cell" className="new-home-shift-foot-after"><Icon name="check" size={13} /> One definition, no new backend code</span>
        </div>
      </div>
      <div className="new-home-shift-pillars">
        <div><Icon name="schema" size={16} /><strong>Logical entities, not tables</strong><small>Describe business concepts and relationships once in metadata.</small></div>
        <div><Icon name="link" size={16} /><strong>Joins resolved for you</strong><small>Relationship paths compile into provider-specific SQL.</small></div>
        <div><Icon name="grid" size={16} /><strong>One engine, many surfaces</strong><small>Reports, views, alert conditions, and tenants share the same foundation.</small></div>
      </div>
    </section>

    <section id="oquery-syntax" className="new-home-examples" aria-labelledby="new-home-examples-title">
      <div className="new-home-examples-heading">
        <div>                <span className="eyebrow">02 / SEE IT WORK</span><h2 id="new-home-examples-title">Make difficult queries easier to configure.</h2><p>Describe the business question in small, readable parts. Let the compiler handle joins, grouping, windows, and provider-specific SQL.</p></div>
        <button className="new-home-section-link" type="button" onClick={() => onNavigateToPage("builder")}>Open query builder <Icon name="arrow-right" size={13} /></button>
      </div>
      <div className="new-home-example-rail">
        <article className="new-home-example">
          <div className="new-home-example-marker">01</div>
          <div className="new-home-example-copy"><strong>How do I explore a product?</strong><p>Start with a runtime entity and select the fields and relationships that matter.</p><p>No generated CLR model, fixed projection class, or physical table name is required.</p></div>
          {renderDemoQuery("products", demoQueries.products, PRODUCTS_CSHARP, "SELECT *\nFROM sa.Products;", demoRepresentations.products || "query", (next) => setDemoRepresentations((current) => ({ ...current, products: next })))}
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">02</div>
          <div className="new-home-example-copy"><strong>Who placed each order?</strong><p>Follow relationships through readable metadata paths instead of physical table names.</p><p>The metadata compiler resolves each path and creates the required join, instead of making you hand-write join SQL.</p></div>
          {renderDemoQuery("traversal", demoQueries.traversal, TRAVERSAL_CSHARP, `SELECT
    o.Id,
    o.OrderDate,
    u.FirstName,
    u.LastName
FROM sa.Orders AS o
LEFT JOIN Main.Users AS u
    ON o.UserId = u.Id;`, demoRepresentations.traversal || "query", (next) => setDemoRepresentations((current) => ({ ...current, traversal: next })))}
          {renderDemoResult("traversal")}
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">03</div>
          <div className="new-home-example-copy"><strong>Do you know the total members at each hierarchy level?</strong><p>Keep the hierarchy and its calculated results in one named query context.</p><p>Reusable contexts let complex derived queries and CTE-shaped logic stay composable instead of becoming one fragile SQL script.</p></div>
          {renderDemoQuery("recursive", demoQueries.recursive, RECURSIVE_CSHARP, EMPLOYEE_TREE_SQL, demoRepresentations.recursive || "query", (next) => setDemoRepresentations((current) => ({ ...current, recursive: next })))}
          {renderDemoResult("recursive")}
        </article>
        <article className="new-home-example">
          <div className="new-home-example-marker">04</div>
          <div className="new-home-example-copy"><strong>Which products sell above average?</strong><p>Use aliases and window functions to compare each result with a scalar value while preserving the row set.</p><p>Define custom functions once with typed arguments and a SQL template for each dialect. OQuery selects the right implementation at runtime.</p></div>
          {renderDemoQuery("revenue", demoQueries.revenue, REVENUE_CSHARP, PRODUCT_SALES_SQL, demoRepresentations.revenue || "query", (next) => setDemoRepresentations((current) => ({ ...current, revenue: next })))}
          {renderDemoResult("revenue")}
        </article>
      </div>
    </section>
    <section id="oquery-ai" className="new-home-product-section new-home-ai-section" aria-labelledby="oquery-ai-title">
      <div className="new-home-product-copy">
        <span className="eyebrow">AFTER THE QUERY ENGINE</span>
        <h2 id="oquery-ai-title">A query definition can become an application capability.</h2>
        <p>The same saved definition can become a report dataset, an alert condition, or the input to a scheduled job. Start with the query engine; add the surrounding product surfaces when the foundation is ready.</p>
        <button className="button primary" type="button" onClick={() => onNavigateToPage("builder")}><Icon name="code" size={15} /> Build a dynamic query</button>
      </div>
      <div className="new-home-ai-flow" aria-label="From a dynamic query to an application workflow">
        <div><span>01</span><Icon name="edit" size={16} /><strong>Configure the query</strong><small>â€œOrders overdue by regionâ€</small></div>
        <i />
        <div><span>02</span><Icon name="check" size={16} /><strong>Evaluate the result</strong><small>Report rows or alert condition</small></div>
        <i />
        <div><span>03</span><Icon name="play" size={16} /><strong>Trigger the next step</strong><small>Notify, schedule, or start work</small></div>
      </div>
    </section>
    <section id="oquery-model" className="new-home-product-section new-home-model-section" aria-labelledby="oquery-model-title">
      <div className="new-home-product-heading">
        <span className="eyebrow">03 / HOW IT WORKS</span>
        <h2 id="oquery-model-title">Metadata, FunctionDefinition, and SqlDialect.</h2>
        <p>Three building blocks keep query intent separate from physical storage and provider-specific SQL.</p>
      </div>
      <div className="new-home-model-grid">
        <article><div className="new-home-card-icon"><Icon name="schema" size={17} /></div><div><strong>Metadata</strong><p>Expose entities, fields, and relationships as a stable vocabulary for people and tools.</p><small>{metadata.length} entities available Â· {metadataStatus}</small></div></article>
        <article><div className="new-home-card-icon"><Icon name="function" size={17} /></div><div><strong>Function definitions</strong><p>Describe reusable business operations once, with typed arguments and provider templates.</p><small>{functionDefinitions.length} functions available</small></div></article>
        <article><div className="new-home-card-icon"><Icon name="database" size={17} /></div><div><strong>SQL dialect</strong><p>Keep query intent portable while the compiler handles provider-specific SQL details.</p><small>Generated at execution time</small></div></article>
      </div>
      <button className="new-home-text-action new-home-model-action" type="button" onClick={() => onNavigateToPage("metadata")}>Explore the metadata model <Icon name="arrow-right" size={13} /></button>
    </section>
    <section className="new-home-vocabulary-section" aria-labelledby="oquery-vocabulary-title">
      <div className="new-home-section-intro">
        <span className="eyebrow">OPEN VOCABULARY / PORTABLE EXECUTION</span>
        <h2 id="oquery-vocabulary-title">Let the query speak in business concepts.</h2>
        <p>Custom functions extend the language when your domain has a name for the operation. The same intent can then be translated for the provider that executes it.</p>
      </div>
      <div className="new-home-vocabulary-demo">
        <div className="new-home-vocabulary-query"><span className="query-oquery-protected-key">SELECT</span> CustomerId,<br /><span className="query-oquery-function">CalculateRiskScore</span>(CustomerId),<br /><span className="query-oquery-function">CalculateLifetimeValue</span>(CustomerId)<br /><span className="query-oquery-protected-key">FROM</span> Customers</div>
        <div className="new-home-vocabulary-translation"><span>one intent</span><i /><strong>SQL dialect templates</strong><small>SQL Server / PostgreSQL / SQLite</small></div>
      </div>
    </section>
    <section id="oquery-permissions" className="new-home-product-section new-home-permissions-section" aria-labelledby="oquery-permissions-title">
      <div className="new-home-permission-mark"><Icon name="key" size={20} /></div>
      <div className="new-home-product-copy">
        <span className="eyebrow">04 / SECURITY</span>
        <h2 id="oquery-permissions-title">Authorize the complete query before SQL runs.</h2>
        <p>Dynamic queries need one trustworthy execution boundary. OQuery is designed to check the complete statement after projections, filters, joins, contexts, and expressions have been composed, before SQL is rendered.</p>
      </div>
      <div className="new-home-permission-list">
        <div><Icon name="check" size={14} /><span><strong>One execution boundary</strong><small>Authorize the complete statement before SQL is generated.</small></span></div>
        <div><Icon name="check" size={14} /><span><strong>Metadata-aware rules</strong><small>Use the same entities, relations, and functions users can see.</small></span></div>
        <div><Icon name="check" size={14} /><span><strong>Consistent across surfaces</strong><small>Protect builder, reports, saved queries, and workflow triggers together.</small></span></div>
      </div>
    </section>
    </div>
  );
}
