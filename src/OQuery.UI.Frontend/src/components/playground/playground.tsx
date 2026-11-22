import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon, { type IconName } from "../shared/icon/icon";
import { Heading } from "../main-layout/main-layout";
import OQueryEditor, { type OQueryEditorHandle } from "../oquery-editor/oquery-editor";
import { getOQuerySuggestionData } from "../oquery-editor/oquery-suggestion-data";
import { getOqueryContextBlocks } from "../oquery-editor/oquery-monaco-adapters";
import * as oQueryEditorService from "../../services/oquery-editor-service";
import type { RootState } from "../../store/store";
import {
  clearAllInlineResults,
  clearInlineResult,
  executeContextFromText,
} from "./playground-slice";
import {
  relationsForEntity,
  type DomainRelation,
  type EntityRelationView,
  type MetadataEntity,
  type MetadataField,
} from "../domains/domain-model";
import { builtinFilterOperators } from "../oquery-editor/filter-operators";
import CopilotThread from "./copilot-chat/copilot-thread";

const ENTITY_ROW_HEIGHT = 28;
const FIELD_ROW_HEIGHT = 24;
const RELATION_ROW_HEIGHT = 24;
const ROW_OVERSCAN = 6;
const ENTITY_WIDTH = { default: 150, min: 0, max: 420 };
const ENTITY_HIDDEN_WIDTH = 48;
const COPILOT_WIDTH = { default: 250, min: 200, max: 460 };
const COPILOT_COLLAPSED_WIDTH = 36;
// Gap between the screen top and the entity list while it is pinned during scroll.
const ENTITY_PIN_TOP = 6;
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
  return <Heading icon="query" title="Query playground" text="Ask questions across your business data" actions={<><button type="button" className="button secondary"><Icon name="code" size={14} />Format</button><button type="button" className="button secondary"><Icon name="save" size={14} />Save</button></>} />;
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
  return <div className={`playground-splitter${hidden ? " is-hidden" : ""}${minimized ? " is-minimized" : ""}`} role="separator" aria-orientation="vertical" aria-label={label} onPointerDown={startDrag} />;
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
    <h2 className="playground-eyebrow">Available entities</h2>
    <label className="playground-search"><Icon name="search" size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search entities or fields..." aria-label="Search entities or fields" /></label>
    {error && <p className="playground-message error">{error}</p>}
    {!error && rows.length === 0 && <p className="playground-message">{entities.length ? "No matches" : "No entities in this domain"}</p>}
    <div className="playground-list" ref={listRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="playground-list-content" style={{ height: offsets[rows.length] }}>
        {rows.slice(first, last).map((row, offset) => {
          const top = offsets[first + offset];
          const height = rowHeight(row);
          if (row.kind === "entity") {
            return <div key={row.key} className="playground-row playground-row-entity" style={{ top, height }}>
              <button type="button" className="playground-row-button" aria-expanded={row.open} onClick={() => toggleEntity(row.entity.name)}>
                <Icon name="table" size={14} />
                <span className="playground-name">{row.entity.name}</span>
                <span className="playground-row-toggle"><Icon name={row.open ? "chevron-down" : "chevron-right"} size={12} /></span>
              </button>
            </div>;
          }
          if (row.kind === "field") {
            const type = dataTypeIcon(row.field.dataType);
            return <div key={row.key} className="playground-row playground-row-field" style={{ top, height }}>
              <Icon name="field" size={12} />
              <span className="playground-name">{row.field.name}</span>
              <span className="playground-type" title={type.label} aria-label={type.label}><Icon name={type.icon} size={12} /></span>
            </div>;
          }
          const collection = row.relation.side === "target";
          return <div key={row.key} className="playground-row playground-row-relation" style={{ top, height }}>
            <span className="playground-relation-name">
              <Icon name={collection ? "relation-one-to-many" : "relation-many-to-one"} size={12} />
              <span className="playground-name">{row.relation.name}</span>
            </span>
            <span className="playground-ref"><span className="playground-arrow">→</span> {row.relation.refEntity}</span>
          </div>;
        })}
      </div>
    </div>
  </>;
}

function CopilotAside({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (collapsed) {
    return <aside className="playground-copilot collapsed">
      <button type="button" className="playground-icon-button" aria-label="Expand AI assistant" onClick={onToggle}><Icon name="chevron-left" size={14} /></button>
      <span className="playground-copilot-rail" title="AI assistant"><Icon name="robot" size={16} /></span>
    </aside>;
  }
  return <aside className="playground-copilot">
    <header className="playground-copilot-header">
      <span className="playground-copilot-title"><Icon name="robot" size={16} /><span className="playground-eyebrow">AI assistant</span></span>
      <button type="button" className="playground-icon-button" aria-label="Collapse AI assistant" onClick={onToggle}><Icon name="chevron-right" size={14} /></button>
    </header>
    <CopilotThread />
  </aside>;
}

export default function Playground({ queryId, projectId, domainId }: { queryId: string; projectId: string; domainId: string }) {
  const { entities: metadata, relations: metadataRelations } = useSelector((state: RootState) => state.metadata);
  const functionDefinitions = useSelector((state: RootState) => state.functionDefinitions.definitions);
  const filterOperators = builtinFilterOperators;
  const inlineResults = useSelector((state: RootState) => state.playground.inlineResults);
  const dispatch = useDispatch();
  const editorRef = useRef<OQueryEditorHandle>(null);
  const nextTabNumber = useRef(2);
  const copilotSlotRef = useRef<HTMLDivElement>(null);
  const entitiesRef = useRef<HTMLElement>(null);
  const entitiesSlotRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<EditorTab[]>(() => [{ id: "tab-1", title: queryId || "Untitled query", text: "" }]);
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [entityWidth, setEntityWidth] = useState(ENTITY_WIDTH.default);
  const [copilotWidth, setCopilotWidth] = useState(COPILOT_WIDTH.default);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const suggestionData = useMemo(() => getOQuerySuggestionData(metadata, metadataRelations), [metadata, metadataRelations]);

  // The entity panel's top sticks to the screen top once the layout scrolls above it, and its bottom always stays
  // inside the layout row. The list shrinks as the row's bottom moves up. Capping at the row keeps the row from growing
  // with the panel, so the page height does not change while scrolling.
  useLayoutEffect(() => {
    const slot = entitiesSlotRef.current;
    const panel = entitiesRef.current;
    const layout = slot?.parentElement;
    if (!slot || !panel || !layout) return;
    const update = () => {
      const rect = slot.getBoundingClientRect();
      const pinned = rect.top < ENTITY_PIN_TOP;
      const top = pinned ? ENTITY_PIN_TOP : rect.top;
      const bottom = Math.min(window.innerHeight, layout.getBoundingClientRect().bottom);
      panel.style.position = pinned ? "fixed" : "";
      panel.style.top = pinned ? `${ENTITY_PIN_TOP}px` : "";
      panel.style.left = pinned ? `${rect.left}px` : "";
      panel.style.width = pinned ? `${rect.width}px` : "";
      panel.style.height = `${Math.max(0, bottom - top)}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(layout);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // The AI assistant stays on screen. Its top follows the grid row until the row scrolls above the screen top, then sticks there.
  // Its bottom stops at the grid row's bottom, so the panel shrinks to fit its parent but never leaves the screen.
  useLayoutEffect(() => {
    const slot = copilotSlotRef.current;
    const row = slot?.parentElement;
    if (!slot || !row) return;
    const update = () => {
      const panel = slot.firstElementChild as HTMLElement | null;
      if (!panel) return;
      const rect = slot.getBoundingClientRect();
      const top = Math.max(0, row.getBoundingClientRect().top);
      const bottom = Math.min(window.innerHeight, row.getBoundingClientRect().bottom);
      panel.style.position = "fixed";
      panel.style.top = `${top}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${Math.max(0, bottom - top)}px`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [copilotCollapsed, copilotWidth]);

  useEffect(() => {
    if (!projectId || !domainId) return;
    setLoadError("");
    oQueryEditorService.load(projectId, domainId)
      .catch((reason: unknown) => setLoadError(reason instanceof Error ? reason.message : "Unable to load domain metadata."));
  }, [projectId, domainId]);

  const updateTabText = (id: string, text: string) => setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, text } : tab)));
  // Results stay until the user clears them, so opening or switching tabs never wipes a grid.
  const selectTab = (id: string) => {
    if (id === activeTabId) return;
    setActiveTabId(id);
    setMessage("");
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

  return <div className="playground-root" style={{ gridTemplateColumns: `minmax(0,1fr) 6px ${copilotCollapsed ? COPILOT_COLLAPSED_WIDTH : copilotWidth}px` }}>
    <div className="playground-main">
      <PlaygroundHeading />
      <div className="playground-layout" style={{ gridTemplateColumns: `${entityWidth}px 6px minmax(0,1fr)` }}>
    <div ref={entitiesSlotRef} className="playground-entities-slot">
      <aside ref={entitiesRef} className={`playground-entities${entityWidth < ENTITY_HIDDEN_WIDTH ? " is-collapsed" : ""}`}>
        <EntityExplorer entities={metadata} relations={metadataRelations} error={loadError} />
      </aside>
    </div>
    <Splitter minimized={entityWidth <= ENTITY_HIDDEN_WIDTH} label="Resize available entities" onDrag={(delta) => setEntityWidth((width) => clamp(width + delta, ENTITY_WIDTH.min, ENTITY_WIDTH.max))} />
    <section className="playground-editor-area">
      <div className="playground-tabs" role="tablist">
        {tabs.map((tab) => <div key={tab.id} className={`playground-tab${tab.id === activeTab.id ? " active" : ""}`}>
          <button type="button" role="tab" aria-selected={tab.id === activeTab.id} onClick={() => selectTab(tab.id)}>
            <Icon name="file-text" size={13} />{tab.title}
          </button>
          {tabs.length > 1 && <button type="button" className="playground-tab-close" aria-label={`Close ${tab.title}`} onClick={() => closeTab(tab.id)}><Icon name="close" size={11} /></button>}
        </div>)}
        <button type="button" className="playground-tab-add" aria-label="New query tab" onClick={addTab}><Icon name="plus" size={13} /></button>
      </div>
      <div className="playground-editor-host">
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
          gutterWidth={2}
          onExecuteQuery={runEntry}
          onExecuteContext={runContext}
          inlineResults={inlineResults}
          onClearInlineResult={(name) => dispatch(clearInlineResult(name))}
        />
      </div>
      {message && <p className="playground-message error">{message}</p>}
    </section>
      </div>
    </div>
    <Splitter hidden={copilotCollapsed} label="Resize AI assistant" onDrag={(delta) => setCopilotWidth((width) => clamp(width - delta, COPILOT_WIDTH.min, COPILOT_WIDTH.max))} />
    <div ref={copilotSlotRef} className="playground-copilot-slot">
      <CopilotAside collapsed={copilotCollapsed} onToggle={() => setCopilotCollapsed((collapsed) => !collapsed)} />
    </div>
  </div>;
}
