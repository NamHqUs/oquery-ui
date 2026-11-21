import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon, { type IconName } from "../icon/icon";
import OQueryEditor, { type OQueryEditorHandle } from "../oquery-editor/oquery-editor";
import { getOQuerySuggestionData } from "../oquery-editor/oquery-suggestion-data";
import { getOqueryContextBlocks } from "../oquery-editor/oquery-monaco-adapters";
import * as oQueryEditorService from "../../services/oquery-editor-service";
import type { RootState } from "../../store/store";
import {
  clearAllInlineResults,
  clearInlineResult,
  executeContextFromText,
  relationsForEntity,
  type DomainRelation,
  type EntityRelationView,
  type MetadataEntity,
  type MetadataField,
} from "../query-builder/query-design/query-builder-slice";
import "./playground.css";

const ENTITY_ROW_HEIGHT = 28;
const FIELD_ROW_HEIGHT = 24;
const RELATION_ROW_HEIGHT = 24;
const ROW_OVERSCAN = 6;
const ENTITY_WIDTH = { default: 150, min: 0, max: 420 };
const ENTITY_HIDDEN_WIDTH = 48;
const COPILOT_WIDTH = { default: 250, min: 200, max: 460 };
const COPILOT_COLLAPSED_WIDTH = 36;
const suggestions: Array<[string, IconName]> = [
  ["Add a date filter", "type-datetime"],
  ["Add a revenue threshold", "chart-line"],
  ["Explain this query", "file-text"],
  ["Create a visualization", "chart-bar"],
];

type EditorTab = { id: string; title: string; text: string };
type ExplorerRow =
  | { kind: "entity"; key: string; entity: MetadataEntity; open: boolean }
  | { kind: "field"; key: string; field: MetadataField }
  | { kind: "relation"; key: string; relation: EntityRelationView };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Maps a column type to an icon. The original type name stays available as a tooltip.
function dataTypeIcon(dataType = ""): { icon: IconName; label: string } {
  const type = dataType.toLowerCase();
  if (/bool|bit/.test(type)) return { icon: "type-boolean", label: dataType };
  if (/date|time/.test(type)) return { icon: "type-datetime", label: dataType };
  if (/int|num|dec|float|double|real|money|serial/.test(type)) return { icon: "type-number", label: dataType };
  return { icon: "type", label: dataType || "unknown" };
}

// Collapsed entities show only their name. Fields and relations appear when an entity is opened,
// or when a search term matches one of its fields.
function buildExplorerRows(entities: MetadataEntity[], relations: DomainRelation[], term: string, expanded: Set<string>): ExplorerRow[] {
  const rows: ExplorerRow[] = [];
  for (const entity of entities) {
    const entityMatches = !term || entity.name.toLowerCase().includes(term);
    const fields = entityMatches ? entity.fields : entity.fields.filter((field) => field.name.toLowerCase().includes(term));
    if (!entityMatches && fields.length === 0) continue;
    const open = expanded.has(entity.name) || (Boolean(term) && !entityMatches);
    rows.push({ kind: "entity", key: `entity:${entity.name}`, entity, open });
    if (!open) continue;
    for (const field of fields) rows.push({ kind: "field", key: `field:${entity.name}.${field.name}`, field });
    for (const relation of relationsForEntity(entity.name, relations)) {
      rows.push({ kind: "relation", key: `relation:${entity.name}.${relation.name}`, relation });
    }
  }
  return rows;
}

function rowHeight(row: ExplorerRow) {
  if (row.kind === "relation") return RELATION_ROW_HEIGHT;
  return row.kind === "field" ? FIELD_ROW_HEIGHT : ENTITY_ROW_HEIGHT;
}

// Row tops as a prefix sum, so rows of different heights can be windowed by binary search.
function rowOffsets(rows: ExplorerRow[]) {
  const offsets = [0];
  for (const row of rows) offsets.push(offsets[offsets.length - 1] + rowHeight(row));
  return offsets;
}

// Index of the row that contains the given vertical position.
function rowAt(offsets: number[], y: number) {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid] <= y) low = mid;
    else high = mid - 1;
  }
  return low;
}

function PlaygroundHeading() {
  return <div className="pg-heading"><div><span className="pg-heading-icon"><Icon name="query" size={23} /></span><span><h1>Query playground</h1><p>Ask questions across your business data</p></span></div><div className="pg-heading-actions"><button type="button"><Icon name="code" size={13} />Format</button><button type="button"><Icon name="save" size={13} />Save</button></div></div>;
}

function Splitter({ label, hidden = false, minimized = false, onDrag }: { label: string; hidden?: boolean; minimized?: boolean; onDrag: (delta: number) => void }) {
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    let lastX = event.clientX;
    const move = (moveEvent: PointerEvent) => {
      onDrag(moveEvent.clientX - lastX);
      lastX = moveEvent.clientX;
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return <div className={`pg-splitter${hidden ? " is-hidden" : ""}${minimized ? " is-minimized" : ""}`} role="separator" aria-orientation="vertical" aria-label={label} onPointerDown={startDrag} />;
}

function EntityExplorer({ entities, relations, error }: { entities: MetadataEntity[]; relations: DomainRelation[]; error: string }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const listRef = useRef<HTMLDivElement>(null);
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => buildExplorerRows(entities, relations, term, expanded), [entities, relations, term, expanded]);
  const offsets = useMemo(() => rowOffsets(rows), [rows]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setViewportHeight(list.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const toggleEntity = (name: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const first = Math.max(0, rowAt(offsets, scrollTop) - ROW_OVERSCAN);
  const last = Math.min(rows.length, rowAt(offsets, scrollTop + viewportHeight) + 1 + ROW_OVERSCAN);

  return <>
    <h2 className="pg-eyebrow">Available entities</h2>
    <label className="pg-search"><Icon name="search" size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search entities or fields..." aria-label="Search entities or fields" /></label>
    {error && <p className="pg-message error">{error}</p>}
    {!error && rows.length === 0 && <p className="pg-message">{entities.length ? "No matches" : "No entities in this domain"}</p>}
    <div className="pg-list" ref={listRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="pg-list-content" style={{ height: offsets[rows.length] }}>
        {rows.slice(first, last).map((row, offset) => {
          const top = offsets[first + offset];
          const height = rowHeight(row);
          if (row.kind === "entity") {
            return <div key={row.key} className="pg-row pg-row-entity" style={{ top, height }}>
              <button type="button" className="pg-row-button" aria-expanded={row.open} onClick={() => toggleEntity(row.entity.name)}>
                <Icon name="table" size={14} />
                <span className="pg-name">{row.entity.name}</span>
                <span className="pg-row-toggle"><Icon name={row.open ? "chevron-down" : "chevron-right"} size={12} /></span>
              </button>
            </div>;
          }
          if (row.kind === "field") {
            const type = dataTypeIcon(row.field.dataType);
            return <div key={row.key} className="pg-row pg-row-field" style={{ top, height }}>
              <Icon name="field" size={12} />
              <span className="pg-name">{row.field.name}</span>
              <span className="pg-type" title={type.label} aria-label={type.label}><Icon name={type.icon} size={12} /></span>
            </div>;
          }
          const collection = row.relation.side === "target";
          return <div key={row.key} className="pg-row pg-row-relation" style={{ top, height }}>
            <span className="pg-relation-name">
              <Icon name={collection ? "relation-one-to-many" : "relation-many-to-one"} size={12} />
              <span className="pg-name">{row.relation.name}</span>
            </span>
            <span className="pg-ref"><span className="pg-arrow">→</span> {row.relation.refEntity}</span>
          </div>;
        })}
      </div>
    </div>
  </>;
}

function CopilotAside({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (collapsed) {
    return <aside className="pg-copilot collapsed">
      <button type="button" className="pg-icon-button" aria-label="Expand AI assistant" onClick={onToggle}><Icon name="chevron-left" size={14} /></button>
      <span className="pg-copilot-rail" title="AI assistant"><Icon name="function" size={16} /></span>
    </aside>;
  }
  return <aside className="pg-copilot">
    <header className="pg-copilot-header">
      <span className="pg-copilot-title"><Icon name="function" size={16} /><span className="pg-eyebrow">AI assistant</span></span>
      <button type="button" className="pg-icon-button" aria-label="Collapse AI assistant" onClick={onToggle}><Icon name="chevron-right" size={14} /></button>
    </header>
    <div className="pg-copilot-content">
      <p className="pg-copilot-intro">Get help, suggestions, and generate queries with natural language.</p>
      <h3>Quick suggestions</h3>
      {suggestions.map(([label, icon]) => <button type="button" className="pg-suggestion" key={label}><Icon name={icon} size={14} />{label}<Icon name="chevron-right" size={13} /></button>)}
    </div>
    <div className="pg-copilot-question">
      <h3>Ask a question</h3>
      <textarea placeholder="e.g. Show top customers by revenue" />
      <button className="pg-primary" type="button"><Icon name="function" size={13} /> Generate query</button>
    </div>
  </aside>;
}

export default function Playground({ queryId, projectId, domainId }: { queryId: string; projectId: string; domainId: string }) {
  const { metadata, metadataRelations, functionDefinitions, filterOperators, inlineResults } = useSelector((state: RootState) => state.queryBuilder);
  const dispatch = useDispatch();
  const editorRef = useRef<OQueryEditorHandle>(null);
  const nextTabNumber = useRef(2);
  const [tabs, setTabs] = useState<EditorTab[]>(() => [{ id: "tab-1", title: queryId || "Untitled query", text: "" }]);
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [entityWidth, setEntityWidth] = useState(ENTITY_WIDTH.default);
  const [copilotWidth, setCopilotWidth] = useState(COPILOT_WIDTH.default);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const suggestionData = useMemo(() => getOQuerySuggestionData(metadata, metadataRelations), [metadata, metadataRelations]);

  useEffect(() => {
    if (!projectId || !domainId) return;
    setLoadError("");
    oQueryEditorService.load(projectId, domainId)
      .catch((reason: unknown) => setLoadError(reason instanceof Error ? reason.message : "Unable to load domain metadata."));
  }, [projectId, domainId]);

  const updateTabText = (id: string, text: string) => setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, text } : tab)));
  // Inline results are keyed by context name, so they are cleared when the visible document changes.
  const selectTab = (id: string) => {
    if (id === activeTabId) return;
    setActiveTabId(id);
    setMessage("");
    dispatch(clearAllInlineResults());
  };
  const addTab = () => {
    const number = nextTabNumber.current++;
    const id = `tab-${number}`;
    setTabs((current) => [...current, { id, title: `Untitled query ${number}`, text: "" }]);
    selectTab(id);
  };
  const closeTab = (id: string) => {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (id === activeTabId) {
      setActiveTabId(remaining[Math.max(0, index - 1)].id);
      dispatch(clearAllInlineResults());
    }
  };

  // Results render inside the editor, under the context block that produced them.
  const runContext = (contextName: string) => {
    if (!projectId || !domainId) {
      setMessage("Choose a project and an active domain before running a query.");
      return;
    }
    setMessage("");
    dispatch(executeContextFromText({ text: editorRef.current?.getText() ?? activeTab.text, context: contextName, projectId, domainId }));
  };
  // Run executes the first context block, the entry point of the query.
  const runEntry = () => {
    const query = editorRef.current?.getText() ?? activeTab.text;
    const entry = getOqueryContextBlocks(query)[0]?.contextName;
    if (!entry) {
      setMessage("Add a context header such as Customer: to run the query.");
      return;
    }
    runContext(entry);
  };

  return <div className="pg-root" style={{ gridTemplateColumns: `minmax(0,1fr) 6px ${copilotCollapsed ? COPILOT_COLLAPSED_WIDTH : copilotWidth}px` }}>
    <div className="pg-main">
      <PlaygroundHeading />
      <div className="pg-layout" style={{ gridTemplateColumns: `${entityWidth}px 6px minmax(0,1fr)` }}>
    <aside className={`pg-entities${entityWidth < ENTITY_HIDDEN_WIDTH ? " is-collapsed" : ""}`}>
      <EntityExplorer entities={metadata} relations={metadataRelations} error={loadError} />
    </aside>
    <Splitter minimized={entityWidth <= ENTITY_HIDDEN_WIDTH} label="Resize available entities" onDrag={(delta) => setEntityWidth((width) => clamp(width + delta, ENTITY_WIDTH.min, ENTITY_WIDTH.max))} />
    <section className="pg-editor-area">
      <div className="pg-tabs" role="tablist">
        {tabs.map((tab) => <div key={tab.id} className={`pg-tab${tab.id === activeTab.id ? " active" : ""}`}>
          <button type="button" role="tab" aria-selected={tab.id === activeTab.id} onClick={() => selectTab(tab.id)}>
            <Icon name="file-text" size={13} />{tab.title}
          </button>
          {tabs.length > 1 && <button type="button" className="pg-tab-close" aria-label={`Close ${tab.title}`} onClick={() => closeTab(tab.id)}><Icon name="close" size={11} /></button>}
        </div>)}
        <button type="button" className="pg-tab-add" aria-label="New query tab" onClick={addTab}><Icon name="plus" size={13} /></button>
      </div>
      <div className="pg-editor-host">
        <OQueryEditor
          key={activeTab.id}
          ref={editorRef}
          oquery
          autoHeight
          initialText={activeTab.text}
          onTextChange={(text) => updateTabText(activeTab.id, text)}
          domain={{ id: domainId, name: domainId, entities: metadata, relations: metadataRelations }}
          functionDefinitions={functionDefinitions}
          operators={filterOperators}
          suggestionFields={suggestionData.fields}
          suggestionEntities={suggestionData.entities}
          suggestionEntitiesMetadata={suggestionData.entitiesMetadata}
          gutterWidth={7}
          onExecuteQuery={runEntry}
          onExecuteContext={runContext}
          inlineResults={inlineResults}
          onClearInlineResult={(name) => dispatch(clearInlineResult(name))}
        />
      </div>
      {message && <p className="pg-message error">{message}</p>}
    </section>
      </div>
    </div>
    <Splitter hidden={copilotCollapsed} label="Resize AI assistant" onDrag={(delta) => setCopilotWidth((width) => clamp(width - delta, COPILOT_WIDTH.min, COPILOT_WIDTH.max))} />
    <CopilotAside collapsed={copilotCollapsed} onToggle={() => setCopilotCollapsed((collapsed) => !collapsed)} />
  </div>;
}
