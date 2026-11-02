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
            <span className="section-kicker">DYNAMICSQL STUDIO</span>
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
          <h1>Build configurable data experiences with DynamicSQL</h1>
          <p>DynamicSQL turns runtime metadata and query definitions into safe, provider-specific SQL. Use it to power data grids, reports, admin screens, and APIs without creating a CLR class for every table.</p>
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
            <div className="documentation-feature"><span><Icon name="query" size={18} /></span><strong>One query surface</strong><p>Use C# expressions, JSON DTOs, or YAML definitions with the same compiler.</p></div>
            <div className="documentation-feature"><span><Icon name="database" size={18} /></span><strong>Provider aware</strong><p>Render the same query for the database engine selected by your connection.</p></div>
          </div>
        </section>

        <section id="quickstart" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">01 · QUICKSTART</span>
            <h2>Run your first dynamic query</h2>
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
            <div className="documentation-model-card"><span className="documentation-model-number">C</span><strong>YAML definitions</strong><p>Store human-readable saved reports and repeatable query requests.</p><code>{`Entity: Order\\nPageSize: 50`}</code></div>
          </div>
        </section>

        <section id="architecture" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">03 · HOW IT WORKS</span>
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
            <span className="section-kicker">04 · PROVIDERS</span>
            <h2>Bring your database</h2>
            <p>Use one metadata and query model while the selected dialect handles quoting, paging, booleans, functions, and other provider details.</p>
          </div>
          <div className="documentation-provider-list">{providers.map((provider) => <span key={provider}><Icon name="check" size={13} />{provider}</span>)}</div>
        </section>

        <section id="security" className="documentation-section">
          <div className="documentation-section-heading">
            <span className="section-kicker">05 · SECURITY</span>
            <h2>Keep the trust boundary explicit</h2>
            <p>Dynamic queries are powerful. Pair the compiler with an authorization and resource policy before exposing it to untrusted users.</p>
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
            <span className="section-kicker">06 · NEXT STEPS</span>
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
