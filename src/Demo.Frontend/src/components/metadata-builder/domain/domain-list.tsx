import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import Icon, { type IconName } from "../../icon/icon";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import DomainWizard, { type WizardSource } from "./domain-wizard";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import DefinitionActions, { type DefinitionActionAdapter } from "../definition-actions/definition-actions";
import MetadataSidebar, { type MetadataSidebarGroup } from "../metadata-sidebar/metadata-sidebar";
import EntityBuilder, { type DatabaseTableOption } from "../entity-definition/entity-builder/entity-builder";
import DatabaseConnection from "../../data-sources/database-connection/database-connection";
import { emptyEntity, toAbstractDataType, toEditable, type EditableEntity } from "../types";
import type { MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import { fetchDbSchema } from "../../data-sources/database-slice";
import type { RootState } from "../../../store/store";
import { apiUrls } from "../../../const/api-urls";
import { formatApiError } from "../../query-builder/query-design/api-error";
import { useMessageBox } from "../../message-box/message-box";
import "./domain-list.css";

export type Domain = {
  name: string;
  description: string;
  entities: MetadataEntity[];
  canDelete: boolean;
  isBuiltin: boolean;
};
type DatabaseTable = { schema: string; name: string; columns: { name: string; dataType: string }[] };
type DatabaseRelationship = { name: string; sourceSchema: string; sourceTable: string; sourceColumns: string[]; targetSchema: string; targetTable: string; targetColumns: string[]; isUnique: boolean };
type Step = 1 | 2 | 3 | 4;
type ViewMode = "list" | "wizard" | "detail";
const CREATE_DOMAIN_PATH = "/metadata/domains/create";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  } catch (reason) {
    throw new Error(`Could not reach the domain API: ${reason instanceof Error ? reason.message : "network error"}`);
  }
  if (!response.ok) {
    throw new Error(formatApiError(
      await response.text(),
      `Domain request failed (${response.status}).`,
    ));
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new Error("Domain API returned invalid JSON.");
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

function parseUploadedTables(text: string, fileName: string): DatabaseTable[] {
  if (fileName.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text) as { entities?: Array<{ name?: string; schema?: string; dbSchema?: string; dbTable?: string; fields?: Array<{ name?: string; dataType?: string }> }> };
    return (parsed.entities || []).map(entity => ({
      schema: entity.schema || entity.dbSchema || "dbo",
      name: entity.name || entity.dbTable || "Entity",
      columns: (entity.fields || []).filter(field => field.name).map(field => ({ name: field.name!, dataType: field.dataType || "String" })),
    }));
  }
  const tables: DatabaseTable[] = [];
  let current: DatabaseTable | undefined;
  let readingFields = false;
  for (const line of text.split(/\r?\n/)) {
    const entity = line.match(/^\s*-\s+name:\s*(.+)\s*$/);
    if (entity && !readingFields) {
      current = { schema: "dbo", name: entity[1].trim(), columns: [] };
      tables.push(current);
      continue;
    }
    if (!current) continue;
    const schema = line.match(/^\s+(?:dbSchema|schema):\s*(.+)\s*$/);
    const table = line.match(/^\s+dbTable:\s*(.+)\s*$/);
    const fields = line.match(/^\s+fields:\s*$/);
    const field = line.match(/^\s+-\s+name:\s*(.+)\s*$/);
    if (schema) current.schema = schema[1].trim();
    else if (table) current.name = table[1].trim();
    else if (fields) readingFields = true;
    else if (field && readingFields) current.columns.push({ name: field[1].trim(), dataType: "String" });
  }
  return tables.filter(table => table.columns.length > 0);
}

export default function DomainList({
  active,
  onToolbarActionsChange,
}: {
  active: boolean;
  onToolbarActionsChange: (actions: ReactNode | null) => void;
}) {
  const [scopes, setScopes] = useState<Domain[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { schema, schemaStatus, connectionStatus } = useSelector((state: RootState) => state.database);
  const [selectedName, setSelectedName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [uploadedTables, setUploadedTables] = useState<DatabaseTable[]>([]);
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
  const [wizardSource, setWizardSource] = useState<WizardSource>("database");
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(location.pathname === CREATE_DOMAIN_PATH ? "wizard" : "list");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState("");
  const panel = useResizablePanel("domain");
  const showMessageBox = useMessageBox();
  useEffect(() => {
    if (!active) return;
    setViewMode(location.pathname === CREATE_DOMAIN_PATH ? "wizard" : "list");
    if (location.pathname === CREATE_DOMAIN_PATH) {
      const source = new URLSearchParams(location.search).get("source");
      setWizardSource(source === "file" ? "file" : "database");
      setStep(1);
    }
  }, [active, location.pathname, location.search]);

  const selected = scopes.find(scope => scope.name === selectedName);
  const dirty = Boolean(selected
    ? draftName !== selected.name || draftDescription !== selected.description || entityDirty
    : draftName.trim() && selectedTables.length);
  const load = async () => {
    setStatus("loading");
    setError("");
    try {
      const scopeResult = await request<Domain[]>(apiUrls.metadata.domains);
      setScopes(scopeResult);
      const routeScopeName = new URLSearchParams(location.search).get("scope");
      const requestedScope = routeScopeName || selectedName;
      if (requestedScope) {
        const refreshed = scopeResult.find(scope => scope.name === requestedScope);
        if (refreshed) {
          setSelectedName(refreshed.name);
          setDraftName(refreshed.name);
          setDraftDescription(refreshed.description || "");
          const entity = refreshed.entities.find(item => item.name === selectedEntityName) || refreshed.entities[0];
          setSelectedEntityName(entity?.name || "");
          setEntityDraft(entity ? toEditable(entity) : null);
          setEntityDirty(false);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load domains and database tables.");
    } finally {
      setStatus("ready");
    }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (schemaStatus === "idle") void dispatch(fetchDbSchema());
  }, [dispatch, schemaStatus]);

  const selectScope = (scope: Domain) => {
    navigate(`/metadata?section=diagram&scope=${encodeURIComponent(scope.name)}`);
    setSelectedName(scope.name);
    setDraftName(scope.name);
    setDraftDescription(scope.description || "");
    const firstEntity = scope.entities[0];
    setSelectedEntityName(firstEntity?.name || "");
    setEntityDraft(firstEntity ? toEditable(firstEntity) : null);
    setEntityDirty(false);
    setSelectedTables([]);
    setUploadedTables([]);
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
    if (!active || status === "loading" || location.pathname === CREATE_DOMAIN_PATH) return;
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
    setDraftDescription(routeScope.description || "");
    const firstEntity = routeScope.entities[0];
    setSelectedEntityName(firstEntity?.name || "");
    setEntityDraft(firstEntity ? toEditable(firstEntity) : null);
    setEntityDirty(false);
  }, [active, location.pathname, location.search, scopes, selectedName, status]);
  const createScope = (source: WizardSource = "database") => {
    navigate(`${CREATE_DOMAIN_PATH}?section=domains&source=${source}`);
    setViewMode("wizard");
    setWizardSource(source);
    setSelectedName("");
    setDraftName("");
    setDraftDescription("");
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
    if (source === "database") setConnectionDialogOpen(true);
  };
  const updateSelectedScope = (updater: (scope: Domain) => Domain) => {
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
    setEntityDirty(true);
    setError("");
  };
  const save = async (): Promise<boolean> => {
    if (!draftName.trim()) {
      setError("A domain name is required.");
      setStep(nameStep);
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
        ? await request<Domain>(apiUrls.metadata.domainByName(selected.name), {
            method: "PUT",
              body: JSON.stringify({
                name: draftName.trim(),
                description: draftDescription.trim(),
                entities: (entityDraft && entityDirty
                  ? selected.entities.map(entity => entity.name === selectedEntityName ? entityDraft : entity)
                  : selected.entities),
              }),
            })
        : wizardSource === "file"
          ? await request<Domain>(apiUrls.metadata.domains, {
            method: "POST",
            body: JSON.stringify({
              name: draftName.trim(),
              description: draftDescription.trim(),
              entities: selectedTableDetails.map(table => {
                const key = tableKey(table);
                const columns = selectedColumns[key] || table.columns.map(column => column.name);
                return {
                  name: entityNames[key]?.trim() || table.name,
                  schema: table.schema,
                  rawSql: table.name,
                  fields: columns.map(column => ({
                    name: fieldNames[key]?.[column]?.trim() || column,
                    dbColumn: column,
                    dataType: toAbstractDataType(table.columns.find(item => item.name === column)?.dataType, column),
                    isRawSql: false,
                  })),
                  relations: [],
                  canDelete: true,
                };
              }),
            }),
          })
          : await request<Domain>(apiUrls.metadata.generateDomain, {
            method: "POST",
            body: JSON.stringify({
              name: draftName.trim(),
              description: draftDescription.trim(),
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
      setEntityDirty(false);
      navigate(`/metadata?section=domains&scope=${encodeURIComponent(saved.name)}`);
      setSelectedName(saved.name);
      setDraftName(saved.name);
      setStep(4);
      setViewMode("detail");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate domain metadata.");
      return false;
    } finally {
      setStatus("ready");
    }
  };
  const remove = async () => {
    if (!selected) return;
    setStatus("saving");
    try {
      await request<void>(apiUrls.metadata.domainByName(selected.name), { method: "DELETE" });
      const remaining = scopes.filter(scope => scope.name !== selected.name);
      setScopes(remaining);
      const next = remaining[0];
      if (next) selectScope(next);
      else createScope();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete domain.");
    } finally {
      setStatus("ready");
    }
  };
  const deleteDomain = async (scope: Domain) => {
    if (scope.isBuiltin) return;
    const action = await showMessageBox({
      eyebrow: "DELETE DOMAIN",
      title: `Delete ${scope.name}?`,
      message: `This will permanently delete the ${scope.name} domain and all of its entity definitions.`,
      confirmationText: scope.name,
      confirmationLabel: `Enter ${scope.name} to confirm`,
      actions: [
        { value: "cancel", label: "Cancel", variant: "secondary" },
        { value: "delete", label: "Delete domain", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    setStatus("saving");
    setError("");
    try {
      await request<void>(apiUrls.metadata.domainByName(scope.name), { method: "DELETE" });
      setScopes(current => current.filter(item => item.name !== scope.name));
      if (selectedName === scope.name) {
        setSelectedName("");
        setDraftName("");
        setSelectedEntityName("");
        setEntityDraft(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to delete domain "${scope.name}".`);
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
      .map(key => (wizardSource === "file" ? uploadedTables : schema.tables).find(table => tableKey(table) === key))
      .filter((table): table is DatabaseTable => Boolean(table)),
    [schema.tables, selectedTables, uploadedTables, wizardSource],
  );
  const selectedRelations = useMemo(
    () => schema.relationships.filter(relation => selectedTables.includes(tableKey({ schema: relation.sourceSchema, name: relation.sourceTable }))
      && selectedTables.includes(tableKey({ schema: relation.targetSchema, name: relation.targetTable }))),
    [schema.relationships, selectedTables],
  );
  const relationKey = (relation: DatabaseRelationship) => `${relation.sourceSchema}.${relation.sourceTable}:${relation.targetSchema}.${relation.targetTable}:${relation.name}`;
  const singularize = (value: string) => value.endsWith("ies") ? `${value.slice(0, -3)}y` : value.endsWith("s") && !value.endsWith("ss") ? value.slice(0, -1) : value;
  const pluralize = (value: string) => value.endsWith("y") ? `${value.slice(0, -1)}ies` : value.endsWith("s") ? value : `${value}s`;
  const uploadFile = async (file: File) => {
    try {
      const tables = parseUploadedTables(await file.text(), file.name);
      if (!tables.length) throw new Error("The uploaded file does not contain any entities with fields.");
      setUploadedTables(tables);
      setSelectedTables(tables.map(tableKey));
      setSelectedColumns(Object.fromEntries(tables.map(table => [tableKey(table), table.columns.map(column => column.name)])));
      setEntityNames(Object.fromEntries(tables.map(table => [tableKey(table), table.name])));
      setFieldNames({});
      setTableFilter("");
      setError("");
      setStep(2);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read the uploaded domain file.");
    }
  };
  const tableStep = wizardSource === "database" ? 2 : 1;
  const entityStep = wizardSource === "database" ? 3 : 2;
  const nameStep = wizardSource === "database" ? 4 : 3;
  const canContinue = step === 1
    ? wizardSource === "database" ? connectionStatus === "succeeded" : selectedTables.length > 0
    : step === tableStep
      ? selectedTables.length > 0
      : step === entityStep
        ? selectedTableDetails.every(table => (selectedColumns[tableKey(table)] || table.columns.map(column => column.name)).length > 0)
        : Boolean(draftName.trim());
  const goNext = () => {
    if (wizardSource === "database" && step === 1 && connectionStatus !== "succeeded") {
      setError("Connect to a database to continue.");
      return;
    }
    if (step === tableStep && !selectedTables.length) {
      setError("Select at least one database table to continue.");
      return;
    }
    if (step === entityStep && !canContinue) {
      setError("Select at least one database column for every entity.");
      return;
    }
    if (step === nameStep && !draftName.trim()) {
      setError("Enter a domain name to continue.");
      return;
    }
    setError("");
    setStep(Math.min(nameStep, step + 1) as Step);
  };
  const goBack = () => {
    setError("");
    setStep(Math.max(1, step - 1) as Step);
  };
  const adapter: DefinitionActionAdapter = useMemo(() => ({
    resourceName: "domain",
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
  useEffect(() => {
    if (!active) {
      onToolbarActionsChange(null);
      return;
    }

    onToolbarActionsChange(
      <>
        {viewMode !== "wizard" && <div className="editor-actions" role="toolbar" aria-label="Domain creation actions">
          <button
            className="icon-button definition-action-button create"
            type="button"
            title="Upload domain from JSON or YAML"
            aria-label="Upload domain from JSON or YAML"
            onClick={() => createScope("file")}
          >
            <Icon name="upload" size={17} />
          </button>
        </div>}
        <DefinitionActions adapter={viewMode === "wizard"
          ? { ...adapter, isBuiltIn: false, onNew: undefined }
          : adapter} />
      </>,
    );
  }, [active, adapter, onToolbarActionsChange, viewMode]);

  return (
    <section className={`domain-workspace${viewMode === "list" ? " domain-list-view" : viewMode === "wizard" ? " domain-create-view" : ""}`} style={viewMode === "list" ? undefined : panel.style}>
      {viewMode === "list" ? <div className="domain-catalog">
        <div className="domain-catalog-header">
          <div>
            <span className="section-kicker">METADATA CATALOG</span>
            <h2>Domains</h2>
            <p>Choose a domain to open its diagram.</p>
          </div>
        </div>
        <label className="domain-catalog-filter">
          <Icon name="search" size={14} />
          <input spellCheck={false} value={scopeFilter} onChange={event => setScopeFilter(event.target.value)} placeholder="Filter domains" />
        </label>
        {status === "loading" && <p className="empty-state">Loading domains…</p>}
        {status !== "loading" && !scopes.filter(scope => scope.name.toLowerCase().includes(scopeFilter.toLowerCase())).length && <p className="empty-state">No domains match this filter.</p>}
        <div className="domain-catalog-grid">
          {scopes.filter(scope => scope.name.toLowerCase().includes(scopeFilter.toLowerCase())).map(scope => (
            <div key={scope.name} className="domain-summary-card">
              <button type="button" className="domain-summary-open" onClick={() => selectScope(scope)}>
              <span className="domain-summary-icon"><Icon name="folder" size={17} /></span>
              <span className="domain-summary-content">
                <strong>{scope.name}</strong>
                {scope.description && <small className="domain-summary-description">{scope.description}</small>}
                <small>                {scope.isBuiltin ? "Built-in domain" : "Custom domain"}</small>
              </span>
              <span className="domain-summary-stats">
                <b>{scope.entities.length}</b>
                <small>entities</small>
              </span>
              <Icon name="chevron" size={14} />
              </button>
              {!scope.isBuiltin && <button type="button" className="domain-summary-delete" title={`Delete ${scope.name} domain`} aria-label={`Delete ${scope.name} domain`} onClick={() => void deleteDomain(scope)}>
                <Icon name="trash" size={15} />
              </button>}
            </div>
          ))}
        </div>
      </div> : <>
      {viewMode === "detail" && <>
        <PanelSplitter panel={panel} label="domains panel" />
        <MetadataSidebar
          className="metadata-list domain-route-list"
          title="DOMAINS"
          totalCount={scopes.length}
          filter={scopeFilter}
          searchPlaceholder="Find a saved domain"
          onFilterChange={setScopeFilter}
          groups={[{
            id: "route-domains",
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
            emptyMessage: status !== "loading" && !scopes.length ? "No saved domains." : undefined,
          } satisfies MetadataSidebarGroup]}
        />
      </>}
      <div className="domain-editor">
        <div className="domain-editor-heading">
          <div><span className="section-kicker">BUSINESS LOGIC</span><h2>{selected ? selected.name : "New domain"}</h2></div>
          {selected && <label className="domain-scope-picker">
            <span>Domain</span>
            <select value={selected.name} onChange={event => {
              const next = scopes.find(scope => scope.name === event.target.value);
              if (next) selectScope(next);
            }}>
              {scopes.map(scope => <option key={scope.name} value={scope.name}>{scope.name}</option>)}
            </select>
          </label>}
          <span className="domain-count">{selected?.entities.length ?? 0} entities</span>
        </div>
        {error && selected && <p className="domain-error" role="alert">{error}</p>}
        {!selected ? (
          <DomainWizard
            source={wizardSource}
            step={step}
            canContinue={canContinue}
            saving={status === "saving"}
            error={error}
            onStepChange={setStep}
            onBack={goBack}
            onNext={goNext}
            onGenerate={() => void save()}
          >
            {wizardSource === "file" && step === 1 && <div className="domain-upload-step">
              <strong>Upload domain metadata</strong>
              <p>Choose a JSON or YAML file containing entities and their fields.</p>
              <label className="domain-upload-dropzone">
                <Icon name="upload" size={20} />
                <span>Choose JSON or YAML file</span>
                <small>Supported formats: .json, .yaml, .yml</small>
                <input type="file" accept=".json,.yaml,.yml,application/json,text/yaml" onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void uploadFile(file);
                }} />
              </label>
            </div>}
            {wizardSource === "database" && step === 1 && <div className="domain-connection-prompt">
              <strong>Connect to a database</strong>
              <p>Use the connection dialog to choose the database that provides your domain tables.</p>
              <button type="button" className="domain-primary" onClick={() => setConnectionDialogOpen(true)}>Open connection</button>
            </div>}
            {wizardSource === "database" && step === tableStep && <div className="domain-table-picker">
              <div className="domain-step-title"><strong>Select database tables</strong><span>{selectedTables.length} selected</span></div>
              <span>Tables are read from the active database connection.</span>
              <label className="domain-table-filter">
                <Icon name="search" size={14} />
                <input spellCheck={false} value={tableFilter} onChange={event => setTableFilter(event.target.value)} placeholder="Filter tables by name or schema" aria-label="Filter database tables" />
                {tableFilter && <button type="button" onClick={() => setTableFilter("")} aria-label="Clear table filter">Clear</button>}
              </label>
              <div className="domain-table-picker-layout">
                <div className="domain-available-tables">
                  <div className="domain-table-list-heading"><strong>Available tables</strong></div>
                  {tablesBySchema.map(([schemaName, tables]) => <section key={schemaName} className="domain-schema-group">
                    <div className="domain-schema-heading"><span>{schemaName}</span><small>{tables.length} {tables.length === 1 ? "table" : "tables"}</small></div>
                    <div className="domain-schema-tables">{tables.map(table => {
                      const key = tableKey(table);
                      return <label key={key}><input type="checkbox" checked={selectedTables.includes(key)} onChange={() => setSelectedTables(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} /><span>{table.name}</span></label>;
                    })}</div>
                  </section>)}
                  {schema.tables.length > 0 && !filteredTables.length && <p className="empty-state">No tables match this filter.</p>}
                </div>
                <aside className="domain-selected-tables" aria-label="Selected database tables">
                  <div className="domain-table-list-heading"><strong>Selected tables</strong><span><small>{selectedTableDetails.length}</small><button type="button" className="domain-clear-selection" onClick={() => setSelectedTables([])} disabled={!selectedTableDetails.length}>Clear all</button></span></div>
                  {selectedTableDetails.length > 0 ? <div className="domain-selected-table-list">{selectedTableDetails.map(table => <button key={tableKey(table)} type="button" onClick={() => setSelectedTables(current => current.filter(key => key !== tableKey(table)))} title={`Remove ${table.name}`}>
                    <span><strong>{table.name}</strong><small>{table.schema}</small></span><b aria-hidden="true">×</b>
                  </button>)}</div> : <p className="domain-selected-empty">Choose tables from the list to add them to this domain.</p>}
                </aside>
              </div>
              {!schema.tables.length && <p className="empty-state">No database tables are available.</p>}
            </div>}
            {step === nameStep && <div className="domain-final-details">
              <label className="domain-name"><span>Domain name</span><input autoFocus spellCheck={false} value={draftName} onChange={event => setDraftName(event.target.value)} placeholder="e.g. Sales" /><small>Use a name that describes the business area this workspace serves.</small></label>
              <label className="domain-description"><span>Description <small>(optional)</small></span><textarea spellCheck={false} value={draftDescription} onChange={event => setDraftDescription(event.target.value)} placeholder="Describe the business area this domain represents." rows={4} /></label>
            </div>}
            {step === entityStep && <div className="domain-generation">
              <strong>Review and generate metadata</strong>
              <p>{selectedTables.length} entities selected. Choose the fields and relation names to generate.</p>
              <div className="domain-step-section">
                <h4>Entities</h4>
                <div className="domain-entity-preview">{selectedTableDetails.map(table => {
                const key = tableKey(table);
                const columns = selectedColumns[key] || table.columns.map(column => column.name);
                const collapsed = collapsedEntities[key] ?? false;
                const orderedColumns = [...table.columns].sort((left, right) => Number(columns.includes(right.name)) - Number(columns.includes(left.name)));
                return <div key={key} className="domain-entity-item"><button type="button" className="domain-collapse" onClick={() => setCollapsedEntities(current => ({ ...current, [key]: !collapsed }))} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${table.name} entity`}><Icon name={collapsed ? "chevron-right" : "chevron-down"} size={15} /></button><section className="domain-preview-card">
                  <div className="domain-preview-heading"><div className="domain-entity-heading-names"><input className="domain-entity-name" spellCheck={false} value={entityNames[key] ?? table.name} onChange={event => setEntityNames(current => ({ ...current, [key]: event.target.value }))} aria-label={`Entity name for ${table.name}`} /><small>{table.schema}.{table.name}</small></div><button type="button" className="domain-remove" onClick={() => setSelectedTables(current => current.filter(item => item !== key))} aria-label={`Remove ${table.name} table`} title="Remove table"><Icon name="trash" size={15} /></button></div>
                  {!collapsed && <div className="domain-column-grid">{orderedColumns.map(column => <label key={column.name}><input type="checkbox" checked={columns.includes(column.name)} onChange={() => setSelectedColumns(current => ({ ...current, [key]: columns.includes(column.name) ? columns.filter(name => name !== column.name) : [...columns, column.name] }))} /><input className="domain-field-name" spellCheck={false} value={fieldNames[key]?.[column.name] ?? column.name} disabled={!columns.includes(column.name)} onChange={event => setFieldNames(current => ({ ...current, [key]: { ...current[key], [column.name]: event.target.value } }))} aria-label={`Field name for ${column.name}`} /><small className="domain-data-type" title={column.dataType} aria-label={`Data type: ${column.dataType}`}><Icon name={getDataTypeIcon(column.dataType, column.name)} size={14} /></small></label>)}</div>}
                </section></div>;
                })}</div>
              </div>
              {selectedRelations.length > 0 && <div className="domain-step-section"><h4>Relations</h4><div className="domain-relation-preview"><div className="domain-relation-header"><strong>Relation</strong><strong>Lookup name</strong><strong>Collection name</strong></div>{selectedRelations.map(relation => {
                const key = relationKey(relation);
                const names = relationNames[key] || { lookup: singularize(relation.targetTable), collection: pluralize(relation.sourceTable) };
                return <div key={key} className="domain-relation-row"><span>{relation.sourceTable} → {relation.targetTable}</span><input spellCheck={false} value={names.lookup} aria-label={`Lookup relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, lookup: event.target.value } }))} /><input spellCheck={false} value={names.collection} aria-label={`Collection relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, collection: event.target.value } }))} /></div>;
              })}</div></div>}
            </div>}
          </DomainWizard>
        ) : <div className="domain-detail-layout">
          <aside className="domain-entity-panel">
            <label className="domain-name">Domain name<input spellCheck={false} value={draftName} disabled={selected.isBuiltin} onChange={event => setDraftName(event.target.value)} /></label>
            <div className="domain-entity-toolbar">
              <strong>Entities <span>{selected.entities.length}</span></strong>
              <button type="button" onClick={importTables} disabled={selected.isBuiltin || !schema.tables.length} title="Import database tables"><Icon name="database" size={14} /></button>
              <button type="button" onClick={addManualEntity} disabled={selected.isBuiltin} title="Create entity manually"><Icon name="plus" size={14} /></button>
            </div>
            <label className="domain-entity-filter"><Icon name="search" size={13} /><input spellCheck={false} value={entityFilter} onChange={event => setEntityFilter(event.target.value)} placeholder="Filter entities" /></label>
            <div className="domain-entity-list">
              {selected.entities.filter(entity => entity.name.toLowerCase().includes(entityFilter.toLowerCase())).map(entity => (
                <button key={entity.name} type="button" className={entity.name === selectedEntityName ? "active" : ""} onClick={() => selectEntity(entity)}>
                  <Icon name="table" size={14} /><span><b>{entity.name}</b><small>{entity.fields.length} fields · {(entity.relations || []).length} relations</small></span><Icon name="chevron" size={13} />
                </button>
              ))}
              {!selected.entities.length && <p className="empty-state">No entities yet. Import tables or create one manually.</p>}
            </div>
          </aside>
          <div className="domain-entity-editor">
            <div className="domain-editor-heading">
              <div><span className="section-kicker">ENTITY DEFINITION</span><h3>{entityDraft?.name || "No entity selected"}</h3></div>
              {entityDraft && !selected.isBuiltin && <button type="button" className="domain-remove" onClick={() => removeEntity(selectedEntityName)}><Icon name="trash" size={14} /> Remove entity</button>}
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
            {entityDraft && !selected.isBuiltin && <div className="domain-entity-save"><span>{entityDirty ? "Unsaved entity changes" : "Entity changes saved locally"}</span><button type="button" className="domain-add" onClick={commitEntityDraft} disabled={!entityDirty}>Apply entity changes</button></div>}
          </div>
        </div>}
      </div>
      </>}
      {connectionDialogOpen && createPortal(
        <div className="database-connection-dialog-backdrop" onClick={() => setConnectionDialogOpen(false)}>
          <section className="database-connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-title" onClick={event => event.stopPropagation()}>
            <button className="database-connection-dialog-close" type="button" aria-label="Close database connection" onClick={() => setConnectionDialogOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <DatabaseConnection onConnected={() => { setConnectionDialogOpen(false); setError(""); setStep(2); }} />
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
