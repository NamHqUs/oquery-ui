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
  id: string;
  name: string;
  description: string;
  entities: MetadataEntity[];
  canDelete: boolean;
  isBuiltin: boolean;
};
type DomainName = {
  id: string;
  name: string;
};
type DomainNameWithDescription = DomainName & {
  description: string;
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

function entityUsesRawSql(entity: MetadataEntity, tables: DatabaseTableOption[] = []) {
  const rawSql = entity.rawSql?.trim() || "";
  if (entity.fields.some((field) => field.isRawSql)) return true;
  if (!rawSql || rawSql === entity.name.trim()) return false;
  return !tables.some((table) => entityUsesTable(entity, table));
}

function findEntityTable(entity: MetadataEntity, tables: DatabaseTableOption[]) {
  if (entityUsesRawSql(entity, tables)) return undefined;
  return tables.find((table) =>
    entityUsesTable(entity, table)
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

async function loadDomainSummaries(): Promise<DomainSummary[]> {
  const domains = await request<DomainNameWithDescription[]>(apiUrls.metadata.domainNamesWithDescriptions);
  return domains.map(domain => ({
    ...domain,
    entities: [],
    canDelete: domain.id !== "All",
    isBuiltin: domain.id === "All",
  }));
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
  const [domainNames, setDomainNames] = useState<DomainName[]>([]);
  const [domainsExpanded, setDomainsExpanded] = useState(true);
  const [scopedEntities, setScopedEntities] = useState<MetadataEntity[] | null>(null);
  const [loadedScopeName, setLoadedScopeName] = useState<string | undefined>();
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
    if (section === "domains" && location.pathname === "/metadata/domains/create") {
      nextSearchParams.delete("scope");
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
    || domains.find((domain) => domain.id === scopeName)?.isBuiltin === true;
  const metadataBusy = status === "loading"
    || status === "saving"
    || loadedScopeName !== scopeName;
  const canManageCurrentDomain = Boolean(scopeName) && !activeDomainIsBuiltin;
  const canSaveCurrentDomain = canManageCurrentDomain && (Boolean(draft) || dirty);
  useDefinitionUnsavedWarning(dirty);

  const loadEntities = async (selectFirst = false, preferredName = selectedName) => {
    setStatus("loading");
    setMessage("");
    try {
      const result = await dispatch(fetchQueryMetadata(scopeName));
      if (!fetchQueryMetadata.fulfilled.match(result)) {
        if (result.meta.condition) return false;
        throw new Error(String(result.payload || "Unable to load metadata."));
      }
      const payload = result.payload;
      setScopedEntities(scopeName ? payload : null);
      setLoadedScopeName(scopeName);
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
      setLoadedScopeName(scopeName);
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to load metadata.");
      return false;
    }
  };

  useEffect(() => {
    if (activeSection !== "diagram" && activeSection !== "entities") return;
    void loadEntities(true);
  }, [activeSection, scopeName]);
  useEffect(() => {
    let cancelled = false;
    if (activeSection === "diagram") {
      void request<DomainName[]>(apiUrls.metadata.domainNames)
        .then((names) => {
          if (!cancelled) {
            setDomainNames(names);
            const selectedDomain = names.find(domain => domain.id === scopeName);
            setDomains(selectedDomain
              ? [{
                  ...selectedDomain,
                  description: "",
                  entities: [],
                  canDelete: selectedDomain.id !== "All",
                  isBuiltin: selectedDomain.id === "All",
                }]
              : []);
          }
        })
        .catch((reason) => {
          if (!cancelled) {
            setDomains([]);
            setMessage(reason instanceof Error ? reason.message : "Unable to load the selected domain.");
          }
        });
      return () => { cancelled = true; };
    }

    if (activeSection !== "domains" && activeSection !== "entities") {
      setDomains([]);
      return () => { cancelled = true; };
    }

    void loadDomainSummaries()
      .then((result) => {
        if (!cancelled) {
          setDomains(result);
          setDomainNames(result.map(domain => ({ id: domain.id, name: domain.name })));
        }
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
    setDomains((current) => {
      const selected = current.find(domain => domain.id === scopeName);
      if (!selected || selected.entities === scopedEntities) return current;
      return current.map((domain) =>
        domain.id === scopeName ? { ...domain, entities: scopedEntities } : domain);
    });
  }, [scopeName, scopedEntities, domains]);
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

  const createDiagramDomain = () => {
    navigate("/metadata/domains/create?section=domains&source=database");
  };

  const saveDiagramDomain = async () => {
    if (!scopeName || activeDomainIsBuiltin) return;
    const scope = domains.find((domain) => domain.name === scopeName);
    if (!scope) {
      setMessage(`Domain "${scopeName}" was not found.`);
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      if (draft && dirty && !draft.name.trim()) {
        setStatus("succeeded");
        setMessage("Entity name is required.");
        return;
      }
      if (draft && dirty && (!draft.fields.length || draft.fields.some((field) => !field.name.trim()))) {
        setStatus("succeeded");
        setMessage("Entity must have at least one field with a name.");
        return;
      }
      const nextDraft = draft && dirty ? {
        ...draft,
        name: draft.name.trim(),
        schema: draft.schema.trim(),
        rawSql: draft.rawSql.trim() || draft.name.trim(),
        fields: draft.fields.map((field) => ({
          ...field,
          name: field.name.trim(),
          dbColumn: field.dbColumn?.trim() || field.name.trim(),
          dataType: toAbstractDataType(field.dataType, field.name),
        })),
        relations: draft.relations,
      } : null;
      const invalidRelation = nextDraft?.relations.find(relation =>
        !relation.refEntity.trim()
        || !relation.refKeys.length
        || relation.refKeys.some(key => !key.dbColumn.trim() || !key.refDbColumn.trim()));
      if (invalidRelation) {
        setStatus("ready");
        setMessage("Every relation must have a reference entity and both From and To columns.");
        return;
      }
      const nextEntities = nextDraft
        ? selectedName
          ? displayedEntities.map((entity) => entity.name === selectedName ? nextDraft : entity)
          : [...displayedEntities, nextDraft]
        : displayedEntities;
      await request(apiUrls.metadata.domainById(scope.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scope.name,
          description: scope.description,
          entities: nextEntities,
        }),
      });
      setScopedEntities(nextEntities);
      setDirty(false);
      dispatch(invalidateQueryMetadata());
      await loadEntities(false, nextDraft?.name || selectedName);
      setSuccessMessage(`Domain "${scope.name}" saved successfully.`);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to save the diagram domain.");
    }
  };

  const reloadDiagramDomain = async () => {
    setMessage("");
    await loadEntities(false, selectedName);
    const result = await loadDomainSummaries();
    setDomains(result);
  };

  const deleteDiagramDomain = async () => {
    if (!scopeName || activeDomainIsBuiltin) return;
    const action = await showMessageBox({
      eyebrow: "DELETE DOMAIN",
      title: `Delete ${scopeName}?`,
      message: `This will permanently delete the ${scopeName} domain and all of its entity definitions.`,
      confirmationText: scopeName,
      confirmationLabel: `Enter ${scopeName} to confirm`,
      actions: [
        { value: "cancel", label: "Cancel", variant: "secondary" },
        { value: "delete", label: "Delete domain", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    setStatus("saving");
    setMessage("");
    try {
      await request(apiUrls.metadata.domainById(scopeName), { method: "DELETE" });
      setDomains((current) => current.filter((domain) => domain.id !== scopeName));
      navigate("/metadata?section=diagram");
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to delete the diagram domain.");
    }
  };

  const save = async (): Promise<boolean> => {
    if (activeDomainIsBuiltin) {
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
      return toAbstractDataType(column?.dataType || field.dataType, field.name);
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
    };
    setStatus("saving");
    setMessage("");
    try {
      if (scopeName && !draft) {
        const scopeResult = await loadDomainSummaries();
        const scope = scopeResult.find((item) => item.name === scopeName);
        if (!scope) throw new Error(`Domain "${scopeName}" was not found.`);
        await request(apiUrls.metadata.domainById(scope.id), {
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
        const scopeResult = await loadDomainSummaries();
        const scope = scopeResult.find((item) => item.name === scopeName);
        if (!scope) throw new Error(`Domain "${scopeName}" was not found.`);
        const nextEntities = selectedName
          ? displayedEntities.map((entity) => entity.name === selectedName ? payload : entity)
          : [...displayedEntities, payload];
        await request(apiUrls.metadata.domainById(scope.id), {
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
      saving: metadataBusy,
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
    if (!name || activeDomainIsBuiltin) return;
    const remaining = displayedEntities
      .filter((entity) => entity.name !== name)
      .map((entity) => ({
        ...entity,
        relations: (entity.relations || []).filter((relation) =>
          relation.refEntity.toLowerCase() !== name.toLowerCase()),
      }));
    setScopedEntities(remaining);
    const next = remaining[0];
    setSelectedName(next?.name || "");
    setDraft(next ? toEditable(next) : null);
    setDirty(true);
    setMessage("");
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
    preserveEntityName = false,
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
        name: preserveEntityName && draft?.name.trim() ? draft.name : table.name,
        schema: table.schema,
        rawSql: rawSqlOverride ?? "",
        fields: table.columns.map((column) => ({
          id: `diagram_${column.name}`,
          name: column.name,
          dbColumn: column.name,
        dataType: toAbstractDataType(column.dataType, column.name),
          isRawSql: false,
        })),
        relations: discoveredRelations,
      });
      setDirty(true);
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
    isBuiltIn: activeDomainIsBuiltin,
    hasDraft: Boolean(draft),
    dirty,
    deleteWithoutConfirmation: activeSection === "diagram",
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
  const toolbarActions = activeSection === "diagram"
    ? <div className="editor-actions" role="toolbar" aria-label="Diagram domain actions">
      {scopeName && activeDomainIsBuiltin && <span className="metadata-editor-heading-status readonly">Built-in - Read Only</span>}
      {canManageCurrentDomain && <button className="icon-button definition-action-button primary" type="button" title="Save domain" aria-label="Save domain" onClick={() => void saveDiagramDomain()} disabled={metadataBusy || !canSaveCurrentDomain}>
        <Icon name="save" size={17} />
      </button>}

      {canManageCurrentDomain && <button className="icon-button definition-action-button danger" type="button" title="Delete domain" aria-label="Delete domain" onClick={() => void deleteDiagramDomain()} disabled={metadataBusy}>
        <Icon name="trash" size={17} />
      </button>}
      {scopeName && <button className="icon-button definition-action-button" type="button" title="Reload domain" aria-label="Reload domain" onClick={() => void reloadDiagramDomain()} disabled={metadataBusy}>
        <Icon name="reset" size={17} />
      </button>}
      {canManageCurrentDomain && <button className="icon-button definition-action-button" type="button" title="Edit domain entities in wizard" aria-label="Edit domain entities in wizard" onClick={() => navigate(`/metadata/domains/edit?section=domains&scope=${encodeURIComponent(scopeName)}&returnSection=diagram`)} disabled={metadataBusy}>
        <Icon name="edit" size={17} />
      </button>}
      <button className="icon-button definition-action-button create" type="button" title="Create domain" aria-label="Create domain" onClick={createDiagramDomain} disabled={metadataBusy}>
        <Icon name="file-plus" size={17} />
      </button>
    </div>
    : null;
  const databaseOptions = Array.from(new Set(displayedEntities.map((entity) => entity.schema).filter(Boolean)));
  const databaseTables = databaseState.schema.tables as DatabaseTableOption[];
  const tableKey = (table: { schema: string; name: string }) =>
    `${(table.schema || "dbo").trim().toLowerCase()}.${table.name.trim().toLowerCase()}`;
  const selectedTable = draft && !entityUsesRawSql(draft, databaseTables)
    ? databaseTables.find((table) => tableKey(table) === selectedTableKey)
      || findEntityTable(draft, databaseTables)
    : undefined;
  useEffect(() => {
    if (!selectedName || !draft || entityUsesRawSql(draft, databaseTables)) return;
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
    }, false, rawSql, true);
  };
  const selectRawSqlMode = () => {
    setSelectedTableKey("");
  };
  const selectDomain = (name: string) => {
    const domain = domainNames.find(item => item.name === name);
    if (!domain) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "entities");
    nextSearchParams.set("scope", domain.id);
    navigate(`/metadata?${nextSearchParams.toString()}`);
  };
  const selectDiagramDomain = (name: string) => {
    const domain = domainNames.find(item => item.name === name);
    if (!domain) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "diagram");
    nextSearchParams.set("scope", domain.id);
    navigate(`/metadata?${nextSearchParams.toString()}`);
  };

  return (
    <>
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "diagram"}>
        <EntityDiagram
          entities={displayedEntities}
          domains={domains}
          domainNames={domainNames}
          activeScopeName={scopeName}
          selectedEntityName={selectedName}
          loading={metadataBusy}
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
              </div>
            </div>
          }
          entityEditor={
            <EntityBuilder
              draft={draft}
              canEdit={Boolean(scopeName) && !activeDomainIsBuiltin}
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
                    const isActive = (scopeName || "All") === scope.id;
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
                <span className={`metadata-editor-heading-status${activeDomainIsBuiltin ? " readonly" : ""}`}>
                  {activeDomainIsBuiltin ? "Read-only" : draft ? "Ready to edit" : "No selection"}
                </span>
              </div>
            </div>
            <EntityBuilder
              draft={draft}
              canEdit={Boolean(scopeName) && !activeDomainIsBuiltin}
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
          active={activeSection === "domains"}
          domains={domains}
        />
      </div>}
      {toolbarHost && createPortal(
        toolbarActions,
        toolbarHost,
      )}
    </>
  );
}
