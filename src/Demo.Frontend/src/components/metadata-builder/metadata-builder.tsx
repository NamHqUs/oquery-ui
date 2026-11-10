import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { apiUrls } from "../../const/api-urls";
import { useMessageBox } from "../message-box/message-box";
import Icon from "../icon/icon";
import PanelSplitter from "../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import { fetchDbSchema } from "../data-sources/database-slice";
import { fetchQueryMetadata, MetadataEntity, invalidateQueryMetadata } from "../query-builder/query-design/query-builder-slice";
import EntityList from "./entity-definition/entity-list/entity-list";
import EntityBuilder, { type DatabaseTableOption } from "./entity-definition/entity-builder/entity-builder";
import EntityDiagram from "./entity-diagram/entity-diagram";
import { EditableEntity, EditableRelation, emptyEntity, toAbstractDataType, toEditable } from "./types";
import FunctionDefinitionsWorkspace from "../function-definition/function-definition";
import OperatorDefinition from "./operator-definition/operator-definition";
import BusinessScopeList from "./business-scope/business-scope-list";
import { resolveDefinitionChanges, useDefinitionUnsavedWarning } from "./definition-actions/definition-actions";
import DefinitionActions from "./definition-actions/definition-actions";
import type { DefinitionActionAdapter } from "./definition-actions/definition-actions";
import "./metadata-builder.css";
import type { RootState } from "../../store/store";

export * from "./types";

type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;
type MetadataSection = "diagram" | "entities" | "business-scopes" | "functions" | "operators";
type DatabaseRelationship = {
  name: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
  isUnique: boolean;
};
type BusinessScopeSummary = {
  name: string;
  entities: MetadataEntity[];
};

function normalizeTablePart(value: string) {
  return value.trim().replace(/[\[\]"`]/g, "").toLowerCase();
}

function entityUsesTable(entity: MetadataEntity, table: { schema: string; name: string }) {
  const tableName = normalizeTablePart(table.name);
  const qualifiedName = `${normalizeTablePart(table.schema || "dbo")}.${tableName}`;
  return [entity.name, entity.rawSql || ""].some((value) => {
    const normalized = value.trim().toLowerCase();
    return normalized === tableName
      || normalized === qualifiedName
      || normalized.endsWith(`.${tableName}`);
  });
}

function entityUsesRawSql(entity: MetadataEntity) {
  const rawSql = entity.rawSql?.trim() || "";
  return Boolean(rawSql && rawSql !== entity.name.trim());
}

function findEntityTable(entity: MetadataEntity, tables: DatabaseTableOption[]) {
  if (entityUsesRawSql(entity)) return undefined;
  return tables.find((table) =>
    normalizeTablePart(table.name) === normalizeTablePart(entity.name)
    && (!entity.schema
      || normalizeTablePart(entity.schema) === "dbo"
      || normalizeTablePart(table.schema) === normalizeTablePart(entity.schema)),
  );
}

async function request<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Metadata request failed (${response.status}).`);
  }

  return response.status === 204 ? null as T : response.json() as Promise<T>;
}

type MetadataBuilderProps = {
  onNavigationGuardChange?: (guard: ((continueNavigation: () => void, cancelNavigation?: () => void) => void) | null) => void;
  onSectionNavigationChange?: (handler: ((section: MetadataSection) => void) | null) => void;
  entityOnly?: boolean;
  embedded?: boolean;
};

export default function MetadataBuilder({ onNavigationGuardChange, onSectionNavigationChange, entityOnly = false, embedded = false }: MetadataBuilderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const databaseState = useSelector((state: RootState) => state.database);
  const entities = useSelector((state: RootState) => state.queryBuilder.metadata);
  const showMessageBox = useMessageBox();
  const [searchParams, setSearchParams] = useSearchParams();
  const [functionNavigationGuard, setFunctionNavigationGuard] = useState<NavigationGuard | null>(null);
  const [operatorNavigationGuard, setOperatorNavigationGuard] = useState<NavigationGuard | null>(null);
  const updateFunctionNavigationGuard = useCallback(
    (guard: NavigationGuard | null) => setFunctionNavigationGuard(() => guard),
    [],
  );
  const updateOperatorNavigationGuard = useCallback(
    (guard: NavigationGuard | null) => setOperatorNavigationGuard(() => guard),
    [],
  );
  const [selectedName, setSelectedName] = useState("");
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const selectedNameRef = useRef(selectedName);
  const [draft, setDraft] = useState<EditableEntity | null>(null);
  const [filter, setFilter] = useState("");
  const panel = useResizablePanel("metadata-builder");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [businessScopes, setBusinessScopes] = useState<BusinessScopeSummary[]>([]);
  useEffect(() => setToolbarHost(document.getElementById("metadata-toolbar-actions")), []);
  useEffect(() => { selectedNameRef.current = selectedName; }, [selectedName]);
  const requestedSection = searchParams.get("section")
    ?? (location.pathname === "/metadata/business-scopes/create" ? "business-scopes" : null);
  const scopeName = searchParams.get("scope") || undefined;
  const activeSection: MetadataSection = entityOnly ? "entities" : requestedSection === "diagram" || requestedSection === "entities" || requestedSection === "business-scopes" || requestedSection === "functions" || requestedSection === "operators"
    ? requestedSection
    : "diagram";
  useEffect(() => {
    if (entityOnly || requestedSection === "diagram" || requestedSection === "entities" || requestedSection === "business-scopes" || requestedSection === "functions" || requestedSection === "operators") return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "diagram");
    setSearchParams(nextSearchParams, { replace: true });
  }, [entityOnly, requestedSection, searchParams, setSearchParams]);
  const selectSection = async (section: MetadataSection) => {
    if (section === activeSection || !(await resolveAllDirtyChanges(activeSection))) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", section);
    setSearchParams(nextSearchParams);
  };
  useEffect(() => {
    onSectionNavigationChange?.((section) => { void selectSection(section); });
    return () => onSectionNavigationChange?.(null);
  }, [activeSection, onSectionNavigationChange, searchParams]);
  const selectedIsBuiltin = entities.find((entity) => entity.name === selectedName)?.canDelete === false;
  useDefinitionUnsavedWarning(dirty);

  const loadEntities = async (selectFirst = false, preferredName = selectedName) => {
    setStatus("loading");
    setMessage("");
    try {
      const result = await dispatch(fetchQueryMetadata(scopeName));
      if (!fetchQueryMetadata.fulfilled.match(result)) {
        throw new Error(String(result.payload || "Unable to load metadata."));
      }
      const payload = result.payload;
      const preferred = payload.find((entity) => entity.name === preferredName);
      if (selectFirst || !preferredName || !preferred) {
        const next = selectFirst ? payload[0] : preferred;
        setSelectedName(next?.name || "");
        setDraft(next ? toEditable(next) : null);
        const nextTable = next
          ? findEntityTable(next, databaseState.schema.tables as DatabaseTableOption[])
          : undefined;
        setSelectedTableKey((current) => current || (nextTable ? tableKey(nextTable) : ""));
      } else {
        setSelectedName(preferred.name);
        setDraft(toEditable(preferred));
      }
      setDirty(false);
      setStatus("succeeded");
      return true;
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to load metadata.");
      return false;
    }
  };

  useEffect(() => { void loadEntities(true); }, [scopeName]);
  useEffect(() => {
    if (entityOnly || (activeSection !== "diagram" && activeSection !== "entities")) return;
    let cancelled = false;
    void request<BusinessScopeSummary[]>(apiUrls.metadata.businessScopes)
      .then((result) => {
        if (!cancelled) setBusinessScopes(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setBusinessScopes([]);
          setMessage(reason instanceof Error ? reason.message : "Unable to load business scopes for the diagram.");
        }
      });
    return () => { cancelled = true; };
  }, [activeSection, entityOnly]);
  useEffect(() => {
    if (databaseState.connectionStatus === "succeeded" && databaseState.schemaStatus === "idle") {
      dispatch(fetchDbSchema());
    }
  }, [databaseState.connectionStatus, databaseState.schemaStatus, dispatch]);

  const discardChanges = () => {
    const original = entities.find((entity) => entity.name === selectedName);
    setDraft(original ? toEditable(original) : null);
    setDirty(false);
    setMessage("");
  };

  const save = async (): Promise<boolean> => {
    if (selectedIsBuiltin) {
      setMessage("Built-in metadata is read-only.");
      return false;
    }
    const selectedTableColumns = new Set(
      selectedTable?.columns.map((column) => column.name.trim().toLowerCase()),
    );
    const fieldIsRawSql = (field: EditableEntity["fields"][number]) => {
      if (!selectedTable) {
        return field.isRawSql ?? false;
      }
      const column = (field.dbColumn?.trim() || field.name.trim()).toLowerCase();
      return Boolean(column) && !selectedTableColumns.has(column);
    };
    const fieldDataType = (field: EditableEntity["fields"][number]) => {
      const fieldColumn = (field.dbColumn?.trim() || field.name.trim()).toLowerCase();
      const column = selectedTable?.columns.find((item) =>
        item.name.trim().toLowerCase() === fieldColumn,
      );
      return column ? toAbstractDataType(column.dataType, field.name) : field.dataType || "String";
    };
    if (!draft?.name.trim() || draft.fields.some((field) => !field.name.trim())) {
      setMessage("Entity and field names are required.");
      return false;
    }
    if (draft.fields.some((field) => fieldIsRawSql(field) && !field.dbColumn?.trim())) {
      setMessage("Raw SQL expressions are required.");
      return false;
    }
    const rawSql = draft.rawSql.trim();
    const dbTable = rawSql
      ? rawSql.startsWith("(") && rawSql.endsWith(")")
        ? rawSql
        : `(${rawSql})`
      : draft.name.trim();
    const payload = {
      name: draft.name.trim(),
      dbSchema: draft.schema.trim(),
      dbTable,
      isRawSql: Boolean(rawSql && rawSql !== draft.name.trim()),
      fields: draft.fields.map((field) => ({
        name: field.name.trim(),
        dbColumn: field.dbColumn?.trim() || field.name.trim(),
        dataType: fieldDataType(field),
        isRawSql: fieldIsRawSql(field),
      })),
      relations: draft.relations.map(({ name, refEntity, type, refKeys }) => ({ name: name.trim(), refEntity: refEntity.trim(), type, refKeys })),
    };
    setStatus("saving");
    setMessage("");
    try {
      const url = selectedName ? apiUrls.metadata.byName(selectedName) : apiUrls.metadata.list;
      await request(url, {
        method: selectedName ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      dispatch(invalidateQueryMetadata());
      return await loadEntities(false, payload.name);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to save metadata.");
      return false;
    }
  };

  const resolveEntityDirtyChanges = async () => {
    return resolveDefinitionChanges({
      resourceName: "entity",
      selectedName,
      dirty,
      saving: status === "saving",
      onSave: save,
      onDiscard: discardChanges,
    }, showMessageBox);
  };

  const resolveAllDirtyChanges = async () => {
    if (!(await resolveEntityDirtyChanges())) return false;
    if (functionNavigationGuard && !(await runNavigationGuard(functionNavigationGuard))) return false;
    if (operatorNavigationGuard && !(await runNavigationGuard(operatorNavigationGuard))) return false;
    return true;
  };

  const runNavigationGuard = (guard: NavigationGuard) => new Promise<boolean>((resolve) => {
    guard(() => resolve(true), () => resolve(false));
  });

  useEffect(() => {
    const guard = (continueNavigation: () => void, cancelNavigation?: () => void) => {
      void (async () => {
        if (await resolveAllDirtyChanges()) continueNavigation();
        else cancelNavigation?.();
      })();
    };
    onNavigationGuardChange?.(guard);
    return () => onNavigationGuardChange?.(null);
  }, [onNavigationGuardChange, dirty, draft, entities, selectedName, functionNavigationGuard, operatorNavigationGuard, activeSection]);

  const selectEntity = async (entity: MetadataEntity) => {
    if (entity.name === selectedName || !(await resolveEntityDirtyChanges())) return;
    setSelectedName(entity.name);
    setDraft(toEditable(entity));
    const matchingTable = findEntityTable(entity, databaseTables);
    setSelectedTableKey(matchingTable ? tableKey(matchingTable) : "");
    setDirty(false);
    setMessage("");
  };

  const updateDraft = (update: (entity: EditableEntity) => EditableEntity) => {
    if (!draft) return;
    setDraft(update(draft));
    setDirty(true);
  };

  const remove = async () => {
    const name = selectedNameRef.current;
    if (!name || selectedIsBuiltin) return;
    setStatus("saving");
    try {
      await request(apiUrls.metadata.byName(name), { method: "DELETE" });
      setSelectedName("");
      dispatch(invalidateQueryMetadata());
      await loadEntities(true);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to delete metadata.");
    }
  };

  const addEntity = async () => {
    setSelectedName("");
    setSelectedTableKey("");
    setDraft(emptyEntity());
    setDirty(true);
    setMessage("");
  };

  const openTableAsEntity = (
    table: { name: string; schema: string; columns: { name: string; dataType: string; isPrimaryKey: boolean }[] },
    navigateToEditor = true,
    rawSqlOverride?: string,
  ) => {
    setSelectedTableKey(tableKey(table));
    const discoveredRelations = (databaseState.schema.relationships as DatabaseRelationship[])
      .filter((relation) =>
        normalizeTablePart(relation.sourceSchema || "dbo") === normalizeTablePart(table.schema || "dbo")
        && normalizeTablePart(relation.sourceTable) === normalizeTablePart(table.name),
      )
      .flatMap((relation) => {
        const relatedEntities = entities.filter((entity) =>
          entityUsesTable(entity, { schema: relation.targetSchema, name: relation.targetTable })
          && !entityUsesTable(entity, table),
        );
        return relatedEntities.map((entity): EditableRelation => ({
          id: `schema_${relation.name}_${entity.name}`,
          name: relation.targetTable,
          refEntity: entity.name,
          type: "Lookup",
          refKeys: relation.sourceColumns.map((dbColumn, index) => ({
            dbColumn,
            refDbColumn: relation.targetColumns[index] || "",
          })),
        }));
      });
    const existing = entities.find((entity) =>
      entity.name === table.name && (entity.schema || "dbo") === (table.schema || "dbo"),
    );
    if (existing) {
      setSelectedName(existing.name);
      const nextDraft = toEditable(existing);
      const existingRelationKeys = new Set(nextDraft.relations.map((relation) =>
        `${relation.refEntity}|${relation.refKeys.map((key) => `${key.dbColumn}:${key.refDbColumn}`).join(",")}`,
      ));
      const relations = discoveredRelations.filter((relation) =>
        !existingRelationKeys.has(`${relation.refEntity}|${relation.refKeys.map((key) => `${key.dbColumn}:${key.refDbColumn}`).join(",")}`),
      );
      setDraft({ ...nextDraft, rawSql: rawSqlOverride ?? nextDraft.rawSql, relations: [...nextDraft.relations, ...relations] });
      setDirty(relations.length > 0);
    } else {
      setSelectedName("");
      setDraft({
        name: table.name,
        schema: table.schema,
        rawSql: rawSqlOverride ?? "",
        fields: table.columns.map((column) => ({
          id: `diagram_${column.name}`,
          name: column.name,
          dbColumn: column.name,
          dataType: column.dataType,
          isRawSql: false,
        })),
        relations: discoveredRelations,
      });
      setDirty(false);
    }
    setMessage("");
    if (navigateToEditor) {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("section", "entities");
      setSearchParams(nextSearchParams);
    }
  };

  const entityActionAdapter: DefinitionActionAdapter = {
    resourceName: "entity",
    selectedName,
    hasSelection: Boolean(selectedName),
    getSelectedName: () => selectedNameRef.current,
    isBuiltIn: selectedIsBuiltin,
    hasDraft: Boolean(draft),
    dirty,
    saving: status === "saving",
    onSave: save,
    onDiscard: discardChanges,
    onDelete: remove,
    onNew: () => void addEntity(),
  };
  const databaseOptions = Array.from(new Set(entities.map((entity) => entity.schema).filter(Boolean)));
  const databaseTables = databaseState.schema.tables as DatabaseTableOption[];
  const tableKey = (table: { schema: string; name: string }) =>
    `${(table.schema || "dbo").trim().toLowerCase()}.${table.name.trim().toLowerCase()}`;
  const selectedTable = databaseTables.find((table) => tableKey(table) === selectedTableKey)
    || (draft ? findEntityTable(draft, databaseTables) : undefined);
  useEffect(() => {
    if (!selectedName || !draft || entityUsesRawSql(draft)) return;
    if (selectedTableKey && databaseTables.some((table) => tableKey(table) === selectedTableKey)) return;
    const matchingTable = findEntityTable(draft, databaseTables);
    setSelectedTableKey(matchingTable ? tableKey(matchingTable) : "");
  }, [databaseTables, draft, selectedName, selectedTableKey]);

  const selectDatabaseTable = (table: DatabaseTableOption) => {
    const rawSql = draft?.rawSql || "";
    setSelectedTableKey(tableKey(table));
    openTableAsEntity({
      ...table,
      columns: table.columns.map((column) => ({
        ...column,
        dataType: column.dataType || "String",
        isPrimaryKey: Boolean(column.isPrimaryKey),
      })),
    }, false, rawSql);
  };
  const selectRawSqlMode = () => {
    setSelectedTableKey("");
  };
  const selectBusinessScope = (name: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "entities");
    nextSearchParams.set("scope", name);
    navigate(`/metadata?${nextSearchParams.toString()}`);
  };

  return (
    <>
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "diagram"}>
        <EntityDiagram
          entities={entities}
          businessScopes={businessScopes}
          activeScopeName={scopeName}
          onOpenEntity={(table) => openTableAsEntity(table, false)}
          entityEditorHeader={
            <div className="table-details-heading metadata-editor-heading">
              <div className="table-details-title">
                <div className="metadata-editor-heading-eyebrow">
                  <span className="section-kicker">ENTITY DEFINITION</span>
                  <span>{scopeName || "All scopes"}</span>
                </div>
                <div className="metadata-editor-heading-title">
                  <span className="metadata-editor-heading-icon"><Icon name="table" size={18} /></span>
                  <h3>{draft?.name || "Select an entity"}</h3>
                </div>
                <p>{draft ? "Configure the entity mapping, fields, and relations." : "Choose an entity from the navigation to begin."}</p>
              </div>
              <span className={`metadata-editor-heading-status${selectedIsBuiltin ? " readonly" : ""}`}>
                {selectedIsBuiltin ? "Read-only" : draft ? "Ready to edit" : "No selection"}
              </span>
            </div>
          }
          entityEditor={
            <EntityBuilder
              draft={draft}
              canEdit={!selectedName || Boolean(draft?.canDelete)}
              message={message}
              allEntities={entities}
              onDraftChange={updateDraft}
              databaseOptions={databaseOptions}
              databaseTables={databaseTables}
              selectedTable={selectedTable}
              onSelectTable={selectDatabaseTable}
              onSelectRawSql={selectRawSqlMode}
              compact
            />
          }
        />
      </div>}
      <div className="metadata-workspace-panel" hidden={activeSection !== "entities"}>
        <section className={`metadata-workspace split-workspace${panel.collapsed ? " panel-collapsed" : ""}`} style={panel.style}>
          <div className="metadata-entity-navigation">
            {businessScopes.length > 0 && (
              <div className="metadata-scope-navigation">
                <div className="metadata-scope-navigation-heading">
                  <span className="section-kicker">WORKSPACE</span>
                  <strong>Business scope</strong>
                </div>
                <nav aria-label="Entity definition business scopes">
                  {businessScopes.map((scope) => {
                    const isActive = (scopeName || "All") === scope.name;
                    return (
                      <button
                        type="button"
                        className={`metadata-scope-navigation-item${isActive ? " active" : ""}`}
                        aria-pressed={isActive}
                        key={scope.name}
                        onClick={() => selectBusinessScope(scope.name)}
                      >
                        <span className="metadata-scope-navigation-icon"><Icon name="folder" size={14} /></span>
                        <span className="metadata-scope-navigation-name">{scope.name}</span>
                        <span className="metadata-scope-navigation-count">{scope.entities.length}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}
            <EntityList
              entities={entities}
              selectedName={selectedName}
              filter={filter}
              status={status}
              scopeName={scopeName}
              onFilterChange={setFilter}
              onSelectEntity={selectEntity}
            />
          </div>
          <PanelSplitter panel={panel} label="entities panel" />
          <div className="metadata-editor">
            <div className="table-details-heading metadata-editor-heading">
              <div className="table-details-title">
                <div className="metadata-editor-heading-eyebrow">
                  <span className="section-kicker">ENTITY DEFINITION</span>
                  <span>{scopeName || "All scopes"}</span>
                </div>
                <div className="metadata-editor-heading-title">
                  <span className="metadata-editor-heading-icon"><Icon name="table" size={18} /></span>
                  <h3>{draft?.name || "Select an entity"}</h3>
                </div>
                <p>{draft ? "Configure the entity mapping, fields, and relations." : "Choose an entity from the navigation to begin."}</p>
              </div>
              <span className={`metadata-editor-heading-status${selectedIsBuiltin ? " readonly" : ""}`}>
                {selectedIsBuiltin ? "Read-only" : draft ? "Ready to edit" : "No selection"}
              </span>
            </div>
            <EntityBuilder
              draft={draft}
              canEdit={!selectedName || Boolean(draft?.canDelete)}
              message={message}
              allEntities={entities}
              onDraftChange={updateDraft}
              databaseOptions={databaseOptions}
              databaseTables={databaseTables}
              selectedTable={selectedTable}
              onSelectTable={selectDatabaseTable}
              onSelectRawSql={selectRawSqlMode}
            />
          </div>
        </section>
      </div>
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "functions"}>
        <FunctionDefinitionsWorkspace onNavigationGuardChange={updateFunctionNavigationGuard} />
      </div>}
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "operators"}>
        <OperatorDefinition onNavigationGuardChange={updateOperatorNavigationGuard} />
      </div>}
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "business-scopes"}>
        <BusinessScopeList active={activeSection === "business-scopes"} />
      </div>}
      {toolbarHost && (activeSection === "diagram" || activeSection === "entities")
        && createPortal(<DefinitionActions adapter={entityActionAdapter} />, toolbarHost)}
    </>
  );
}
