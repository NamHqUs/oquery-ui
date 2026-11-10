import { createPortal, flushSync } from "react-dom";
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
import DomainList from "./domain/domain-list";
import { resolveDefinitionChanges, useDefinitionUnsavedWarning } from "./definition-actions/definition-actions";
import DefinitionActions from "./definition-actions/definition-actions";
import type { DefinitionActionAdapter } from "./definition-actions/definition-actions";
import "./metadata-builder.css";
import type { RootState } from "../../store/store";

export * from "./types";

type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;
type MetadataSection = "diagram" | "entities" | "domains" | "functions" | "operators";
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
type DomainSummary = {
  name: string;
  entities: MetadataEntity[];
  isBuiltin: boolean;
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
  const [message, setRawMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const setMessage = (value: string) => {
    setRawMessage(value);
    setMessageKind("error");
  };
  const setSuccessMessage = (value: string) => {
    setRawMessage(value);
    setMessageKind("success");
  };
  const [dirty, setDirty] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [domains, setDomains] = useState<DomainSummary[]>([]);
  const [domainsExpanded, setDomainsExpanded] = useState(true);
  const [scopedEntities, setScopedEntities] = useState<MetadataEntity[] | null>(null);
  const [domainToolbarActions, setDomainToolbarActions] = useState<React.ReactNode>(null);
  const sectionNavigationRef = useRef<(section: MetadataSection) => void>(() => undefined);
  const [pendingToolbarSection, setPendingToolbarSection] = useState<MetadataSection | null>(null);
  useEffect(() => setToolbarHost(document.getElementById("metadata-toolbar-actions")), []);
  useEffect(() => { selectedNameRef.current = selectedName; }, [selectedName]);
  const requestedSection = searchParams.get("section")
    ?? (location.pathname === "/metadata/domains/create" ? "domains" : null);
  const scopeName = searchParams.get("scope") || undefined;
  const activeSection: MetadataSection = entityOnly ? "entities" : requestedSection === "diagram" || requestedSection === "entities" || requestedSection === "domains" || requestedSection === "functions" || requestedSection === "operators"
    ? requestedSection
    : "diagram";
  useEffect(() => {
    if (entityOnly || requestedSection === "diagram" || requestedSection === "entities" || requestedSection === "domains" || requestedSection === "functions" || requestedSection === "operators") return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "diagram");
    setSearchParams(nextSearchParams, { replace: true });
  }, [entityOnly, requestedSection, searchParams, setSearchParams]);
  const selectSection = async (section: MetadataSection) => {
    if ((section === activeSection
      && !(section === "domains"
        && (location.pathname === "/metadata/domains/create" || searchParams.has("scope"))))
      ) return;
    flushSync(() => setPendingToolbarSection(section));
    if (!(await resolveAllDirtyChanges(activeSection))) {
      setPendingToolbarSection(null);
      return;
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", section);
    if (section === "domains") nextSearchParams.delete("scope");
    if (section === "domains" && location.pathname === "/metadata/domains/create") {
      navigate(`/metadata?${nextSearchParams.toString()}`);
    } else {
      setSearchParams(nextSearchParams);
    }
  };
  useEffect(() => {
    if (pendingToolbarSection === activeSection) setPendingToolbarSection(null);
  }, [activeSection, pendingToolbarSection]);
  sectionNavigationRef.current = (section) => { void selectSection(section); };
  useEffect(() => {
    onSectionNavigationChange?.((section) => sectionNavigationRef.current(section));
    return () => onSectionNavigationChange?.(null);
  }, [onSectionNavigationChange]);
  const displayedEntities = scopedEntities ?? entities;
  const activeDomainIsBuiltin = !scopeName
    || domains.find((domain) => domain.name === scopeName)?.isBuiltin === true;
  const selectedIsBuiltin = activeDomainIsBuiltin
    || displayedEntities.find((entity) => entity.name === selectedName)?.canDelete === false;
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
      setScopedEntities(scopeName ? payload : null);
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
    void request<DomainSummary[]>(apiUrls.metadata.domains)
      .then((result) => {
        if (!cancelled) setDomains(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setDomains([]);
          setMessage(reason instanceof Error ? reason.message : "Unable to load domains for the diagram.");
        }
      });
    return () => { cancelled = true; };
  }, [activeSection, entityOnly]);
  useEffect(() => {
    if (!scopeName || !scopedEntities) return;
    setDomains((current) => current.map((domain) =>
      domain.name === scopeName ? { ...domain, entities: scopedEntities } : domain));
  }, [scopeName, scopedEntities]);
  useEffect(() => {
    if (databaseState.connectionStatus === "succeeded" && databaseState.schemaStatus === "idle") {
      dispatch(fetchDbSchema());
    }
  }, [databaseState.connectionStatus, databaseState.schemaStatus, dispatch]);

  const discardChanges = () => {
    if (scopeName) {
      void loadEntities(false, selectedName);
      return;
    }
    const original = displayedEntities.find((entity) => entity.name === selectedName);
    setDraft(original ? toEditable(original) : null);
    setDirty(false);
    setMessage("");
  };
  const reload = async () => {
    setMessage("");
    await loadEntities(false, selectedName);
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
      return field.dataType || (column ? toAbstractDataType(column.dataType, field.name) : "String");
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
    const payload = {
      name: draft.name.trim(),
      schema: draft.schema.trim(),
      rawSql: rawSql || draft.name.trim(),
      fields: draft.fields.map((field) => ({
        name: field.name.trim(),
        dbColumn: field.dbColumn?.trim() || field.name.trim(),
        dataType: fieldDataType(field),
        isRawSql: fieldIsRawSql(field),
      })),
      relations: draft.relations.map(({ name, refEntity, type, refKeys }) => ({ name: name.trim(), refEntity: refEntity.trim(), type, refKeys })),
      canDelete: draft.canDelete ?? true,
    };
    setStatus("saving");
    setMessage("");
    try {
      if (scopeName && !draft) {
        const scopeResult = await request<DomainSummary[]>(apiUrls.metadata.domains);
        const scope = scopeResult.find((item) => item.name === scopeName);
        if (!scope) throw new Error(`Domain "${scopeName}" was not found.`);
        await request(apiUrls.metadata.domainByName(scope.name), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: scope.name,
            description: scope.description,
            entities: displayedEntities,
          }),
        });
        dispatch(invalidateQueryMetadata());
        return await loadEntities(true);
      }
      if (scopeName) {
        const scopeResult = await request<DomainSummary[]>(apiUrls.metadata.domains);
        const scope = scopeResult.find((item) => item.name === scopeName);
        if (!scope) throw new Error(`Domain "${scopeName}" was not found.`);
        const nextEntities = selectedName
          ? displayedEntities.map((entity) => entity.name === selectedName ? payload : entity)
          : [...displayedEntities, payload];
        await request(apiUrls.metadata.domainByName(scope.name), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: scope.name,
            description: scope.description,
            entities: nextEntities,
          }),
        });
        setScopedEntities(nextEntities);
      }
      dispatch(invalidateQueryMetadata());
      const saved = await loadEntities(false, payload.name);
      if (saved && scopeName) {
        setSuccessMessage(`Domain "${scopeName}" saved successfully.`);
      }
      return saved;
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
    const remaining = displayedEntities.filter((entity) => entity.name !== name);
    setScopedEntities(remaining);
    const next = remaining[0];
    setSelectedName(next?.name || "");
    setDraft(next ? toEditable(next) : null);
    setDirty(true);
    setMessage(`"${name}" was removed from the ${scopeName} domain. Save the domain to apply the change.`);
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
    const entitiesWithCurrentDraft = scopeName && draft && selectedName
      ? displayedEntities.map((entity) => entity.name === selectedName ? draft : entity)
      : displayedEntities;
    if (entitiesWithCurrentDraft !== displayedEntities && scopeName) {
      setScopedEntities(entitiesWithCurrentDraft);
    }
    setSelectedTableKey(tableKey(table));
    const discoveredRelations = (databaseState.schema.relationships as DatabaseRelationship[])
      .filter((relation) =>
        normalizeTablePart(relation.sourceSchema || "dbo") === normalizeTablePart(table.schema || "dbo")
        && normalizeTablePart(relation.sourceTable) === normalizeTablePart(table.name),
      )
      .flatMap((relation) => {
        const relatedEntities = entitiesWithCurrentDraft.filter((entity) =>
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
    const existing = entitiesWithCurrentDraft.find((entity) =>
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
    onReload: reload,
    onDelete: remove,
    onNew: () => void addEntity(),
  };
  const entityHeaderActions = (
    <DefinitionActions
      adapter={{
        ...entityActionAdapter,
        onSave: undefined,
        onReload: undefined,
      }}
    />
  );
  const toolbarSection = pendingToolbarSection ?? activeSection;
  const toolbarActions = toolbarSection === "domains" || toolbarSection === "diagram"
    ? domainToolbarActions
    : null;
  const databaseOptions = Array.from(new Set(displayedEntities.map((entity) => entity.schema).filter(Boolean)));
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
  const selectDomain = (name: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "entities");
    nextSearchParams.set("scope", name);
    navigate(`/metadata?${nextSearchParams.toString()}`);
  };
  const selectDiagramDomain = (name: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "diagram");
    nextSearchParams.set("scope", name);
    navigate(`/metadata?${nextSearchParams.toString()}`);
  };

  return (
    <>
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "diagram"}>
        <EntityDiagram
          entities={displayedEntities}
          domains={domains}
          activeScopeName={scopeName}
          editingEntity={draft}
          editingEntityName={selectedName}
          onDraftChange={updateDraft}
          onSelectDomain={selectDiagramDomain}
          onOpenEntity={(table) => openTableAsEntity(table, false)}
          entityEditorHeader={
            <div className="table-details-heading metadata-editor-heading">
              <div className="table-details-title">
                <div className="metadata-editor-heading-eyebrow">
                  <span className="section-kicker">ENTITY DEFINITION</span>
                </div>
                <div className="metadata-editor-heading-title">
                  <span className="metadata-editor-heading-icon"><Icon name="table" size={18} /></span>
                  <h3>{draft?.name || "Select an entity"}</h3>
                </div>
              </div>
              <div className="metadata-editor-heading-actions">
                {entityHeaderActions}
                <span className={`metadata-editor-heading-status${selectedIsBuiltin ? " readonly" : ""}`}>
                  {selectedIsBuiltin ? "Read-only" : draft ? "Ready to edit" : "No selection"}
                </span>
              </div>
            </div>
          }
          entityEditor={
            <EntityBuilder
              draft={draft}
              canEdit={Boolean(scopeName) && !activeDomainIsBuiltin && (!selectedName || Boolean(draft?.canDelete))}
              message={message}
              messageKind={messageKind}
              allEntities={displayedEntities}
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
            {domains.length > 0 && (
              <div className="metadata-scope-navigation">
                <button
                  type="button"
                  className={`metadata-scope-navigation-heading${domainsExpanded ? "" : " collapsed"}`}
                  aria-expanded={domainsExpanded}
                  aria-controls="metadata-domain-navigation"
                  onClick={() => setDomainsExpanded((expanded) => !expanded)}
                >
                  <span className="section-kicker">DOMAINS</span>
                  <Icon name="chevron-down" size={14} />
                </button>
                <nav id="metadata-domain-navigation" aria-label="Entity definition domains">
                  {domains.map((scope) => {
                    const isActive = (scopeName || "All") === scope.name;
                    if (!domainsExpanded && !isActive) return null;
                    return (
                      <button
                        type="button"
                        className={`metadata-scope-navigation-item${isActive ? " active" : ""}`}
                        aria-pressed={isActive}
                        key={scope.name}
                        onClick={() => selectDomain(scope.name)}
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
              entities={displayedEntities}
              selectedName={selectedName}
              filter={filter}
              status={status}
              onFilterChange={setFilter}
              onSelectEntity={selectEntity}
            />
          </div>
          <PanelSplitter panel={panel} label="entities panel" />
          <div className="metadata-editor">
            <div className="table-details-heading metadata-editor-heading entity-details-heading">
              <div className="table-details-title">
                <div className="metadata-editor-heading-eyebrow">
                  <span className="section-kicker">DETAILS</span>
                </div>
                <div className="metadata-editor-heading-title">
                  <span className="metadata-editor-heading-icon"><Icon name="table" size={18} /></span>
                  <h3>{draft?.name || "Select an entity"}</h3>
                </div>
              </div>
              <div className="metadata-editor-heading-actions">
                {entityHeaderActions}
                <span className={`metadata-editor-heading-status${selectedIsBuiltin ? " readonly" : ""}`}>
                  {selectedIsBuiltin ? "Read-only" : draft ? "Ready to edit" : "No selection"}
                </span>
              </div>
            </div>
            <EntityBuilder
              draft={draft}
              canEdit={Boolean(scopeName) && !activeDomainIsBuiltin && (!selectedName || Boolean(draft?.canDelete))}
              message={message}
              messageKind={messageKind}
              allEntities={displayedEntities}
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
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "domains"}>
        <DomainList
          active={activeSection === "domains" || activeSection === "diagram"}
          onToolbarActionsChange={setDomainToolbarActions}
          externalDirty={activeSection === "diagram" && dirty}
          onExternalSave={save}
          onExternalReload={reload}
        />
      </div>}
      {toolbarHost && createPortal(
        toolbarActions,
        toolbarHost,
      )}
    </>
  );
}
