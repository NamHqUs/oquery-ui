import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon, { type IconName } from "../shared/icon/icon";
import { Heading } from "../main-layout/main-layout";
import OQueryEditor, { type OQueryEditorHandle } from "../oquery-editor/oquery-editor";
import { getOQuerySuggestionData } from "../oquery-editor/oquery-suggestion-data";
import { getOqueryContextBlocks } from "../oquery-editor/oquery-monaco-adapters";
import * as oQueryEditorService from "../../services/oquery-editor-service";
import type { PlaygroundPayload, SavedPlayground } from "../../services/playground-service";
import type { RootState } from "../../store/store";
import {
  clearAllInlineResults,
  clearInlineResult,
  deletePlayground,
  executeContextFromText,
  executeQueryFromText,
  fetchSavedPlaygrounds,
  savePlayground,
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
import type { HeaderAction } from "../shared/page-header/page-header-actions";

const ENTITY_ROW_HEIGHT = 28;
const FIELD_ROW_HEIGHT = 24;
const RELATION_ROW_HEIGHT = 24;
const ROW_OVERSCAN = 6;
const ENTITY_WIDTH = { default: 240, min: 0, max: 420 };
const ENTITY_HIDDEN_WIDTH = 48;
const COPILOT_WIDTH = { default: 250, min: 200, max: 460 };
const COPILOT_COLLAPSED_WIDTH = 36;
// Gap between the screen top and the entity list while it is pinned during scroll.
const ENTITY_PIN_TOP = 6;
type EditorTab = { id: string; title: string; text: string };
// A transient save or error message. It hides after 5 seconds unless the user pins it.
type Notice = { id: number; text: string; kind: "success" | "error"; pinned: boolean };
const NOTICE_TIMEOUT_MS = 5000;
// What the user asked to switch to: a fresh New playground or a saved one.
type PlaygroundAction = { kind: "new" } | { kind: "open"; item: SavedPlayground };
// Compares the playground name, tab titles and text. The current playground is dirty when this differs from its last loaded or saved snapshot.
const snapshotOf = (items: EditorTab[], name: string) => JSON.stringify({ name, tabs: items.map(({ title, text }) => ({ title, text })) });
type ExplorerRow =
  | { kind: "entity"; key: string; entity: MetadataEntity; open: boolean }
  | { kind: "field"; key: string; field: MetadataField }
  | { kind: "relation"; key: string; relation: EntityRelationView };

// Long saved names are cut to a fixed length so the heading always stays on one line and keeps its height.
const HEADER_TITLE_MAX = 32;
function headerTitleOf(name: string) {
  return name.length > HEADER_TITLE_MAX ? `${name.slice(0, HEADER_TITLE_MAX - 1)}…` : name;
}

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

// Run and Save are listed first, then the other actions; the ⋯ menu takes whatever does not fit.
// Format is a placeholder that stays in the menu until it is wired up.
function PlaygroundHeading({ title, dirty, onRun, onDelete, onNew, onReload, onSave, saving, deleting, running }: { title: string; dirty: boolean; onRun: () => void; onDelete?: () => void; onNew: () => void; onReload: () => void; onSave: () => void; saving: boolean; deleting: boolean; running: boolean }) {
  const busy = saving || deleting;
  const actions: HeaderAction[] = [
    { key: "run", label: running ? "Running..." : "Run", icon: "play", onSelect: onRun, disabled: busy || running, className: "button primary" },
    { key: "save", label: saving ? "Saving..." : "Save", icon: "save", onSelect: onSave, disabled: busy, className: "button secondary" },
    { key: "format", label: "Format", icon: "code", onSelect: () => undefined, disabled: true, title: "Not available yet", overflowOnly: true },
    { key: "reload", label: "Reload", icon: "refresh", onSelect: onReload, disabled: busy, className: "button secondary" },
    { key: "new", label: "New", icon: "file-plus", onSelect: onNew, disabled: busy, className: "button secondary" },
  ];
  if (onDelete) actions.push({ key: "delete", label: deleting ? "Deleting..." : "Delete", icon: "trash", onSelect: onDelete, disabled: busy, danger: true, className: "button danger" });
  return <Heading icon="query" title={title} text="Ask questions across your business data" actionItems={actions} status={dirty ? <span className="page-header-status">Unsaved</span> : null} />;
}

// Shown when the current playground has unsaved changes and another playground (or New) is requested.
function UnsavedChangesDialog({ saving, onSave, onDiscard, onCancel }: { saving: boolean; onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  return <div className="playground-name-backdrop" onClick={onCancel}>
    <div className="playground-name-dialog" role="dialog" aria-modal="true" aria-labelledby="playground-unsaved-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
      <h2 id="playground-unsaved-title">Unsaved changes</h2>
      <p>Save changes to the current playground before continuing?</p>
      <div className="playground-name-actions">
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="button secondary" onClick={onDiscard} disabled={saving}>Discard</button>
        <button type="button" className="button" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
      </div>
    </div>
  </div>;
}

// Generic yes/no dialog rendered in the app's style. Escape or the backdrop cancels.
function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <div className="playground-name-backdrop" onClick={onCancel}>
    <div className="playground-name-dialog" role="dialog" aria-modal="true" aria-labelledby="playground-confirm-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
      <h2 id="playground-confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="playground-name-actions">
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="button danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}

// Double-click the tab title to rename it. Enter or blur commits; Escape cancels. An empty name keeps the old one.
function PlaygroundTabButton({ tab, active, canClose, onSelect, onRename, onClose }: { tab: EditorTab; active: boolean; canClose: boolean; onSelect: () => void; onRename: (title: string) => void; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);
  // Blur also fires when Enter or Escape removes the input, so a finished edit must not finish twice.
  const finished = useRef(false);
  const startEditing = () => {
    finished.current = false;
    setDraft(tab.title);
    setEditing(true);
  };
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const next = draft.trim();
    if (save && next && next !== tab.title) onRename(next);
  };
  return <div className={`playground-tab${active ? " active" : ""}`}>
    {editing
      ? <div className="playground-tab-editing">
        <Icon name="file-text" size={13} />
        <input className="playground-tab-input" aria-label="Tab name" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") finish(true);
            else if (event.key === "Escape") finish(false);
          }} />
      </div>
      : <button type="button" role="tab" aria-selected={active} title="Double-click to rename" onClick={onSelect} onDoubleClick={startEditing}>
        <Icon name="file-text" size={13} />{tab.title}
      </button>}
    {canClose && <button type="button" className="playground-tab-close" aria-label={`Close ${tab.title}`} onClick={onClose}><Icon name="close" size={11} /></button>}
  </div>;
}

// Asks for the playground name before a save. Enter confirms, Escape or the backdrop cancels.
function PlaygroundNameDialog({ initial, onConfirm, onCancel }: { initial: string; onConfirm: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return <div className="playground-name-backdrop" onClick={onCancel}>
    <form
      className="playground-name-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playground-name-title"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
      onSubmit={(event) => { event.preventDefault(); if (trimmed) onConfirm(trimmed); }}
    >
      <h2 id="playground-name-title">Save playground</h2>
      <label>Playground name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Top customers by revenue" /></label>
      <div className="playground-name-actions">
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button" disabled={!trimmed}>Save</button>
      </div>
    </form>
  </div>;
}

// Double-click the open playground to rename it. The new name stays in memory until Save. Enter or blur applies; Escape cancels. An empty name keeps the old one.
function SavedPlaygroundItem({ name, active, dirty, onOpen, onRename }: { name: string; active: boolean; dirty: boolean; onOpen: () => void; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  // Blur also fires when Enter or Escape removes the input, so a finished edit must not finish twice.
  const finished = useRef(false);
  const startEditing = () => {
    if (!active) return;
    finished.current = false;
    setDraft(name);
    setEditing(true);
  };
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const next = draft.trim();
    if (save && next && next !== name) onRename(next);
  };
  const pencil = editing || (dirty && active);
  const className = `playground-saved-item${active ? " active" : ""}${pencil ? " is-edit" : ""}`;
  const leadingIcon = pencil ? "edit" : "file-text";
  const content = <>
    <span className="playground-saved-icon"><Icon name={leadingIcon} size={13} /></span>
    {editing
      ? <input className="playground-tab-input" aria-label="Playground name" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(true);
          else if (event.key === "Escape") finish(false);
        }} />
      : <span className="playground-name">{name || "Untitled playground"}</span>}
  </>;
  if (editing) return <div className={className}>{content}</div>;
  return <button type="button" className={className} aria-current={active} title={active ? "Double-click to rename" : undefined} onClick={onOpen} onDoubleClick={startEditing}>{content}</button>;
}

function SavedPlaygroundList({ items, status, error, activeId, activeName, dirty, onOpen, onRename }: { items: SavedPlayground[]; status: string; error: string; activeId: string | null; activeName: string; dirty: boolean; onOpen: (item: SavedPlayground) => void; onRename: (name: string) => void }) {
  if (error) return <p className="playground-message error">{error}</p>;
  if (status === "loading" && items.length === 0) return <p className="playground-message">Loading saved playgrounds...</p>;
  if (items.length === 0) return <p className="playground-message">No saved playgrounds in this domain</p>;
  return <div className="playground-saved-list">
    {items.map((item) => {
      const active = item.id === activeId;
      return <SavedPlaygroundItem key={item.id} name={active ? activeName : item.name} active={active} dirty={dirty} onOpen={() => onOpen(item)} onRename={onRename} />;
    })}
  </div>;
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
  const runState = useSelector((state: RootState) => state.playground.run);
  const runStatus = runState.status;
  const dispatch = useDispatch();
  const editorRef = useRef<OQueryEditorHandle>(null);
  const nextTabNumber = useRef(2);
  const copilotSlotRef = useRef<HTMLDivElement>(null);
  const entitiesRef = useRef<HTMLElement>(null);
  const entitiesSlotRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<EditorTab[]>(() => [{ id: "tab-1", title: queryId || "Untitled query", text: "" }]);
  // Snapshot of the tabs as last loaded or saved. Changes compare against it to detect unsaved edits.
  const [baseline, setBaseline] = useState(() => snapshotOf(tabs, ""));
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [entityWidth, setEntityWidth] = useState(ENTITY_WIDTH.default);
  const [copilotWidth, setCopilotWidth] = useState(COPILOT_WIDTH.default);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  const [sidePanel, setSidePanel] = useState<"entities" | "saved">("saved");
  const [savedPlaygroundId, setSavedPlaygroundId] = useState<string | null>(null);
  const [playgroundName, setPlaygroundName] = useState("");
  // null means the name dialog is closed; otherwise it holds the name shown in the dialog.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  // Set when the user asked to switch playgrounds while the current one has unsaved changes.
  const [pendingAction, setPendingAction] = useState<PlaygroundAction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const noticeId = notice?.id;
  const noticePinned = notice?.pinned;
  // Hides the notice after the timeout. Pinning cancels the timer, so the notice stays until closed.
  useEffect(() => {
    if (noticeId === undefined || noticePinned) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [noticeId, noticePinned]);
  const notify = (text: string, kind: Notice["kind"]) => setNotice({ id: Date.now(), text, kind, pinned: false });
  const savedPlaygrounds = useSelector((state: RootState) => state.playground.saved);
  const saveStatus = useSelector((state: RootState) => state.playground.saveStatus);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const isDirty = snapshotOf(tabs, playgroundName) !== baseline;
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

  // Switching domains leaves the saved selection. Typed text stays as a New playground, which is not dirty.
  useEffect(() => {
    if (!projectId || !domainId) return;
    setSavedPlaygroundId(null);
    setPlaygroundName("");
    setBaseline(snapshotOf(tabs, ""));
    dispatch(fetchSavedPlaygrounds({ projectId, domainId }));
  }, [dispatch, projectId, domainId]);

  // Tab text is raw OQuery text; it is stored as typed without parsing or validation.
  const buildPlaygroundPayload = (name: string): PlaygroundPayload => {
    const tabsPayload = tabs.map((tab) => ({ title: tab.title, content: tab.text }));
    const entity = tabsPayload.map((tab) => getOqueryContextBlocks(tab.content)[0]?.contextName).find(Boolean) ?? "";
    return { name, entity, domainId, tabs: tabsPayload };
  };

  // Save first asks for the playground name; the request is sent only after the name is confirmed.
  const savePlaygroundClick = () => {
    if (!projectId || !domainId) {
      notify("Choose a project and an active domain before saving.", "error");
      return;
    }
    setMessage("");
    if (saveExisting()) confirmSave(playgroundName);
    else setNameDraft(playgroundName);
  };

  // Saves the current playground. A pending switch runs only after the save succeeds.
  const confirmSave = async (name: string) => {
    const snapshot = snapshotOf(tabs, name);
    const pending = pendingAction;
    setNameDraft(null);
    setPlaygroundName(name);
    const result = await dispatch(savePlayground({ projectId, playground: buildPlaygroundPayload(name), id: savedPlaygroundId ?? undefined }));
    if (!savePlayground.fulfilled.match(result)) {
      setPendingAction(null);
      notify(String(result.payload ?? "Unable to save playground."), "error");
      return;
    }
    setSavedPlaygroundId(result.payload.id);
    setBaseline(snapshot);
    notify(`Saved "${name}"`, "success");
    setPendingAction(null);
    if (pending) applyAction(pending);
  };

  // An existing playground saves directly (update); only a new one asks for its name first.
  const saveExisting = () => savedPlaygroundId !== null && playgroundName.trim() !== "";
  const saveFromPrompt = () => {
    if (saveExisting()) confirmSave(playgroundName);
    else setNameDraft(playgroundName);
  };

  // Replaces the editor with a New playground or a saved one, and records the result as the clean baseline.
  const applyAction = (action: PlaygroundAction) => {
    setMessage("");
    dispatch(clearAllInlineResults());
    const source = action.kind === "open" ? action.item.tabs : [];
    const next = (source.length ? source : [{ title: "Untitled query", content: "" }]).map((tab) => ({
      // New ids remount the editor so it shows the loaded text instead of the previous tab's text.
      id: `tab-${nextTabNumber.current++}`,
      title: tab.title,
      text: tab.content,
    }));
    setTabs(next);
    setActiveTabId(next[0].id);
    setBaseline(snapshotOf(next, action.kind === "open" ? action.item.name : ""));
    if (action.kind === "open") {
      setSavedPlaygroundId(action.item.id);
      setPlaygroundName(action.item.name);
    } else {
      setSavedPlaygroundId(null);
      setPlaygroundName("");
    }
  };

  // Every switch checks the current playground first: unsaved changes ask to save, discard, or cancel.
  const requestAction = (action: PlaygroundAction) => {
    if (action.kind === "open" && action.item.id === savedPlaygroundId) return;
    if (isDirty) setPendingAction(action);
    else applyAction(action);
  };

  const requestDelete = () => {
    if (savedPlaygroundId) setDeleteConfirmOpen(true);
  };

  const performDelete = async () => {
    if (!savedPlaygroundId || !projectId || !domainId) return;
    setMessage("");
    setDeleting(true);
    const result = await dispatch(deletePlayground({ projectId, domainId, id: savedPlaygroundId }));
    setDeleting(false);
    if (deletePlayground.fulfilled.match(result)) {
      notify("Playground deleted", "success");
      applyAction({ kind: "new" });
    } else {
      notify(String(result.payload ?? "Unable to delete playground."), "error");
    }
  };

  // Refreshes the saved list and reloads the open playground from it.
  const performReload = async () => {
    if (!projectId || !domainId) return;
    setMessage("");
    const result = await dispatch(fetchSavedPlaygrounds({ projectId, domainId }));
    if (!fetchSavedPlaygrounds.fulfilled.match(result) || !savedPlaygroundId) return;
    const item = result.payload.find((saved) => saved.id === savedPlaygroundId);
    if (item) applyAction({ kind: "open", item });
    else notify("This playground no longer exists.", "error");
  };

  // Unsaved edits need confirmation before a reload discards them.
  const reloadCurrent = () => {
    if (isDirty) setReloadConfirmOpen(true);
    else performReload();
  };

  const selectSidePanel = (panel: "entities" | "saved") => {
    setSidePanel(panel);
    if (panel === "saved" && projectId && domainId) dispatch(fetchSavedPlaygrounds({ projectId, domainId }));
  };

  const updateTabText = (id: string, text: string) => setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, text } : tab)));
  const renameTab = (id: string, title: string) => setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, title } : tab)));
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
  // Run posts the whole tab text; the API detects the entry point and the result renders under its context block.
  const runEntry = () => {
    if (!projectId || !domainId) {
      setMessage("Choose a project and an active domain before running a query.");
      return;
    }
    setMessage("");
    dispatch(executeQueryFromText({ text: editorRef.current?.getText() ?? activeTab.text, projectId, domainId }));
  };

  return <div className="playground-shell">
      <PlaygroundHeading title={savedPlaygroundId ? headerTitleOf(playgroundName) || "Saved playground" : "Query playground"} dirty={isDirty} onRun={runEntry} onNew={() => requestAction({ kind: "new" })} onReload={reloadCurrent} onSave={savePlaygroundClick} onDelete={savedPlaygroundId ? requestDelete : undefined} saving={saveStatus === "saving"} deleting={deleting} running={runStatus === "running"} />
  <div className="playground-root" style={{ gridTemplateColumns: `minmax(0,1fr) 6px ${copilotCollapsed ? COPILOT_COLLAPSED_WIDTH : copilotWidth}px` }}>
    <div className="playground-main">
      {nameDraft !== null && <PlaygroundNameDialog initial={nameDraft} onConfirm={confirmSave} onCancel={() => { setNameDraft(null); setPendingAction(null); }} />}
      {pendingAction && nameDraft === null && <UnsavedChangesDialog saving={saveStatus === "saving"} onSave={saveFromPrompt} onDiscard={() => { const action = pendingAction; setPendingAction(null); applyAction(action); }} onCancel={() => setPendingAction(null)} />}
      {deleteConfirmOpen && <ConfirmDialog title="Delete playground?" message={`"${playgroundName || "This playground"}" will be deleted. This cannot be undone.`} confirmLabel="Delete" onConfirm={() => { setDeleteConfirmOpen(false); performDelete(); }} onCancel={() => setDeleteConfirmOpen(false)} />}
      {reloadConfirmOpen && <ConfirmDialog title="Discard unsaved changes?" message="Reloading replaces the editor with the saved playground. Unsaved changes will be lost." confirmLabel="Discard and reload" onConfirm={() => { setReloadConfirmOpen(false); performReload(); }} onCancel={() => setReloadConfirmOpen(false)} />}
      {notice && <div className={`playground-toast ${notice.kind}`} role="status" aria-live="polite">
        <Icon name={notice.kind === "error" ? "close" : "check"} size={14} />
        <span>{notice.text}</span>
        <button type="button" className={`playground-icon-button${notice.pinned ? " pinned" : ""}`} aria-pressed={notice.pinned} aria-label={notice.pinned ? "Unpin message" : "Pin message"} title={notice.pinned ? "Unpin message" : "Pin message"} onClick={() => setNotice((current) => current && { ...current, pinned: !current.pinned })}><Icon name="pin" size={13} /></button>
        <button type="button" className="playground-icon-button" aria-label="Close message" title="Close" onClick={() => setNotice(null)}><Icon name="close" size={12} /></button>
      </div>}
      <div className="playground-layout" style={{ gridTemplateColumns: `${entityWidth}px 6px minmax(0,1fr)` }}>
    <div ref={entitiesSlotRef} className="playground-entities-slot">
      <aside ref={entitiesRef} className={`playground-entities${entityWidth < ENTITY_HIDDEN_WIDTH ? " is-collapsed" : ""}`}>
        <div className="playground-tabs" role="tablist">
          <div className={`playground-tab${sidePanel === "saved" ? " active" : ""}`}>
            <button type="button" role="tab" aria-selected={sidePanel === "saved"} onClick={() => selectSidePanel("saved")}><Icon name="pin" size={13} />Saved</button>
          </div>
          <div className={`playground-tab${sidePanel === "entities" ? " active" : ""}`}>
            <button type="button" role="tab" aria-selected={sidePanel === "entities"} onClick={() => selectSidePanel("entities")}>Entities</button>
          </div>
        </div>
        {sidePanel === "entities"
          ? <EntityExplorer entities={metadata} relations={metadataRelations} error={loadError} />
          : <SavedPlaygroundList items={savedPlaygrounds.items} status={savedPlaygrounds.status} error={savedPlaygrounds.error} activeId={savedPlaygroundId} activeName={playgroundName} dirty={isDirty} onOpen={(item) => requestAction({ kind: "open", item })} onRename={setPlaygroundName} />}
      </aside>
    </div>
    <Splitter minimized={entityWidth <= ENTITY_HIDDEN_WIDTH} label="Resize available entities" onDrag={(delta) => setEntityWidth((width) => clamp(width + delta, ENTITY_WIDTH.min, ENTITY_WIDTH.max))} />
    <section className="playground-editor-area">
      <div className="playground-tabs" role="tablist">
        {tabs.map((tab) => <PlaygroundTabButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeTab.id}
          canClose={tabs.length > 1}
          onSelect={() => selectTab(tab.id)}
          onRename={(title) => renameTab(tab.id, title)}
          onClose={() => closeTab(tab.id)}
        />)}
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
      {(message || runState.error) && <p className="playground-message error">{message || runState.error}</p>}
    </section>
      </div>
    </div>
    <Splitter hidden={copilotCollapsed} label="Resize AI assistant" onDrag={(delta) => setCopilotWidth((width) => clamp(width - delta, COPILOT_WIDTH.min, COPILOT_WIDTH.max))} />
    <div ref={copilotSlotRef} className="playground-copilot-slot">
      <CopilotAside collapsed={copilotCollapsed} onToggle={() => setCopilotCollapsed((collapsed) => !collapsed)} />
    </div>
        </div>
  </div>;
}
