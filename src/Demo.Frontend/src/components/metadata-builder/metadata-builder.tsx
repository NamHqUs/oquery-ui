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
import { fetchQueryMetadata, metadataEntityFromDto, MetadataEntity, setQueryMetadata, type DomainEntityDto, type DomainRelation } from "../query-builder/query-design/query-builder-slice";
import EntityList from "./entity-definition/entity-list/entity-list";
import EntityBuilder, { type DatabaseTableOption } from "./entity-definition/entity-builder/entity-builder";
import EntityDiagram from "./entity-diagram/entity-diagram";
import { EditableEntity, emptyEntity, findEntityNameProblem, findRelationProblem, pluralize, removeEntityFromRelations, renameEntitiesInRelations, renameEntityInRelations, singularize, toAbstractDataType, toEditable, toEntityPayload, toRelationPayload } from "./types";
import FunctionDefinitionsWorkspace from "../function-definition/function-definition";
import OperatorDefinition from "./operator-definition/operator-definition";
import DomainList, { cloneDomain, type Domain } from "./domain/domain-list";
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
  relations: DomainRelation[];
  canDelete: boolean;
  isBuiltin: boolean;
};
type DomainOption = {
  id: string;
  name: string;
  description: string;
};
type SavedDomainDto = {
  entities: DomainEntityDto[];
  relations: DomainRelation[];
};

function normalizeTablePart(value: string) {
  return value.trim().replace(/[\[\]"`]/g, "").toLowerCase();
}

function entityUsesTable(entity: MetadataEntity, table: { schema: string; name: string }) {
  const tableName = normalizeTablePart(table.name);
  const qualifiedName = `${normalizeTablePart(table.schema || "dbo")}.${tableName}`;
  return [entity.name, entity.dbTable || "", entity.rawSql || ""].some((value) => {
    const normalized = value.trim().toLowerCase();
    return normalized === tableName
      || normalized === qualifiedName
      || normalized.endsWith(`.${tableName}`);
  });
}

function entityUsesRawSql(entity: MetadataEntity, tables: DatabaseTableOption[] = []) {
  const rawSql = entity.rawSql?.trim() || "";
  const dbTable = entity.dbTable?.trim() || "";
  if (entity.fields.some((field) => field.isRawSql)) return true;
  if (!rawSql || rawSql === entity.name.trim() || dbTable) return false;
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
  const domains = await request<DomainOption[]>(apiUrls.metadata.domainNamesWithDescriptions);
  return domains.map(domain => ({
    ...domain,
    entities: [],
    relations: [],
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
  const metadataRelations = useSelector((state: RootState) => state.queryBuilder.metadataRelations);
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
  const saveInProgressRef = useRef(false);
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
  const applySavedDomain = (saved: SavedDomainDto, preferredName: string) => {
    const savedEntities = saved.entities.map(metadataEntityFromDto);
    setDomainEntities(savedEntities);
    setDomainRelations(saved.relations);
    dispatch(setQueryMetadata({ entities: savedEntities, relations: saved.relations }));
    const selectedEntity = savedEntities.find((entity) => entity.name === preferredName);
    setSelectedName(selectedEntity?.name || "");
    setDraft(selectedEntity ? toEditable(selectedEntity) : null);
    setDirty(false);
    setStatus("succeeded");
  };
  const handleDomainChanged = (domain: Domain, pendingSave = false) => {
    setDomainEntities(domain.entities);
    setDomainRelations(domain.relations);
    setLoadedDomainId(domain.id);
    if (pendingSave) {
      setSelectedName("");
      setDraft(null);
      setDirty(true);
    } else {
      setDirty(false);
    }
    dispatch(setQueryMetadata({ entities: domain.entities, relations: domain.relations }));
    setDomainOptions((current) => current.map((item) =>
      item.id === domain.id ? { ...item, name: domain.name, description: domain.description } : item));
    setDomains((current) => current.some((item) => item.id === domain.id)
      ? current.map((item) => item.id === domain.id ? domain : item)
      : [...current, domain]);
    skipNextMetadataLoadRef.current = true;
  };
  const [dirty, setDirty] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [domains, setDomains] = useState<DomainSummary[]>([]);
  const [domainOptions, setDomainOptions] = useState<DomainOption[]>([]);
  const [domainsExpanded, setDomainsExpanded] = useState(true);
  const [domainEntities, setDomainEntities] = useState<MetadataEntity[] | null>(null);
  const [domainRelations, setDomainRelations] = useState<DomainRelation[] | null>(null);
  const [loadedDomainId, setLoadedDomainId] = useState<string | undefined>();
  const skipNextMetadataLoadRef = useRef(false);
  const sectionNavigationRef = useRef<(section: MetadataSection) => void>(() => undefined);
  const [pendingToolbarSection, setPendingToolbarSection] = useState<MetadataSection | null>(null);
  useEffect(() => setToolbarHost(document.getElementById("metadata-toolbar-actions")), []);
  useEffect(() => { selectedNameRef.current = selectedName; }, [selectedName]);
  const requestedSection = searchParams.get("section")
    ?? (location.pathname === "/metadata/domains/create" ? "domains" : null);
  const domainId = searchParams.get("domain") || undefined;
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
        && (location.pathname === "/metadata/domains/create" || searchParams.has("domain"))))
      ) return;
    flushSync(() => setPendingToolbarSection(section));
    if (!(await resolveAllDirtyChanges(activeSection))) {
      setPendingToolbarSection(null);
      return;
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", section);
    if (section === "domains" && location.pathname === "/metadata/domains/create") {
      nextSearchParams.delete("domain");
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
  const displayedEntities = domainEntities ?? entities;
  const displayedRelations = domainRelations ?? metadataRelations;
  const editorEntities = draft && selectedName
    ? displayedEntities.map((entity) => entity.name === selectedName ? draft : entity)
    : displayedEntities;
  const activeDomainIsBuiltin = !domainId
    || domains.find((domain) => domain.id === domainId)?.isBuiltin === true;
  const metadataBusy = status === "loading"
    || status === "saving"
    || loadedDomainId !== domainId;
  const canManageCurrentDomain = Boolean(domainId) && !activeDomainIsBuiltin;
  const canSaveCurrentDomain = canManageCurrentDomain && (Boolean(draft) || dirty);
  const editCurrentDomain = () => {
    if (!domainId) return;
    const domain = domains.find(item => item.id === domainId);
    if (!domain) return;
    const currentEntities = draft && dirty && selectedName
      ? displayedEntities.map(entity => entity.name === selectedName ? {
        ...draft,
        name: draft.name.trim(),
        schema: draft.schema.trim(),
        rawSql: draft.rawSql.trim() || draft.name.trim(),
        fields: draft.fields.map(field => ({ ...field })),
      } : entity)
      : displayedEntities;
    navigate(`/metadata/domains/edit?section=domains&domain=${encodeURIComponent(domainId)}&returnSection=diagram`, {
      state: {
        domain: cloneDomain({
          ...domain,
          entities: currentEntities,
          relations: displayedRelations,
        }),
      },
    });
  };
  useDefinitionUnsavedWarning(dirty);

  const loadEntities = async (selectFirst = false, preferredName = selectedName) => {
    setStatus("loading");
    setMessage("");
    try {
      const result = await dispatch(fetchQueryMetadata(domainId));
      if (!fetchQueryMetadata.fulfilled.match(result)) {
        if (result.meta.condition) return false;
        throw new Error(String(result.payload || "Unable to load metadata."));
      }
      const { entities: loadedEntities, relations: loadedRelations } = result.payload;
      setDomainEntities(domainId ? loadedEntities : null);
      setDomainRelations(domainId ? loadedRelations : null);
      setLoadedDomainId(domainId);
      const preferred = loadedEntities.find((entity) => entity.name === preferredName);
      if (selectFirst || !preferredName || !preferred) {
        const next = selectFirst ? loadedEntities[0] : preferred;
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
      setLoadedDomainId(domainId);
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to load metadata.");
      return false;
    }
  };

  useEffect(() => {
    if (activeSection !== "diagram" && activeSection !== "entities") return;
    if (skipNextMetadataLoadRef.current && domainId) {
      skipNextMetadataLoadRef.current = false;
      return;
    }
    void loadEntities(true);
  }, [activeSection, domainId]);
  useEffect(() => {
    let cancelled = false;
    if (activeSection === "diagram") {
      void request<DomainOption[]>(apiUrls.metadata.domainNamesWithDescriptions)
        .then((options) => {
          if (!cancelled) {
            setDomainOptions(options);
            const selectedDomain = options.find(domain => domain.id === domainId);
            setDomains(selectedDomain
              ? [{
                  ...selectedDomain,
                  entities: [],
                  relations: [],
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

    const routedDomain = (location.state as { domain?: DomainSummary } | null)?.domain;
    if (location.pathname === "/metadata/domains/edit"
      && domainId
      && routedDomain?.id === domainId) {
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
          setDomainOptions(result.map(domain => ({ id: domain.id, name: domain.name, description: domain.description })));
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
    if (activeSection !== "diagram" || !domainId) return;
    const selectedDomain = domainOptions.find(domain => domain.id === domainId);
    if (!selectedDomain) return;
    setDomains((current) => {
      const existing = current.find(domain => domain.id === domainId);
      if (existing) return current;
      return [{
        ...selectedDomain,
        entities: [],
        relations: [],
        canDelete: selectedDomain.id !== "All",
        isBuiltin: selectedDomain.id === "All",
      }];
    });
  }, [activeSection, domainId, domainOptions]);
  useEffect(() => {
    if (!domainId || !domainEntities || !domainRelations) return;
    setDomains((current) => {
      const selected = current.find(domain => domain.id === domainId);
      if (!selected || (selected.entities === domainEntities && selected.relations === domainRelations)) return current;
      return current.map((domain) =>
        domain.id === domainId ? { ...domain, entities: domainEntities, relations: domainRelations } : domain);
    });
  }, [domainId, domainEntities, domainRelations, domains]);
  useEffect(() => {
    if (databaseState.connectionStatus === "succeeded" && databaseState.schemaStatus === "idle") {
      dispatch(fetchDbSchema());
    }
  }, [databaseState.connectionStatus, databaseState.schemaStatus, dispatch]);

  const discardChanges = () => {
    if (domainId) {
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
    navigate("/metadata/domains/create?section=domains&source=database&returnSection=diagram");
  };

  const saveDiagramDomain = async () => {
    if (!domainId || activeDomainIsBuiltin) return;
    if (saveInProgressRef.current) return;
    const domain = domains.find((domain) => domain.id === domainId);
    if (!domain) {
      setMessage(`Domain "${domainId}" was not found.`);
      return;
    }
    saveInProgressRef.current = true;
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
      } : null;
      const currentEntity = draft && selectedName
        ? displayedEntities.find((entity) => entity.name === selectedName)
          ?? displayedEntities.find((entity) =>
            entity.rawSql === draft.rawSql && (entity.schema || "dbo") === (draft.schema || "dbo"))
        : undefined;
      const currentEntityName = currentEntity?.name;
      const nextEntities = nextDraft
        ? currentEntityName
          ? displayedEntities.map((entity) => entity.name === currentEntityName ? nextDraft : entity)
          : [...displayedEntities, nextDraft]
        : displayedEntities;
      const entityRenames = new Map<string, string>();
      displayedEntities.forEach((entity, index) => {
        const nextEntity = nextEntities[index];
        if (nextEntity && entity.name !== nextEntity.name) {
          entityRenames.set(entity.name, nextEntity.name);
          if (entity.dbTable) entityRenames.set(entity.dbTable, nextEntity.name);
          if (entity.rawSql) entityRenames.set(entity.rawSql, nextEntity.name);
        }
      });
      const nextRelations = renameEntitiesInRelations(displayedRelations, entityRenames);
      const entityNameProblem = findEntityNameProblem(nextEntities);
      if (entityNameProblem) {
        setStatus("ready");
        setMessage(entityNameProblem);
        return;
      }
      const relationProblem = findRelationProblem(nextEntities, nextRelations);
      if (relationProblem) {
        setStatus("ready");
        setMessage(relationProblem);
        return;
      }
      const saved = await request<SavedDomainDto>(apiUrls.metadata.domainById(domain.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: domain.name,
          description: domain.description,
          entities: nextEntities.map(toEntityPayload),
          relations: toRelationPayload(nextRelations),
        }),
      });
      applySavedDomain(saved, nextDraft?.name || selectedName);
      setSuccessMessage(`Domain "${domain.name}" saved successfully.`);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to save the diagram domain.");
    } finally {
      saveInProgressRef.current = false;
    }
  };

  const reloadDiagramDomain = async () => {
    setMessage("");
    await loadEntities(false, selectedName);
    const result = await loadDomainSummaries();
    setDomains(result);
  };

  const deleteDiagramDomain = async () => {
    if (!domainId || activeDomainIsBuiltin) return;
    const action = await showMessageBox({
      eyebrow: "DELETE DOMAIN",
      title: `Delete ${domainId}?`,
      message: `This will permanently delete the ${domainId} domain and all of its entity definitions.`,
      confirmationText: domainId,
      confirmationLabel: `Enter ${domainId} to confirm`,
      actions: [
        { value: "cancel", label: "Cancel", variant: "secondary" },
        { value: "delete", label: "Delete domain", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    setStatus("saving");
    setMessage("");
    try {
      await request(apiUrls.metadata.domainById(domainId), { method: "DELETE" });
      const deletedIndex = domainOptions.findIndex((domain) => domain.id === domainId);
      const nextDomain = domainOptions[deletedIndex + 1] || domainOptions[deletedIndex - 1];
      setDomainOptions((current) => current.filter((domain) => domain.id !== domainId));
      setDomains((current) => current.filter((domain) => domain.id !== domainId));
      navigate(nextDomain
        ? `/metadata?section=diagram&domain=${encodeURIComponent(nextDomain.id)}`
        : "/metadata?section=diagram");
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
    if (saveInProgressRef.current) return false;
    saveInProgressRef.current = true;
    const rawSql = draft.rawSql.trim();
    const payload: MetadataEntity = {
      name: draft.name.trim(),
      schema: draft.schema.trim(),
      rawSql: rawSql || draft.name.trim(),
      fields: draft.fields.map((field) => ({
        name: field.name.trim(),
        dbColumn: field.dbColumn?.trim() || field.name.trim(),
        dataType: fieldDataType(field),
        isRawSql: fieldIsRawSql(field),
      })),
    };
    setStatus("saving");
    setMessage("");
    try {
      if (domainId && !draft) {
        const domain = domains.find((item) => item.id === domainId);
        if (!domain) throw new Error(`Domain "${domainId}" was not found.`);
        const entityNameProblem = findEntityNameProblem(displayedEntities);
        if (entityNameProblem) throw new Error(entityNameProblem);
        const relationProblem = findRelationProblem(displayedEntities, displayedRelations);
        if (relationProblem) throw new Error(relationProblem);
        const saved = await request<SavedDomainDto>(apiUrls.metadata.domainById(domain.id), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: domain.name,
            description: domain.description,
            entities: displayedEntities.map(toEntityPayload),
            relations: toRelationPayload(displayedRelations),
          }),
        });
        applySavedDomain(saved, selectedName);
        return true;
      }
      if (domainId) {
        const domain = domains.find((item) => item.id === domainId);
        if (!domain) throw new Error(`Domain "${domainId}" was not found.`);
        const currentEntity = selectedName
          ? displayedEntities.find((entity) => entity.name === selectedName)
            ?? displayedEntities.find((entity) =>
              entity.rawSql === draft.rawSql && (entity.schema || "dbo") === (draft.schema || "dbo"))
          : undefined;
        const currentEntityName = currentEntity?.name;
        const nextEntities = currentEntityName
          ? displayedEntities.map((entity) => entity.name === currentEntityName ? payload : entity)
          : [...displayedEntities, payload];
        const entityRenames = new Map<string, string>();
        displayedEntities.forEach((entity, index) => {
          const nextEntity = nextEntities[index];
          if (nextEntity && entity.name !== nextEntity.name) {
            entityRenames.set(entity.name, nextEntity.name);
            if (entity.dbTable) entityRenames.set(entity.dbTable, nextEntity.name);
            if (entity.rawSql) entityRenames.set(entity.rawSql, nextEntity.name);
          }
        });
        const nextRelations = renameEntitiesInRelations(displayedRelations, entityRenames);
        const entityNameProblem = findEntityNameProblem(nextEntities);
        if (entityNameProblem) throw new Error(entityNameProblem);
        const relationProblem = findRelationProblem(nextEntities, nextRelations);
        if (relationProblem) throw new Error(relationProblem);
        const saved = await request<SavedDomainDto>(apiUrls.metadata.domainById(domain.id), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: domain.name,
            description: domain.description,
            entities: nextEntities.map(toEntityPayload),
            relations: toRelationPayload(nextRelations),
          }),
        });
        applySavedDomain(saved, payload.name);
      }
      if (domainId) {
        setSuccessMessage(`Domain "${domainId}" saved successfully.`);
      }
      return true;
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to save metadata.");
      return false;
    } finally {
      saveInProgressRef.current = false;
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
    const nextDraft = update(draft);
    setDraft(nextDraft);
    if (nextDraft.name !== draft.name) {
      setDomainRelations((current) => renameEntityInRelations(current ?? metadataRelations, draft.name, nextDraft.name));
    }
    setDirty(true);
  };

  const updateRelations = (update: (relations: DomainRelation[]) => DomainRelation[]) => {
    setDomainRelations((current) => update(current ?? metadataRelations));
    setDirty(true);
  };

  const remove = async () => {
    const name = selectedNameRef.current;
    if (!name || activeDomainIsBuiltin) return;
    const remaining = displayedEntities.filter((entity) => entity.name !== name);
    setDomainEntities(remaining);
    setDomainRelations(removeEntityFromRelations(displayedRelations, name));
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
    const entitiesWithCurrentDraft = domainId && draft && selectedName
      ? displayedEntities.map((entity) => entity.name === selectedName ? draft : entity)
      : displayedEntities;
    if (entitiesWithCurrentDraft !== displayedEntities && domainId) {
      setDomainEntities(entitiesWithCurrentDraft);
    }
    setSelectedTableKey(tableKey(table));
    const existing = entitiesWithCurrentDraft.find((entity) =>
      entity.name === table.name && (entity.schema || "dbo") === (table.schema || "dbo"),
    );
    const entityName = existing?.name
      ?? (preserveEntityName && draft?.name.trim() ? draft.name : table.name);
    const discoveredRelations = (databaseState.schema.relationships as DatabaseRelationship[])
      .filter((relation) =>
        normalizeTablePart(relation.sourceSchema || "dbo") === normalizeTablePart(table.schema || "dbo")
        && normalizeTablePart(relation.sourceTable) === normalizeTablePart(table.name),
      )
      .flatMap((relation): DomainRelation[] => {
        const relatedEntities = entitiesWithCurrentDraft.filter((entity) =>
          entityUsesTable(entity, { schema: relation.targetSchema, name: relation.targetTable })
          && !entityUsesTable(entity, table),
        );
        return relatedEntities.map((entity) => ({
          sourceEntity: entityName,
          sourceRelationName: singularize(entity.name),
          sourceFields: [...relation.sourceColumns],
          targetEntity: entity.name,
          targetRelationName: pluralize(entityName),
          targetFields: [...relation.targetColumns],
        }));
      });
    const sameRelation = (left: DomainRelation, right: DomainRelation) =>
      left.sourceEntity === right.sourceEntity
      && left.targetEntity === right.targetEntity
      && left.sourceFields.join(",") === right.sourceFields.join(",")
      && left.targetFields.join(",") === right.targetFields.join(",");
    const newRelations = discoveredRelations.filter((relation) =>
      !displayedRelations.some((existingRelation) => sameRelation(existingRelation, relation)));
    if (newRelations.length) {
      setDomainRelations((current) => [...(current ?? metadataRelations), ...newRelations]);
    }
    if (existing) {
      setSelectedName(existing.name);
      const existingDraft = toEditable(existing);
      setDraft({ ...existingDraft, rawSql: rawSqlOverride ?? existingDraft.rawSql });
      setDirty(newRelations.length > 0);
    } else {
      setSelectedName("");
      setDraft({
        name: entityName,
        schema: table.schema,
        rawSql: rawSqlOverride ?? "",
        fields: table.columns.map((column) => ({
          id: `diagram_${column.name}`,
          name: column.name,
          dbColumn: column.name,
        dataType: toAbstractDataType(column.dataType, column.name),
          isRawSql: false,
        })),
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
      {domainId && activeDomainIsBuiltin && <span className="metadata-editor-heading-status readonly">Built-in - Read Only</span>}
      {canManageCurrentDomain && <button className="icon-button definition-action-button primary" type="button" title="Save domain" aria-label="Save domain" onClick={() => void saveDiagramDomain()} disabled={metadataBusy || !canSaveCurrentDomain}>
        <Icon name="save" size={17} />
      </button>}

      {canManageCurrentDomain && <button className="icon-button definition-action-button danger" type="button" title="Delete domain" aria-label="Delete domain" onClick={() => void deleteDiagramDomain()} disabled={metadataBusy}>
        <Icon name="trash" size={17} />
      </button>}
      {domainId && <button className="icon-button definition-action-button" type="button" title="Reload domain" aria-label="Reload domain" onClick={() => void reloadDiagramDomain()} disabled={metadataBusy}>
        <Icon name="reset" size={17} />
      </button>}
      {canManageCurrentDomain && <button className="icon-button definition-action-button" type="button" title="Edit domain entities in wizard" aria-label="Edit domain entities in wizard" onClick={editCurrentDomain} disabled={metadataBusy}>
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
  const selectDomain = (domainId: string) => {
    const domain = domainOptions.find(item => item.id === domainId);
    if (!domain) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "entities");
    nextSearchParams.set("domain", domain.id);
    navigate(`/metadata?${nextSearchParams.toString()}`);
  };
  const selectDiagramDomain = (domainId: string) => {
    const domain = domainOptions.find(item => item.id === domainId)
      || domainOptions.find(item => item.name === domainId);
    if (!domain) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("section", "diagram");
    nextSearchParams.set("domain", domain.id);
    navigate(`/metadata?${nextSearchParams.toString()}`);
  };

  return (
    <>
      {!entityOnly && <div className="metadata-workspace-panel" hidden={activeSection !== "diagram"}>
        <EntityDiagram
          entities={displayedEntities}
          relations={displayedRelations}
          domains={domains}
          domainOptions={domainOptions}
          activeDomainId={domainId}
          selectedEntityName={selectedName}
          loading={metadataBusy}
          editingEntity={draft}
          editingEntityName={selectedName}
          onDraftChange={updateDraft}
          onRelationsChange={updateRelations}
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
              canEdit={Boolean(domainId) && !activeDomainIsBuiltin}
              message={message}
              messageKind={messageKind}
              allEntities={editorEntities}
              domainRelations={displayedRelations}
              onDraftChange={updateDraft}
              onRelationsChange={updateRelations}
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
              <div className="metadata-domain-navigation">
                <button
                  type="button"
                  className={`metadata-domain-navigation-heading${domainsExpanded ? "" : " collapsed"}`}
                  aria-expanded={domainsExpanded}
                  aria-controls="metadata-domain-navigation"
                  onClick={() => setDomainsExpanded((expanded) => !expanded)}
                >
                  <span className="section-kicker">DOMAINS</span>
                  <Icon name="chevron-down" size={14} />
                </button>
                <nav id="metadata-domain-navigation" aria-label="Entity definition domains">
                  {domains.map((domain) => {
                    const isActive = (domainId || "All") === domain.id;
                    if (!domainsExpanded && !isActive) return null;
                    return (
                      <button
                        type="button"
                        className={`metadata-domain-navigation-item${isActive ? " active" : ""}`}
                        aria-pressed={isActive}
                        key={domain.name}
                        onClick={() => selectDomain(domain.id)}
                      >
                        <span className="metadata-domain-navigation-icon"><Icon name="folder" size={14} /></span>
                        <span className="metadata-domain-navigation-name">{domain.name}</span>
                        <span className="metadata-domain-navigation-count">{domain.entities.length}</span>
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
              canEdit={Boolean(domainId) && !activeDomainIsBuiltin}
              message={message}
              messageKind={messageKind}
              allEntities={editorEntities}
              domainRelations={displayedRelations}
              onDraftChange={updateDraft}
              onRelationsChange={updateRelations}
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
          onDomainChanged={handleDomainChanged}
        />
      </div>}
      {toolbarHost && createPortal(
        toolbarActions,
        toolbarHost,
      )}
    </>
  );
}
