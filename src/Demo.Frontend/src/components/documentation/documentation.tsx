import Icon from "../icon/icon";
import "./documentation.css";

type DocumentationSection = {
  id: string;
  label: string;
};

const sections: DocumentationSection[] = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quickstart" },
  { id: "query-model", label: "Query model" },
  { id: "syntax", label: "OQuery syntax" },
  { id: "automatic", label: "Automatic query behavior" },
  { id: "contexts", label: "Reusable contexts" },
  { id: "ui-guide", label: "UI workflow" },
  { id: "architecture", label: "How it works" },
  { id: "providers", label: "Database providers" },
  { id: "security", label: "Security boundaries" },
  { id: "next-steps", label: "Next steps" },
];

const providers = [
  "SQL Server",
  "SQLite",
  "PostgreSQL",
  "CockroachDB",
  "Firebird",
  "MySQL / MariaDB",
  "Oracle",
  "SAP HANA",
  "IBM Db2",
];

function CodeBlock({ children }: { children: string }) {
  return <pre className="documentation-code"><code>{children}</code></pre>;
}

export default function Documentation() {
  return (
    <div className="documentation-page">
      <aside className="documentation-sidebar" aria-label="Documentation navigation">
        <div className="documentation-sidebar-heading">
          <span className="documentation-sidebar-icon"><Icon name="file-text" size={17} /></span>
          <div>
            <span className="section-kicker">OQUERY STUDIO</span>
            <strong>Documentation</strong>
          </div>
        </div>
        <nav className="documentation-nav">
          <span className="documentation-nav-label">On this page</span>
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>{section.label}</a>
          ))}
        </nav>
        <div className="documentation-sidebar-note">
          <span className="documentation-note-mark"><Icon name="code" size={14} /></span>
          <div><strong>Build with metadata</strong><small>Explore the live query builder after reading the guide.</small></div>
        </div>
      </aside>

      <article className="documentation-content">
        <header className="documentation-hero">
          <span className="eyebrow"><i /> PRODUCT GUIDE · .NET QUERY ENGINE</span>
          <h1>Build configurable data experiences with oQuery</h1>
          <p>oQuery turns query intent, runtime metadata, and domain vocabulary into safe, provider-specific SQL. Follow relationships, derive grouping and HAVING, compose reusable contexts, and power data grids, reports, admin screens, and APIs without creating a CLR class for every table.</p>
          <div className="documentation-hero-actions">
            <a className="button primary" href="#quickstart"><Icon name="play" size={14} /> Start the quickstart</a>
            <a className="documentation-text-link" href="https://github.com/NamHqUs/OQuery" target="_blank" rel="noreferrer">View source on GitHub <Icon name="chevron" size={13} /></a>
          </div>
        </header>

        <section id="overview" className="documentation-section documentation-overview">
          <div className="documentation-section-heading">
            <span className="section-kicker">THE CORE IDEA</span>
            <h2>Queries described as data</h2>
            <p>Keep the database shape, user choices, and SQL dialect concerns separate from your application domain models.</p>
          </div>
          <div className="documentation-feature-grid">
            <div className="documentation-feature"><span><Icon name="schema" size={18} /></span><strong>Runtime metadata</strong><p>Define entities, fields, and relationships from configuration or a catalog.</p></div>
            <div className="documentation-feature"><span><Icon name="query" size={18} /></span><strong>Query intent</strong><p>Write compact OQuery text or use C# and JSON with the same compiler.</p></div>
            <div className="documentation-feature"><span><Icon name="database" size={18} /></span><strong>Provider aware</strong><p>Render the same query for the database engine selected by your connection.</p></div>
          </div>
        </section>

        <section id="quickstart" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">01 · QUICKSTART</span>
            <h2>Run your first oQuery query</h2>
            <p>Install the package, describe the fields you want to expose, and query without a generated entity class.</p>
          </div>
          <CodeBlock>{`dotnet add package OQuery`}</CodeBlock>
          <CodeBlock>{`var metadata = new[]
{
    new Entity("User", Fields: [
        new Field("Id"),
        new Field("Name"),
        new Field("Age")
    ])
};

using var db = new OQueryEngine(connection, new MetadataProvider(metadata));

var rows = db.Query("User")
    .Where(user => user["Age"] >= 18)
    .Select("Name", "Age")
    .ToList();`}</CodeBlock>
          <div className="documentation-callout"><Icon name="check" size={16} /><span><strong>Safe by default.</strong> Values become database parameters. Only trusted metadata such as table names and raw SQL expressions are rendered as SQL.</span></div>
        </section>

        <section id="query-model" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">02 · QUERY MODEL</span>
            <h2>Choose the input that fits your product</h2>
            <p>The compiler translates each input into the same expression pipeline, so a saved report and an interactive grid behave consistently.</p>
          </div>
          <div className="documentation-model-grid">
            <div className="documentation-model-card"><span className="documentation-model-number">A</span><strong>C# expressions</strong><p>Ideal for application-defined queries and reusable base queries.</p><code>db.Query("Order").Where(...)</code></div>
            <div className="documentation-model-card"><span className="documentation-model-number">B</span><strong>JSON query DTO</strong><p>Use as the transport model for a REST API or frontend query builder.</p><code>{`{ "entity": "Order", "fields": [...] }`}</code></div>
            <div className="documentation-model-card"><span className="documentation-model-number">C</span><strong>OQuery text</strong><p>Store readable saved queries with traversal, aggregates, joins, and reusable contexts.</p><code>{`Users: Id, Manager.Name\\n  Take 50`}</code></div>
          </div>
        </section>

        <section id="syntax" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">03 · OQUERY SYNTAX</span>
            <h2>Start small. Add detail only when you need it.</h2>
            <p>OQuery keeps the common query path short, then gives every advanced feature a readable place in the same text format.</p>
          </div>
          <CodeBlock>{`// Select every exposed field
// Equivalent intent: SELECT * FROM Users
Users

// Select fields and traverse a metadata relationship
Users: Id, Name, Manager.Name

// Filter, sort, and page with SQL-style intent
Users: Id, Name
  Where Status = <Active>
  Order Name ASC
  Skip 0
  Take 25

// Alias expressions with the expression-first pipe
Users: Id, Count(Members.Id) | TotalMembers`}</CodeBlock>
          <div className="documentation-callout"><Icon name="check" size={16} /><span><strong>One rule to remember:</strong> the expression is on the left of <code>|</code>, and its result name is on the right.</span></div>
        </section>

        <section id="automatic" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">04 · INTENT COMPILATION</span>
            <h2>Let the engine handle relational ceremony</h2>
            <p>OQuery reads the shape of the expression and metadata graph, then derives the SQL operations needed to produce the result.</p>
          </div>
          <CodeBlock>{`// Relation traversal becomes an automatic join
Users: Id, Name, Manager.Name

// Aggregate projection establishes the result grain
Users: Id, Name, Count(Members.Id) | TotalMembers

// Aggregate aliases are routed to HAVING
Users: Id, Name, Count(Members.Id) | TotalMembers
  Where TotalMembers > 12`}</CodeBlock>
          <div className="documentation-feature-grid">
            <div className="documentation-feature"><span><Icon name="schema" size={18} /></span><strong>Traversal</strong><p>Follow a metadata relationship such as <code>Manager.Name</code> without hand-writing the join.</p></div>
            <div className="documentation-feature"><span><Icon name="chart-bar" size={18} /></span><strong>Grouping</strong><p>Mix fields and aggregates and let the compiler determine the grouping grain.</p></div>
            <div className="documentation-feature"><span><Icon name="filter" size={18} /></span><strong>HAVING</strong><p>Filter an aggregate alias naturally; the compiler places it at the group level.</p></div>
          </div>
        </section>

        <section id="contexts" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">05 · COMPOSITION</span>
            <h2>Build complex reports from reusable contexts</h2>
            <p>A context is a named query definition. Consumers choose when and how to join it, and the same context can be used more than once with different aliases.</p>
          </div>
          <CodeBlock>{`Products: Id, Name,
  RevenueByMonth.Month | Month,
  RevenueByMonth.Revenue | Revenue
  Left Join RevenueByMonth On Id = RevenueByMonth.ProductId
  Order Revenue DESC
  Take 20

RevenueByMonth is InvoiceLines: ProductId,
  MonthKey(Invoice.IssueDate) | Month,
  SUM(Quantity * UnitPrice) | Revenue,
  CountDistinct(InvoiceId) | Orders
  Where Invoice.Status = <Paid>`}</CodeBlock>
          <CodeBlock>{`// A dependent context can use another context privately
User: Id, ref2.Name | Manager2
  Left Join ref2 On ManagerId = ref2.Id

ref1 is User: Id, Name

ref2 is User: Id, Name, ManagerId
  Left Join ref1 On ManagerId = ref1.Id`}</CodeBlock>
          <div className="documentation-callout"><Icon name="check" size={16} /><span><strong>Test in layers.</strong> Select and execute <code>RevenueByMonth is InvoiceLines: ProductId, SUM(Quantity * UnitPrice) | Revenue</code> by itself, then run the product query.</span></div>
        </section>

        <section id="ui-guide" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">06 · UI GUIDE</span>
            <h2>Use OQuery Studio in four moves</h2>
            <p>The editor is designed for progressive exploration. You can start visually and switch to text whenever the query needs more control.</p>
          </div>
          <div className="documentation-feature-grid">
            <div className="documentation-feature"><span>01</span><strong>Choose metadata</strong><p>Open Data sources and inspect entities, fields, and relationships before writing a query.</p></div>
            <div className="documentation-feature"><span>02</span><strong>Write the intent</strong><p>Open Query Builder and start with <code>Users</code>, then add fields, traversal, filters, and aggregates.</p></div>
            <div className="documentation-feature"><span>03</span><strong>Test a scope</strong><p>Select a complete root or context block and press Run Query to execute only the selected definition.</p></div>
          </div>
          <CodeBlock>{`// The editor supports practical text editing
Tab          increase indentation
Shift + Tab  decrease indentation
Ctrl + X     delete selected rows
Ctrl + Z     undo the edit

// Run only the selected query graph
ref1 is User: Id, Name`}</CodeBlock>
          <div className="documentation-callout"><Icon name="play" size={16} /><span><strong>Inspect before you trust.</strong> Use Get SQL to see the generated parameterized statement, then run the query against the connected provider.</span></div>
        </section>

        <section id="architecture" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">07 · HOW IT WORKS</span>
            <h2>One compiler, clear boundaries</h2>
            <p>Inputs are normalized before SQL is rendered. Dialect-specific behavior stays at the edge instead of leaking into query definitions.</p>
          </div>
          <div className="documentation-pipeline">
            {["Metadata + query input", "Expression visitors", "Dialect-independent SQL IR", "SQL + parameters", "ADO.NET execution"].map((step, index) => (
              <div className="documentation-pipeline-step" key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < 4 && <i aria-hidden="true" />}</div>
            ))}
          </div>
        </section>

        <section id="providers" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">08 · PROVIDERS</span>
            <h2>Bring your database</h2>
            <p>Use one metadata and query model while the selected dialect handles quoting, paging, booleans, functions, and other provider details.</p>
          </div>
          <div className="documentation-provider-list">{providers.map((provider) => <span key={provider}><Icon name="check" size={13} />{provider}</span>)}</div>
        </section>

        <section id="security" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">09 · SECURITY</span>
            <h2>Keep the trust boundary explicit</h2>
            <p>Queries are powerful. Pair the oQuery compiler with an authorization and resource policy before exposing it to untrusted users.</p>
          </div>
          <div className="documentation-security-grid">
            <div><strong>Parameterize values</strong><p>Filters and typed literals are sent through ADO.NET parameters.</p></div>
            <div><strong>Restrict metadata</strong><p>Expose only approved entities, fields, relationships, and functions.</p></div>
            <div><strong>Limit resources</strong><p>Apply maximum page sizes, timeouts, join depth, and query cost rules.</p></div>
            <div><strong>Trust raw SQL deliberately</strong><p>Raw table and field expressions are configuration, not user input.</p></div>
          </div>
        </section>

        <section id="next-steps" className="documentation-section documentation-next-steps">
          <div className="documentation-section-heading">
            <span className="section-kicker">10 · NEXT STEPS</span>
            <h2>Explore the studio</h2>
            <p>Use the live workspace to inspect metadata, compose a query, and see the generated SQL diagnostics.</p>
          </div>
          <div className="documentation-next-links">
            <a href="/query-builder"><Icon name="query" size={17} /><span><strong>Open Query builder</strong><small>Compose filters, projections, joins, and sorts.</small></span><Icon name="chevron" size={14} /></a>
            <a href="/data-sources"><Icon name="database" size={17} /><span><strong>Inspect Data sources</strong><small>Explore tables, fields, keys, and sample rows.</small></span><Icon name="chevron" size={14} /></a>
            <a href="/reports"><Icon name="chart" size={17} /><span><strong>Browse Reports</strong><small>See query-backed dashboards and saved analyses.</small></span><Icon name="chevron" size={14} /></a>
          </div>
        </section>
      </article>
    </div>
  );
}
