import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon, { getDatabaseIconName } from "../icon/icon";
import OQueryEditor from "../oquery-editor/oquery-editor";
import { getOQuerySuggestionData } from "../oquery-editor/oquery-suggestion-data";
import type { FunctionDefinition } from "../function-definition/types";
import {
  fetchFunctionDefinitions,
  fetchQueryMetadata,
  requestQueryResultFromText,
  requestSqlStatementFromText,
  type QueryResult,
} from "../query-builder/query-design/query-builder-slice";
import type { RootState } from "../../store/store";
import {
  DEVELOPER_CARDS,
  EXTENSION_CARDS,
  HERO_QUERY,
  HOME_EXAMPLES,
  INTERFACE_CARDS,
  PRODUCT_NAME,
  REVEAL_POINTS,
  SECURITY_POINTS,
  USE_CASES,
  type HomeCard,
} from "./home-content";
import "./home-landing.css";

type HomeDestination = "builder" | "metadata" | "sources" | "functions" | "documentation";
type SuggestionData = ReturnType<typeof getOQuerySuggestionData>;

const PREVIEW_ROWS = 12;
const SQL_KEYWORDS = new Set([
  "WITH", "RECURSIVE", "SELECT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER", "LIMIT", "OFFSET", "ASC", "DESC",
  "AS", "AND", "OR", "NOT", "IN", "IS", "NULL", "LIKE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON", "DISTINCT",
  "TOP", "UNION", "ALL", "OVER", "PARTITION", "CASE", "WHEN", "THEN", "ELSE", "END", "COUNT", "SUM", "AVG", "MIN", "MAX",
]);

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function highlightSql(sql: string): ReactNode[] {
  return sql.split(/("[^"]*"|'[^']*'|\b[A-Za-z_][A-Za-z0-9_]*\b)/).map((token, index) => {
    if (SQL_KEYWORDS.has(token.toUpperCase())) return <span className="query-oquery-protected-key" key={index}>{token}</span>;
    if (token.startsWith("\"")) return <span className="hp-sql-ident" key={index}>{token}</span>;
    if (token.startsWith("'")) return <span className="hp-sql-string" key={index}>{token}</span>;
    return token;
  });
}

function formatRowCount(result: QueryResult) {
  const shown = Math.min(result.rows.length, PREVIEW_ROWS);
  if (result.totalRecords < 0) return `Showing ${shown} rows`;
  const noun = result.totalRecords === 1 ? "row" : "rows";
  return result.totalRecords > shown ? `${result.totalRecords} ${noun} · showing first ${shown}` : `${result.totalRecords} ${noun}`;
}

function Playground({
  initialQuery,
  label,
  functionDefinitions,
  suggestionData,
  editorHostRef,
}: {
  initialQuery: string;
  label: string;
  functionDefinitions: FunctionDefinition[];
  suggestionData: SuggestionData;
  editorHostRef?: RefObject<HTMLDivElement | null>;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sql, setSql] = useState<{ query: string; text: string } | null>(null);
  const [sqlError, setSqlError] = useState("");
  const [sqlLoading, setSqlLoading] = useState(false);
  const selectionRef = useRef("");
  const lastRunQueryRef = useRef(initialQuery);
  const runIdRef = useRef(0);
  const sqlIdRef = useRef(0);

  const loadSql = async (text: string) => {
    const id = ++sqlIdRef.current;
    setSqlLoading(true);
    setSqlError("");
    try {
      const statement = await requestSqlStatementFromText(text);
      if (id === sqlIdRef.current) setSql({ query: text, text: statement });
    } catch (reason) {
      if (id === sqlIdRef.current) setSqlError(reason instanceof Error ? reason.message : "Unable to generate SQL.");
    } finally {
      if (id === sqlIdRef.current) setSqlLoading(false);
    }
  };

  const run = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = ++runIdRef.current;
    lastRunQueryRef.current = trimmed;
    setRunning(true);
    setError("");
    if (sqlOpen) void loadSql(trimmed);
    try {
      const next = await requestQueryResultFromText(trimmed);
      if (id === runIdRef.current) setResult(next);
    } catch (reason) {
      if (id === runIdRef.current) {
        setResult(null);
        setError(reason instanceof Error ? reason.message : "Unable to run this query.");
      }
    } finally {
      if (id === runIdRef.current) setRunning(false);
    }
  };

  const runCurrent = () => void run(selectionRef.current.trim() || query);

  useEffect(() => {
    void run(initialQuery);
  }, [initialQuery]);

  const toggleSql = () => {
    const next = !sqlOpen;
    setSqlOpen(next);
    if (next && sql?.query !== lastRunQueryRef.current) void loadSql(lastRunQueryRef.current);
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
    const target = event.target as HTMLTextAreaElement;
    if (target.selectionStart !== target.selectionEnd) return;
    event.preventDefault();
    event.stopPropagation();
    runCurrent();
  };

  return (
    <div className="hp-playground">
      <div className="hp-playground-head">
        <span className="hp-playground-label"><Icon name="query" size={14} /> {label}</span>
        <span className="hp-playground-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run</span>
      </div>
      <div className="hp-playground-editor" ref={editorHostRef} onKeyDownCapture={handleKeyDownCapture}>
        <OQueryEditor
          key={initialQuery}
          aria-label={label}
          oquery
          compact
          showLineNumbers={false}
          showFoldControls={false}
          rows={Math.max(1, initialQuery.split("\n").length)}
          initialText={initialQuery}
          functionDefinitions={functionDefinitions}
          suggestionFields={suggestionData.fields}
          suggestionEntities={suggestionData.entities}
          suggestionEntitiesMetadata={suggestionData.entitiesMetadata}
          onTextChange={setQuery}
          onSelectionChange={(text) => { selectionRef.current = text; }}
          onExecuteSelectedText={(text) => void run(text)}
        />
        <button className="button primary hp-run" type="button" onClick={runCurrent} disabled={running} aria-busy={running}>
          <Icon name="play" size={12} /> Run
        </button>
      </div>
      <div className="hp-result" aria-live="polite" aria-busy={running}>
        <div className="hp-result-head">
          <span className="hp-result-title"><Icon name="results" size={14} /> Result</span>
          {result && !error && <span className="hp-result-count">{formatRowCount(result)}</span>}
        </div>
        {error
          ? <p className="hp-result-error" role="alert">{error}</p>
          : !result
            ? <div className="hp-result-loading">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
            : result.rows.length === 0
              ? <p className="empty-state">No records matched this query.</p>
              : <div className={`hp-result-table${running ? " stale" : ""}`}>
                <div className="table-wrap">
                  <table>
                    <thead><tr>{result.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead>
                    <tbody>{result.rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => <tr key={rowIndex}>{result.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ""}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>}
      </div>
      <div className={`hp-sql${sqlOpen ? " open" : ""}`}>
        <button className="hp-sql-toggle" type="button" aria-expanded={sqlOpen} onClick={toggleSql}>
          <Icon name="chevron-right" size={13} /> See how it works <span>View generated SQL</span>
        </button>
        {sqlOpen && <div className="hp-sql-body">
          {sqlError
            ? <p className="hp-result-error" role="alert">{sqlError}</p>
            : sqlLoading && !sql
              ? <p className="hp-sql-status">Generating SQL from the engine…</p>
              : sql && <>
                <pre><code>{highlightSql(sql.text)}</code></pre>
                <small>Actual output from the {PRODUCT_NAME} engine for the connected database.</small>
              </>}
        </div>}
      </div>
    </div>
  );
}

function SectionIntro({ kicker, title, text, id }: { kicker: string; title: string; text?: string; id: string }) {
  return (
    <div className="hp-section-intro">
      <span className="eyebrow">{kicker}</span>
      <h2 id={id}>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

function CardGrid({ cards, className = "" }: { cards: HomeCard[]; className?: string }) {
  return (
    <div className={`hp-card-grid ${className}`}>
      {cards.map((card) => <article className="hp-card" key={card.title}>
        <div className="hp-card-title-row">
          <div className="hp-card-icon"><Icon name={card.icon} size={17} /></div>
          <strong>{card.title}{card.roadmap && <span className="hp-roadmap">Roadmap</span>}</strong>
        </div>
        <div>
          <p>{card.text}</p>
        </div>
      </article>)}
    </div>
  );
}

function TextAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="hp-text-action" type="button" onClick={onClick}>{children} <Icon name="chevron" size={13} /></button>;
}

export default function Home({
  onNavigateToPage,
  onRequestConnection,
}: {
  onNavigateToPage: (page: HomeDestination, fromHome?: boolean) => void;
  onRequestConnection: () => void;
}) {
  const dispatch = useDispatch();
  const { metadata, metadataStatus, functionDefinitions, functionDefinitionsStatus } = useSelector((state: RootState) => state.queryBuilder);
  const { providers } = useSelector((state: RootState) => state.database);
  const [activeExampleId, setActiveExampleId] = useState(HOME_EXAMPLES[0]!.id);
  const heroEditorRef = useRef<HTMLDivElement>(null);
  const activeExample = HOME_EXAMPLES.find((example) => example.id === activeExampleId) ?? HOME_EXAMPLES[0]!;
  const suggestionData = getOQuerySuggestionData(metadata);
  const relationCount = metadata.reduce((total, entity) => total + (entity.relations?.length ?? 0), 0);

  useEffect(() => {
    if (metadataStatus === "idle") dispatch(fetchQueryMetadata());
    if (functionDefinitionsStatus === "idle") dispatch(fetchFunctionDefinitions());
  }, [dispatch, functionDefinitionsStatus, metadataStatus]);

  const showExample = (id: string) => {
    setActiveExampleId(id);
    scrollToSection("hp-examples");
  };
  const openBuilder = () => onNavigateToPage("builder", true);
  const openDocs = () => onNavigateToPage("documentation");
  return (
    <div className="hp">
      <section className="hp-hero" id="hp-playground" aria-labelledby="hp-hero-title">
        <div className="hp-hero-copy">
          <span className="eyebrow">METADATA-DRIVEN QUERYING</span>
          <h1 id="hp-hero-title">What can <span>metadata</span> make possible?</h1>
          <p className="hp-lede">Define your data once. {PRODUCT_NAME} uses that understanding of your entities, fields, and relationships to make querying simpler.</p>
          <section className="hp-hero-usecases" aria-label="Use cases">
            <CardGrid cards={USE_CASES} className="hp-card-grid-5" />
          </section>
        </div>
        <div className="hp-hero-demo">
          <p className="hp-demo-prompt">Ask for what your metadata makes possible:</p>
          <Playground
            initialQuery={HERO_QUERY}
            label="Playground"
            functionDefinitions={functionDefinitions}
            suggestionData={suggestionData}
            editorHostRef={heroEditorRef}
          />
        </div>
      </section>

      <section className="hp-section" id="hp-examples" aria-labelledby="hp-examples-title">
        <SectionIntro
          id="hp-examples-title"
          kicker="DISCOVERY"
          title="One line to start. More power when you need it."
          text="View data, follow relationships, calculate values, and explore more complex questions—all through the same query experience."
        />
        <div className="hp-examples">
          <div className="hp-example-tabs" role="tablist" aria-orientation="vertical" aria-label="Query examples">
            {HOME_EXAMPLES.map((example) => <button
              key={example.id}
              type="button"
              role="tab"
              id={`hp-tab-${example.id}`}
              aria-selected={example.id === activeExample.id}
              aria-controls="hp-example-panel"
              className={example.id === activeExample.id ? "active" : ""}
              onClick={() => setActiveExampleId(example.id)}
            >
              <span className="hp-example-letter">{example.letter}</span>
              <span><strong>{example.title}</strong><small>{example.summary}</small></span>
            </button>)}
          <TextAction onClick={openBuilder}>Explore all examples in the Query builder</TextAction>
          </div>
          <div className="hp-example-panel" id="hp-example-panel" role="tabpanel" aria-labelledby={`hp-tab-${activeExample.id}`}>
            <Playground
              initialQuery={activeExample.query}
              label={`Example ${activeExample.letter} · ${activeExample.title}`}
              functionDefinitions={functionDefinitions}
              suggestionData={suggestionData}
            />
          </div>
        </div>
      </section>

      <section className="hp-section" id="hp-capabilities" aria-labelledby="hp-interfaces-title">
        <SectionIntro
          id="hp-interfaces-title"
          kicker="ONE ENGINE · QUERY CAPABILITIES"
          title="Rich inputs. One engine. Multiple databases."
          text={`Use the input style that fits your application and development workflow. Text queries, structured definitions, fluent code, and frontend requests all use the same data model, then ${PRODUCT_NAME} generates the database-specific SQL needed for execution.`}
        />
        <div className="hp-engine-layout">
          <div className="hp-engine-input-panel">
            <div className="hp-interfaces">
              {INTERFACE_CARDS.map((card) => <article className="hp-card hp-interface" key={card.title}>
                <div className="hp-card-title-row">
                  <div className="hp-card-icon"><Icon name={card.icon} size={17} /></div>
                  <strong>{card.title}</strong>
                </div>
                <p className="hp-interface-lead">{card.text} {card.audience}{card.code && <> <code className="hp-interface-inline-code">{card.code}</code></>}</p>
              </article>)}
            </div>
            <TextAction onClick={openDocs}>Explore query interfaces</TextAction>
          </div>
          <div className="hp-engine-output-panel">
            <figure className="hp-engine-diagram" aria-labelledby="hp-engine-diagram-title">
              <div className="hp-engine-diagram-flow">
                <div className="hp-engine-diagram-column hp-engine-diagram-group">
                  <span className="hp-engine-diagram-label">Input types</span>
                  <div className="hp-engine-diagram-nodes">
                    {INTERFACE_CARDS.map((card) => <span className="hp-engine-node" key={card.title}><Icon name={card.icon} size={13} /> {card.title}</span>)}
                  </div>
                </div>
                <span className="hp-engine-diagram-arrow" aria-hidden="true">↓</span>
                <div className="hp-engine-diagram-engine">
                  <Icon name="database" size={18} />
                  <strong>{PRODUCT_NAME} engine</strong>
                  <small>Metadata · SQL Functions · SQL dialects</small>
                </div>
                <span className="hp-engine-diagram-arrow" aria-hidden="true">↓</span>
                <div className="hp-engine-diagram-column hp-engine-diagram-group">
                  <span className="hp-engine-diagram-label">Database TYPES</span>
                  <div className="hp-engine-diagram-nodes">
                    {providers.map((provider) => <span className="hp-engine-node" key={provider}><Icon name={getDatabaseIconName(provider)} size={13} /> {provider}</span>)}
                  </div>
                </div>
              </div>
            </figure>
            <TextAction onClick={onRequestConnection}>View database connections</TextAction>
          </div>
        </div>
      </section>

      <section className="hp-section" id="hp-reveal" aria-labelledby="hp-reveal-title">
        <SectionIntro
          id="hp-reveal-title"
          kicker="THE REVEAL"
          title={`Metadata gives ${PRODUCT_NAME} an understanding of your data.`}
          text={`Metadata describes the logical entities in your application, the fields they expose, and how those entities relate. ${PRODUCT_NAME} uses that context to understand what you ask for and work out how to retrieve it from your database.`}
        />
        <div className="hp-flow">
          <div className="hp-flow-step">
            <span className="hp-flow-label">Your application data</span>
            <ul className="hp-chip-list">{["Employees", "Locations", "Departments"].map((item) => <li key={item}><Icon name="table" size={12} /> {item}</li>)}</ul>
          </div>
          <div className="hp-flow-step">
            <span className="hp-flow-label">What you want to see</span>
            <ul className="hp-chip-list">{["Employee name", "Location name", "Department name"].map((item) => <li key={item}><Icon name="type" size={12} /> {item}</li>)}</ul>
          </div>
          <div className="hp-flow-step">
            <span className="hp-flow-label">Your query</span>
            <code className="hp-flow-query">Employees: FirstName, Location.Name, Department.Name</code>
          </div>
          <div className="hp-flow-step">
            <span className="hp-flow-label">What {PRODUCT_NAME} handles</span>
            <ol className="hp-flow-steps">
              <li>Find the employee data</li>
              <li>Follow the Location relationship</li>
              <li>Follow the Department relationship</li>
              <li>Build the required database query</li>
            </ol>
          </div>
          <div className="hp-flow-step hp-flow-result">
            <span className="hp-flow-label">Result</span>
            <p>An employee list with location and department names.</p>
            <button className="button secondary" type="button" onClick={() => showExample("relations")}><Icon name="play" size={11} /> Run it</button>
          </div>
        </div>
        <div className="hp-points-layout">
          <ul className="hp-points">{REVEAL_POINTS.map((point) => <li key={point}><Icon name="check" size={14} /><span>{point}</span></li>)}</ul>
          <div className="hp-points-feature"><Icon name="check" size={14} /><span>Automatically handles aggregates over related collections and contexts.</span></div>
        </div>
        <TextAction onClick={() => onNavigateToPage("metadata")}>See how {PRODUCT_NAME} understands your data</TextAction>
      </section>

      <section className="hp-section" id="hp-developers" aria-labelledby="hp-developers-title">
        <div className="hp-split">
          <SectionIntro
            id="hp-developers-title"
            kicker="FOR DEVELOPERS"
            title={`Define your data. Extend what your application can do.`}
            text={`Every application has its own business concepts, data relationships, and access rules. ${PRODUCT_NAME} lets developers define the logical data model their applications expose, then add the functions and capabilities that make that model useful to every query surface.`}
          />
          <dl className="hp-stats" aria-label="Live demo metadata">
            <div><dt>Entities</dt><dd>{metadataStatus === "succeeded" ? metadata.length : "—"}</dd></div>
            <div><dt>Relationships</dt><dd>{metadataStatus === "succeeded" ? relationCount : "—"}</dd></div>
            <div><dt>Functions</dt><dd>{functionDefinitions.length || "—"}</dd></div>
            <p>Loaded live from this demo&apos;s metadata.</p>
          </dl>
        </div>
        <CardGrid cards={[...DEVELOPER_CARDS, ...EXTENSION_CARDS]} />
        <p className="hp-note"><Icon name="schema" size={15} /><span>In {PRODUCT_NAME}&apos;s architecture, the data model and its extensions are called <strong>Metadata</strong>—the context that keeps entities, relationships, functions, integrations, and access rules discoverable and consistent. Define it with YAML, JSON, or .NET.</span></p>
        <div className="hp-developer-actions">
          <TextAction onClick={() => onNavigateToPage("metadata")}>Explore metadata and entity definitions</TextAction>
          <TextAction onClick={() => onNavigateToPage("functions")}>Explore extensibility</TextAction>
        </div>
      </section>

      <section className="hp-section hp-security" aria-labelledby="hp-security-title">
        <SectionIntro
          id="hp-security-title"
          kicker="SECURITY AND CONTROL"
          title="Flexible data access. Defined boundaries."
          text={`Dynamic querying should not mean unrestricted database access. ${PRODUCT_NAME} uses the application's data definitions and access rules to control what a query can reach.`}
        />
        <ul className="hp-points hp-points-stacked">
          {SECURITY_POINTS.map((point) => <li key={point.text} className={point.roadmap ? "roadmap" : ""}>
            <Icon name={point.roadmap ? "reset" : "key"} size={14} /><span>{point.text}{point.roadmap && <span className="hp-roadmap">Roadmap</span>}</span>
          </li>)}
        </ul>
        <TextAction onClick={openDocs}>Read the security documentation</TextAction>
      </section>

      <section className="hp-final" aria-labelledby="hp-final-title">
        <h2 id="hp-final-title">Start with one query.</h2>
        <p>Try a simple query, explore what {PRODUCT_NAME} can do, and see how it fits into your application.</p>
        <div className="hp-actions">
          <button className="button primary" type="button" onClick={openBuilder}><Icon name="play" size={12} /> Open Playground</button>
          <button className="button secondary" type="button" onClick={openDocs}><Icon name="file-text" size={14} /> Read the documentation</button>
        </div>
      </section>
    </div>
  );
}
