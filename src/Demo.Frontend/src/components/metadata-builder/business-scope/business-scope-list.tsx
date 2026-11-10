import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import Icon, { type IconName } from "../../icon/icon";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import BusinessScopeWizard from "./business-scope-wizard";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import DefinitionActions, { type DefinitionActionAdapter } from "../definition-actions/definition-actions";
import MetadataSidebar, { type MetadataSidebarGroup } from "../metadata-sidebar/metadata-sidebar";
import EntityBuilder, { type DatabaseTableOption } from "../entity-definition/entity-builder/entity-builder";
import { emptyEntity, toAbstractDataType, toEditable, type EditableEntity } from "../types";
import type { MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import { fetchDbSchema } from "../../data-sources/database-slice";
import type { RootState } from "../../../store/store";
import { apiUrls } from "../../../const/api-urls";
import { formatApiError } from "../../query-builder/query-design/api-error";
import "./business-scope-workspace.css";

export type BusinessScope = {
  name: string;
  entities: MetadataEntity[];
  canDelete: boolean;
  isBuiltin: boolean;
};
type DatabaseTable = { schema: string; name: string; columns: { name: string; dataType: string }[] };
type DatabaseRelationship = { name: string; sourceSchema: string; sourceTable: string; sourceColumns: string[]; targetSchema: string; targetTable: string; targetColumns: string[]; isUnique: boolean };
type Step = 1 | 2 | 3;
type ViewMode = "list" | "wizard" | "detail";
const CREATE_BUSINESS_SCOPE_PATH = "/metadata/business-scopes/create";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  } catch (reason) {
    throw new Error(`Could not reach the business scope API: ${reason instanceof Error ? reason.message : "network error"}`);
  }
  if (!response.ok) {
    throw new Error(formatApiError(
      await response.text(),
      `Business scope request failed (${response.status}).`,
    ));
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new Error("Business scope API returned invalid JSON.");
  }
}

const tableKey = (table: Pick<DatabaseTable, "schema" | "name">) => `${table.schema}.${table.name}`;
const dataTypeIcons: Record<string, IconName> = {
  string: "type",
  number: "type-number",
  boolean: "type-boolean",
  datetime: "type-datetime",
};
const getAbstractDataType = (dataType: string, columnName?: string) =>
  toAbstractDataType(dataType, columnName).toLowerCase();
const getDataTypeIcon = (dataType: string, columnName?: string): IconName =>
  dataTypeIcons[getAbstractDataType(dataType, columnName)] || "type";

export default function BusinessScopeList({ active }: { active: boolean }) {
  const [scopes, setScopes] = useState<BusinessScope[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { schema, schemaStatus } = useSelector((state: RootState) => state.database);
  const [selectedName, setSelectedName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [fieldNames, setFieldNames] = useState<Record<string, Record<string, string>>>({});
  const [collapsedEntities, setCollapsedEntities] = useState<Record<string, boolean>>({});
  const [relationNames, setRelationNames] = useState<Record<string, { lookup: string; collection: string }>>({});
  const [tableFilter, setTableFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [selectedEntityName, setSelectedEntityName] = useState("");
  const [entityDraft, setEntityDraft] = useState<EditableEntity | null>(null);
  const [entityDirty, setEntityDirty] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [viewMode, setViewMode] = useState<ViewMode>(location.pathname === CREATE_BUSINESS_SCOPE_PATH ? "wizard" : "list");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState("");
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const panel = useResizablePanel("business-scope");
  useEffect(() => setToolbarHost(document.getElementById("metadata-toolbar-actions")), []);
  useEffect(() => {
    if (!active) return;
    setViewMode(location.pathname === CREATE_BUSINESS_SCOPE_PATH ? "wizard" : "list");
  }, [active, location.pathname, location.search]);

  const selected = scopes.find(scope => scope.name === selectedName);
  const dirty = Boolean(selected ? draftName !== selected.name || entityDirty : draftName.trim() && selectedTables.length);
  const load = async () => {
    setStatus("loading");
    setError("");
    try {
      const scopeResult = await request<BusinessScope[]>(apiUrls.metadata.businessScopes);
      setScopes(scopeResult);
      const routeScopeName = new URLSearchParams(location.search).get("scope");
      const requestedScope = routeScopeName || selectedName;
      if (requestedScope) {
        const refreshed = scopeResult.find(scope => scope.name === requestedScope);
        if (refreshed) {
          setSelectedName(refreshed.name);
          setDraftName(refreshed.name);
          const entity = refreshed.entities.find(item => item.name === selectedEntityName) || refreshed.entities[0];
          setSelectedEntityName(entity?.name || "");
          setEntityDraft(entity ? toEditable(entity) : null);
          setEntityDirty(false);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load business scopes and database tables.");
    } finally {
      setStatus("ready");
    }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (schemaStatus === "idle") void dispatch(fetchDbSchema());
  }, [dispatch, schemaStatus]);

  const selectScope = (scope: BusinessScope) => {
    navigate(`/metadata?section=entities&scope=${encodeURIComponent(scope.name)}`);
    setViewMode("detail");
    setSelectedName(scope.name);
    setDraftName(scope.name);
    const firstEntity = scope.entities[0];
    setSelectedEntityName(firstEntity?.name || "");
    setEntityDraft(firstEntity ? toEditable(firstEntity) : null);
    setEntityDirty(false);
    setSelectedTables([]);
    setSelectedColumns({});
    setEntityNames({});
    setFieldNames({});
    setCollapsedEntities({});
    setRelationNames({});
    setTableFilter("");
    setStep(1);
    setError("");
  };
  useEffect(() => {
    if (!active || status === "loading" || location.pathname === CREATE_BUSINESS_SCOPE_PATH) return;
    const routeScopeName = new URLSearchParams(location.search).get("scope");
    if (!routeScopeName) {
      setSelectedName("");
      setEntityDraft(null);
      return;
    }
    const routeScope = scopes.find(scope => scope.name === routeScopeName);
    if (!routeScope || routeScope.name === selectedName) return;
    setSelectedName(routeScope.name);
    setDraftName(routeScope.name);
    const firstEntity = routeScope.entities[0];
    setSelectedEntityName(firstEntity?.name || "");
    setEntityDraft(firstEntity ? toEditable(firstEntity) : null);
    setEntityDirty(false);
  }, [active, location.pathname, location.search, scopes, selectedName, status]);
  const createScope = () => {
    navigate(`${CREATE_BUSINESS_SCOPE_PATH}?section=business-scopes`);
    setViewMode("wizard");
    setSelectedName("");
    setDraftName("");
    setSelectedEntityName("");
    setEntityDraft(null);
    setEntityDirty(false);
    setSelectedTables([]);
    setSelectedColumns({});
    setEntityNames({});
    setFieldNames({});
    setCollapsedEntities({});
    setRelationNames({});
    setTableFilter("");
    setStep(1);
    setError("");
  };
  const updateSelectedScope = (updater: (scope: BusinessScope) => BusinessScope) => {
    setScopes(current => current.map(scope => scope.name === selectedName ? updater(scope) : scope));
  };
  const selectEntity = (entity: MetadataEntity) => {
    setSelectedEntityName(entity.name);
    setEntityDraft(toEditable(entity));
    setEntityDirty(false);
    setError("");
  };
  const addManualEntity = () => {
    const draft = emptyEntity();
    draft.name = "NewEntity";
    setSelectedEntityName(draft.name);
    setEntityDraft(draft);
    setEntityDirty(true);
    setError("");
  };
  const importTables = () => {
    if (!selected) return;
    const existing = new Set(selected.entities.map(entity => entity.name.toLowerCase()));
    const imported = schema.tables
      .filter(table => !existing.has(table.name.toLowerCase()))
      .map(table => toEditable({
        name: table.name,
        schema: table.schema,
        rawSql: table.name,
        fields: table.columns.map(column => ({
          name: column.name,
          dbColumn: column.name,
          dataType: toAbstractDataType(column.dataType, column.name),
          isRawSql: false,
        })),
        relations: [],
        canDelete: true,
      }));
    if (!imported.length) {
      setError("All database tables are already represented in this scope.");
      return;
    }
    const next = imported[0];
    updateSelectedScope(scope => ({ ...scope, entities: [...scope.entities, ...imported] }));
    setSelectedEntityName(next.name);
    setEntityDraft(next);
    setEntityDirty(true);
  };
  const removeEntity = (entityName: string) => {
    if (!selected || selected.isBuiltin) return;
    const remaining = selected.entities.filter(entity => entity.name !== entityName);
    updateSelectedScope(scope => ({ ...scope, entities: remaining }));
    const next = remaining[0];
    setSelectedEntityName(next?.name || "");
    setEntityDraft(next ? toEditable(next) : null);
    setEntityDirty(true);
  };
  const commitEntityDraft = () => {
    if (!selected || !entityDraft) return;
    const normalized = {
      ...entityDraft,
      name: entityDraft.name.trim(),
      fields: entityDraft.fields.map(field => ({ ...field, name: field.name.trim() })),
    };
    if (!normalized.name) {
      setError("An entity name is required.");
      return;
    }
    const duplicate = selected.entities.some(entity =>
      entity.name !== selectedEntityName && entity.name.trim().toLowerCase() === normalized.name.toLowerCase());
    if (duplicate) {
      setError(`An entity named "${normalized.name}" already exists in this scope.`);
      return;
    }
    updateSelectedScope(scope => ({
      ...scope,
      entities: scope.entities.some(entity => entity.name === selectedEntityName)
        ? scope.entities.map(entity => entity.name === selectedEntityName ? normalized : entity)
        : [...scope.entities, normalized],
    }));
    setSelectedEntityName(normalized.name);
    setEntityDraft(normalized);
    setEntityDirty(false);
    setError("");
  };
  const save = async (): Promise<boolean> => {
    if (!draftName.trim()) {
      setError("A business scope name is required.");
      setStep(1);
      return false;
    }
    if (!selected && !selectedTables.length) {
      setError("Select at least one database table before generating metadata.");
      setStep(2);
      return false;
    }
    setStatus("saving");
    setError("");
    try {
      if (selected && entityDraft && entityDirty) commitEntityDraft();
      const saved = selected
        ? await request<BusinessScope>(apiUrls.metadata.businessScopeByName(selected.name), {
            method: "PUT",
              body: JSON.stringify({
                name: draftName.trim(),
                entities: (entityDraft && entityDirty
                  ? selected.entities.map(entity => entity.name === selectedEntityName ? entityDraft : entity)
                  : selected.entities),
              }),
            })
        : await request<BusinessScope>(apiUrls.metadata.generateBusinessScope, {
            method: "POST",
            body: JSON.stringify({
              name: draftName.trim(),
              tables: selectedTables.map(key => {
                const table = schema.tables.find(candidate => tableKey(candidate) === key)!;
                const columns = selectedColumns[key] || table.columns.map(column => column.name);
                return {
                  schema: table.schema,
                  name: table.name,
                  entityName: entityNames[key]?.trim() || table.name,
                  columns,
                  columnMappings: columns.map(column => ({ dbColumn: column, name: fieldNames[key]?.[column]?.trim() || column })),
                };
              }),
              relations: selectedRelations.map(relation => {
                const names = relationNames[relationKey(relation)];
                return {
                  sourceSchema: relation.sourceSchema,
                  sourceTable: relation.sourceTable,
                  targetSchema: relation.targetSchema,
                  targetTable: relation.targetTable,
                  lookupName: names?.lookup || singularize(relation.targetTable),
                  collectionName: names?.collection || pluralize(relation.sourceTable),
                };
              }),
            }),
          });
      setScopes(current => selected
        ? current.map(scope => scope.name === selected.name ? saved : scope)
        : [...current, saved]);
      navigate(`/metadata?section=business-scopes&scope=${encodeURIComponent(saved.name)}`);
      setSelectedName(saved.name);
      setDraftName(saved.name);
      setStep(3);
      setViewMode("detail");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate business scope metadata.");
      return false;
    } finally {
      setStatus("ready");
    }
  };
  const remove = async () => {
    if (!selected) return;
    setStatus("saving");
    try {
      await request<void>(apiUrls.metadata.businessScopeByName(selected.name), { method: "DELETE" });
      const remaining = scopes.filter(scope => scope.name !== selected.name);
      setScopes(remaining);
      const next = remaining[0];
      if (next) selectScope(next);
      else createScope();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete business scope.");
    } finally {
      setStatus("ready");
    }
  };
  const filteredTables = useMemo(() => {
    const query = tableFilter.trim().toLocaleLowerCase();
    if (!query) return schema.tables;
    return schema.tables.filter(table => `${table.schema} ${table.name}`.toLocaleLowerCase().includes(query));
  }, [schema.tables, tableFilter]);
  const tablesBySchema = useMemo(() => {
    const groups = new Map<string, DatabaseTable[]>();
    filteredTables.forEach(table => groups.set(table.schema, [...(groups.get(table.schema) || []), table]));
    return [...groups.entries()];
  }, [filteredTables]);
  const selectedTableDetails = useMemo(
    () => selectedTables
      .map(key => schema.tables.find(table => tableKey(table) === key))
      .filter((table): table is DatabaseTable => Boolean(table)),
    [schema.tables, selectedTables],
  );
  const selectedRelations = useMemo(
    () => schema.relationships.filter(relation => selectedTables.includes(tableKey({ schema: relation.sourceSchema, name: relation.sourceTable }))
      && selectedTables.includes(tableKey({ schema: relation.targetSchema, name: relation.targetTable }))),
    [schema.relationships, selectedTables],
  );
  const relationKey = (relation: DatabaseRelationship) => `${relation.sourceSchema}.${relation.sourceTable}:${relation.targetSchema}.${relation.targetTable}:${relation.name}`;
  const singularize = (value: string) => value.endsWith("ies") ? `${value.slice(0, -3)}y` : value.endsWith("s") && !value.endsWith("ss") ? value.slice(0, -1) : value;
  const pluralize = (value: string) => value.endsWith("y") ? `${value.slice(0, -1)}ies` : value.endsWith("s") ? value : `${value}s`;
  const canContinue = step === 1
    ? Boolean(draftName.trim())
    : step === 2
      ? selectedTables.length > 0
      : selectedTableDetails.every(table => (selectedColumns[tableKey(table)] || table.columns.map(column => column.name)).length > 0);
  const goNext = () => {
    if (step === 1 && !draftName.trim()) {
      setError("Enter a business scope name to continue.");
      return;
    }
    if (step === 2 && !selectedTables.length) {
      setError("Select at least one database table to continue.");
      return;
    }
    if (step === 3 && !canContinue) {
      setError("Select at least one database column for every entity.");
      return;
    }
    setError("");
    setStep(Math.min(3, step + 1) as Step);
  };
  const goBack = () => {
    setError("");
    setStep(Math.max(1, step - 1) as Step);
  };
  const adapter: DefinitionActionAdapter = useMemo(() => ({
    resourceName: "business scope",
    selectedName,
    hasSelection: Boolean(selected),
    isBuiltIn: selected?.isBuiltin ?? false,
    hasDraft: Boolean(draftName),
    dirty,
    saving: status === "saving",
    onSave: save,
    onDelete: remove,
    onNew: createScope,
  }), [dirty, draftName, selected, selectedName, status, selectedTables, entityDirty]);

  return (
    <section className={`business-scope-workspace${viewMode === "list" ? " business-scope-list-view" : viewMode === "wizard" ? " business-scope-create-view" : ""}`} style={viewMode === "list" ? undefined : panel.style}>
      {viewMode === "list" ? <div className="business-scope-catalog">
        <div className="business-scope-catalog-header">
          <div>
            <span className="section-kicker">METADATA CATALOG</span>
            <h2>Business scopes</h2>
            <p>Choose a business scope to open its entity definitions.</p>
          </div>
          <button type="button" className="business-scope-add" onClick={createScope}><Icon name="plus" size={14} /> Create scope</button>
        </div>
        <label className="business-scope-catalog-filter">
          <Icon name="search" size={14} />
          <input value={scopeFilter} onChange={event => setScopeFilter(event.target.value)} placeholder="Filter business scopes" />
        </label>
        {status === "loading" && <p className="empty-state">Loading business scopes…</p>}
        {status !== "loading" && !scopes.filter(scope => scope.name.toLowerCase().includes(scopeFilter.toLowerCase())).length && <p className="empty-state">No business scopes match this filter.</p>}
        <div className="business-scope-catalog-grid">
          {scopes.filter(scope => scope.name.toLowerCase().includes(scopeFilter.toLowerCase())).map(scope => (
            <button key={scope.name} type="button" className="business-scope-summary-card" onClick={() => selectScope(scope)}>
              <span className="business-scope-summary-icon"><Icon name="folder" size={17} /></span>
              <span className="business-scope-summary-content">
                <strong>{scope.name}</strong>
                <small>{scope.isBuiltin ? "Built-in scope" : "Custom scope"}</small>
              </span>
              <span className="business-scope-summary-stats">
                <b>{scope.entities.length}</b>
                <small>entities</small>
              </span>
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
      </div> : <>
      {viewMode === "detail" && <>
        <PanelSplitter panel={panel} label="business scopes panel" />
        <MetadataSidebar
          className="metadata-list business-scope-route-list"
          title="BUSINESS SCOPES"
          totalCount={scopes.length}
          filter={scopeFilter}
          searchPlaceholder="Find a saved scope"
          onFilterChange={setScopeFilter}
          groups={[{
            id: "route-business-scopes",
            title: "Saved",
            count: scopes.filter(scope => scope.name.toLowerCase().includes(scopeFilter.toLowerCase())).length,
            content: scopes
              .filter(scope => scope.name.toLowerCase().includes(scopeFilter.toLowerCase()))
              .map(scope => (
                <button key={scope.name} type="button" className={`metadata-entity${scope.name === selectedName ? " active" : ""}`} onClick={() => selectScope(scope)}>
                  <span className="entity-icon"><Icon name="folder" size={14} /></span>
                  <span><b>{scope.name}</b><small>{scope.entities.length} entities{scope.isBuiltin ? " · Built-in" : ""}</small></span>
                  <Icon name="chevron" size={14} />
                </button>
              )),
            emptyMessage: status !== "loading" && !scopes.length ? "No saved business scopes." : undefined,
          } satisfies MetadataSidebarGroup]}
        />
      </>}
      <div className="business-scope-editor">
        <div className="business-scope-editor-heading">
          <div><span className="section-kicker">BUSINESS LOGIC</span><h2>{selected ? selected.name : "New business scope"}</h2></div>
          {selected && <label className="business-scope-scope-picker">
            <span>Scope</span>
            <select value={selected.name} onChange={event => {
              const next = scopes.find(scope => scope.name === event.target.value);
              if (next) selectScope(next);
            }}>
              {scopes.map(scope => <option key={scope.name} value={scope.name}>{scope.name}</option>)}
            </select>
          </label>}
          <span className="business-scope-count">{selected?.entities.length ?? 0} entities</span>
        </div>
        {error && selected && <p className="business-scope-error" role="alert">{error}</p>}
        {!selected ? (
          <BusinessScopeWizard
            step={step}
            canContinue={canContinue}
            saving={status === "saving"}
            error={error}
            onStepChange={setStep}
            onBack={goBack}
            onNext={goNext}
            onGenerate={() => void save()}
          >
            {step === 1 && <label className="business-scope-name"><span>Scope name</span><input autoFocus spellCheck={false} value={draftName} onChange={event => setDraftName(event.target.value)} placeholder="e.g. Sales" /><small>Use a name that describes the business area this workspace serves.</small></label>}
            {step === 2 && <div className="business-scope-table-picker">
              <div className="business-scope-step-title"><strong>Select database tables</strong><span>{selectedTables.length} selected</span></div>
              <span>Tables are read from the active database connection.</span>
              <label className="business-scope-table-filter">
                <Icon name="search" size={14} />
                <input spellCheck={false} value={tableFilter} onChange={event => setTableFilter(event.target.value)} placeholder="Filter tables by name or schema" aria-label="Filter database tables" />
                {tableFilter && <button type="button" onClick={() => setTableFilter("")} aria-label="Clear table filter">Clear</button>}
              </label>
              <div className="business-scope-table-picker-layout">
                <div className="business-scope-available-tables">
                  <div className="business-scope-table-list-heading"><strong>Available tables</strong></div>
                  {tablesBySchema.map(([schemaName, tables]) => <section key={schemaName} className="business-scope-schema-group">
                    <div className="business-scope-schema-heading"><span>{schemaName}</span><small>{tables.length} {tables.length === 1 ? "table" : "tables"}</small></div>
                    <div className="business-scope-schema-tables">{tables.map(table => {
                      const key = tableKey(table);
                      return <label key={key}><input type="checkbox" checked={selectedTables.includes(key)} onChange={() => setSelectedTables(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} /><span>{table.name}</span></label>;
                    })}</div>
                  </section>)}
                  {schema.tables.length > 0 && !filteredTables.length && <p className="empty-state">No tables match this filter.</p>}
                </div>
                <aside className="business-scope-selected-tables" aria-label="Selected database tables">
                  <div className="business-scope-table-list-heading"><strong>Selected tables</strong><span><small>{selectedTableDetails.length}</small><button type="button" className="business-scope-clear-selection" onClick={() => setSelectedTables([])} disabled={!selectedTableDetails.length}>Clear all</button></span></div>
                  {selectedTableDetails.length > 0 ? <div className="business-scope-selected-table-list">{selectedTableDetails.map(table => <button key={tableKey(table)} type="button" onClick={() => setSelectedTables(current => current.filter(key => key !== tableKey(table)))} title={`Remove ${table.name}`}>
                    <span><strong>{table.name}</strong><small>{table.schema}</small></span><b aria-hidden="true">×</b>
                  </button>)}</div> : <p className="business-scope-selected-empty">Choose tables from the list to add them to this scope.</p>}
                </aside>
              </div>
              {!schema.tables.length && <p className="empty-state">No database tables are available.</p>}
            </div>}
            {step === 3 && <div className="business-scope-generation">
              <strong>Review and generate metadata</strong>
              <p>{selectedTables.length} entities selected. Choose the fields and relation names to generate.</p>
              <div className="business-scope-step-section">
                <h4>Entities</h4>
                <div className="business-scope-entity-preview">{selectedTableDetails.map(table => {
                const key = tableKey(table);
                const columns = selectedColumns[key] || table.columns.map(column => column.name);
                const collapsed = collapsedEntities[key] ?? false;
                const orderedColumns = [...table.columns].sort((left, right) => Number(columns.includes(right.name)) - Number(columns.includes(left.name)));
                return <div key={key} className="business-scope-entity-item"><button type="button" className="business-scope-collapse" onClick={() => setCollapsedEntities(current => ({ ...current, [key]: !collapsed }))} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${table.name} entity`}><Icon name={collapsed ? "chevron-right" : "chevron-down"} size={15} /></button><section className="business-scope-preview-card">
                  <div className="business-scope-preview-heading"><div className="business-scope-entity-heading-names"><input className="business-scope-entity-name" spellCheck={false} value={entityNames[key] ?? table.name} onChange={event => setEntityNames(current => ({ ...current, [key]: event.target.value }))} aria-label={`Entity name for ${table.name}`} /><small>{table.schema}.{table.name}</small></div><button type="button" className="business-scope-remove" onClick={() => setSelectedTables(current => current.filter(item => item !== key))} aria-label={`Remove ${table.name} table`} title="Remove table"><Icon name="trash" size={15} /></button></div>
                  {!collapsed && <div className="business-scope-column-grid">{orderedColumns.map(column => <label key={column.name}><input type="checkbox" checked={columns.includes(column.name)} onChange={() => setSelectedColumns(current => ({ ...current, [key]: columns.includes(column.name) ? columns.filter(name => name !== column.name) : [...columns, column.name] }))} /><input className="business-scope-field-name" spellCheck={false} value={fieldNames[key]?.[column.name] ?? column.name} disabled={!columns.includes(column.name)} onChange={event => setFieldNames(current => ({ ...current, [key]: { ...current[key], [column.name]: event.target.value } }))} aria-label={`Field name for ${column.name}`} /><small className="business-scope-data-type" title={column.dataType} aria-label={`Data type: ${column.dataType}`}><Icon name={getDataTypeIcon(column.dataType, column.name)} size={14} /></small></label>)}</div>}
                </section></div>;
                })}</div>
              </div>
              {selectedRelations.length > 0 && <div className="business-scope-step-section"><h4>Relations</h4><div className="business-scope-relation-preview"><div className="business-scope-relation-header"><strong>Relation</strong><strong>Lookup name</strong><strong>Collection name</strong></div>{selectedRelations.map(relation => {
                const key = relationKey(relation);
                const names = relationNames[key] || { lookup: singularize(relation.targetTable), collection: pluralize(relation.sourceTable) };
                return <div key={key} className="business-scope-relation-row"><span>{relation.sourceTable} → {relation.targetTable}</span><input spellCheck={false} value={names.lookup} aria-label={`Lookup relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, lookup: event.target.value } }))} /><input spellCheck={false} value={names.collection} aria-label={`Collection relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, collection: event.target.value } }))} /></div>;
              })}</div></div>}
            </div>}
          </BusinessScopeWizard>
        ) : <div className="business-scope-detail-layout">
          <aside className="business-scope-entity-panel">
            <label className="business-scope-name">Scope name<input spellCheck={false} value={draftName} disabled={selected.isBuiltin} onChange={event => setDraftName(event.target.value)} /></label>
            <div className="business-scope-entity-toolbar">
              <strong>Entities <span>{selected.entities.length}</span></strong>
              <button type="button" onClick={importTables} disabled={selected.isBuiltin || !schema.tables.length} title="Import database tables"><Icon name="database" size={14} /></button>
              <button type="button" onClick={addManualEntity} disabled={selected.isBuiltin} title="Create entity manually"><Icon name="plus" size={14} /></button>
            </div>
            <label className="business-scope-entity-filter"><Icon name="search" size={13} /><input value={entityFilter} onChange={event => setEntityFilter(event.target.value)} placeholder="Filter entities" /></label>
            <div className="business-scope-entity-list">
              {selected.entities.filter(entity => entity.name.toLowerCase().includes(entityFilter.toLowerCase())).map(entity => (
                <button key={entity.name} type="button" className={entity.name === selectedEntityName ? "active" : ""} onClick={() => selectEntity(entity)}>
                  <Icon name="table" size={14} /><span><b>{entity.name}</b><small>{entity.fields.length} fields · {(entity.relations || []).length} relations</small></span><Icon name="chevron" size={13} />
                </button>
              ))}
              {!selected.entities.length && <p className="empty-state">No entities yet. Import tables or create one manually.</p>}
            </div>
          </aside>
          <div className="business-scope-entity-editor">
            <div className="business-scope-editor-heading">
              <div><span className="section-kicker">ENTITY DEFINITION</span><h3>{entityDraft?.name || "No entity selected"}</h3></div>
              {entityDraft && !selected.isBuiltin && <button type="button" className="business-scope-remove" onClick={() => removeEntity(selectedEntityName)}><Icon name="trash" size={14} /> Remove entity</button>}
            </div>
            <EntityBuilder
              draft={entityDraft}
              canEdit={!selected.isBuiltin}
              message=""
              allEntities={selected.entities}
              onDraftChange={updater => {
                setEntityDraft(current => current ? updater(current) : current);
                setEntityDirty(true);
              }}
              databaseTables={schema.tables as DatabaseTableOption[]}
              selectedTable={entityDraft ? (schema.tables.find(table => table.name === entityDraft.rawSql && table.schema === entityDraft.schema) as DatabaseTableOption | undefined) : undefined}
              onSelectTable={table => {
                setEntityDraft(current => current ? { ...current, schema: table.schema, rawSql: table.name } : current);
                setEntityDirty(true);
              }}
              onSelectRawSql={() => setEntityDirty(true)}
              compact
            />
            {entityDraft && !selected.isBuiltin && <div className="business-scope-entity-save"><span>{entityDirty ? "Unsaved entity changes" : "Entity changes saved locally"}</span><button type="button" className="business-scope-add" onClick={commitEntityDraft} disabled={!entityDirty}>Apply entity changes</button></div>}
          </div>
        </div>}
      </div>
      </>}
      {active && toolbarHost && createPortal(<DefinitionActions adapter={adapter} />, toolbarHost)}
    </section>
  );
}
