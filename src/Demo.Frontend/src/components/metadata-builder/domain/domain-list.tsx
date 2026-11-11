import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import Icon, { type IconName } from "../../icon/icon";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import DomainWizard, { type WizardSource } from "./domain-wizard";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import MetadataSidebar, { type MetadataSidebarGroup } from "../metadata-sidebar/metadata-sidebar";
import EntityBuilder, { type DatabaseTableOption } from "../entity-definition/entity-builder/entity-builder";
import DatabaseConnection from "../../data-sources/database-connection/database-connection";
import { emptyEntity, findRelationProblem, pluralize, removeEntityFromRelations, renameEntitiesInRelations, renameEntityInRelations, singularize, toAbstractDataType, toEditable, toEntityPayload, toRelationPayload, type EditableEntity } from "../types";
import { invalidateQueryMetadata, metadataEntityFromDto, relationsForEntity, type DomainEntityDto, type DomainRelation, type MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import { fetchDbSchema } from "../../data-sources/database-slice";
import type { RootState } from "../../../store/store";
import { apiUrls } from "../../../const/api-urls";
import { formatApiError } from "../../query-builder/query-design/api-error";
import { useMessageBox } from "../../message-box/message-box";
import MarkdownDescription from "./markdown-description";
import "./domain-list.css";

export type Domain = {
  id: string;
  name: string;
  description: string;
  entities: MetadataEntity[];
  relations: DomainRelation[];
  canDelete: boolean;
  isBuiltin: boolean;
};
export const cloneDomain = (domain: Domain): Domain => ({
  ...domain,
  entities: domain.entities.map(entity => ({
    ...entity,
    fields: entity.fields.map(field => ({ ...field })),
  })),
  relations: domain.relations.map(relation => ({
    ...relation,
    sourceFields: [...relation.sourceFields],
    targetFields: [...relation.targetFields],
  })),
});
type DomainDto = Omit<Domain, "entities"> & { entities: DomainEntityDto[] };
const toDomain = (dto: DomainDto): Domain => ({ ...dto, entities: dto.entities.map(metadataEntityFromDto) });
const normalizeEntityDraft = (draft: EditableEntity): EditableEntity => ({
  ...draft,
  name: draft.name.trim(),
  fields: draft.fields.map(field => ({ ...field, name: field.name.trim() })),
});
const sameFields = (left: string[], right: string[]) => JSON.stringify(left) === JSON.stringify(right);
type DatabaseTable = { schema: string; name: string; columns: { name: string; dataType: string }[] };
type DatabaseRelationship = { name: string; sourceSchema: string; sourceTable: string; sourceColumns: string[]; targetSchema: string; targetTable: string; targetColumns: string[]; isUnique: boolean };
type Step = 1 | 2 | 3;
type ViewMode = "list" | "wizard" | "detail";
const CREATE_DOMAIN_PATH = "/metadata/domains/create";
const EDIT_DOMAIN_PATH = "/metadata/domains/edit";
const DESCRIPTION_PREVIEW_LENGTH = 240;

function getPlainDescription(description: string) {
  return description
    .replace(/[`*_#>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getDescriptionPreview(description: string) {
  const plainText = getPlainDescription(description);
  return plainText.length > DESCRIPTION_PREVIEW_LENGTH
    ? `${plainText.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}...`
    : plainText;
}

function hasDescriptionPreviewOverflow(description: string) {
  return getPlainDescription(description).length > DESCRIPTION_PREVIEW_LENGTH;
}

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
const normalizeTablePart = (value: string) => value.trim().replace(/[\[\]"`]/g, "").toLowerCase();
const entityMatchesTable = (entity: MetadataEntity, table: DatabaseTable) => {
  const tableName = normalizeTablePart(table.name);
  const tableSchema = normalizeTablePart(table.schema || "dbo");
  const qualifiedName = `${tableSchema}.${tableName}`;
  return [entity.dbTable || "", entity.rawSql || "", entity.name].some(value => {
    const normalized = normalizeTablePart(value);
    return normalized === tableName
      || normalized === qualifiedName
      || normalized.endsWith(`.${tableName}`);
  });
};
const existingTableKeys = (domain: Domain, tables: DatabaseTable[]) =>
  domain.entities
    .map(entity => tables.find(table => entityMatchesTable(entity, table)))
    .filter((table): table is DatabaseTable => Boolean(table))
    .map(tableKey);
const findEntityForTable = (domain: Domain, table: DatabaseTable) =>
  domain.entities.find(entity => entityMatchesTable(entity, table));
const relationFieldsMatch = (existing: DomainRelation, relation: DatabaseRelationship) => {
  if (sameFields(existing.sourceFields, relation.sourceColumns) && sameFields(existing.targetFields, relation.targetColumns)) return true;
  return existing.sourceEntity === existing.targetEntity
    && sameFields(existing.sourceFields, relation.targetColumns)
    && sameFields(existing.targetFields, relation.sourceColumns);
};
const findExistingRelation = (domain: Domain, relation: DatabaseRelationship) =>
  domain.relations.find(existing => {
    const source = domain.entities.find(entity => entity.name === existing.sourceEntity);
    const target = domain.entities.find(entity => entity.name === existing.targetEntity);
    return Boolean(
      source
      && target
      && entityMatchesTable(source, { schema: relation.sourceSchema, name: relation.sourceTable, columns: [] })
      && entityMatchesTable(target, { schema: relation.targetSchema, name: relation.targetTable, columns: [] })
      && relationFieldsMatch(existing, relation),
    );
  });
const relationMatchesDatabaseRelation = (domain: Domain, relation: DatabaseRelationship) =>
  Boolean(findExistingRelation(domain, relation));
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
  domains,
  onDomainChanged,
}: {
  active: boolean;
  domains: Domain[];
  onDomainChanged?: (domain: Domain, pendingSave?: boolean) => void;
}) {
  const [domainItems, setDomainItems] = useState<Domain[]>(() => domains.map(cloneDomain));
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const isEditRoute = location.pathname === EDIT_DOMAIN_PATH || Boolean(new URLSearchParams(location.search).get("edit"));
  const { schema, schemaStatus, connectionStatus } = useSelector((state: RootState) => state.database);
  const [selectedName, setSelectedName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [sourceSelectionInitialized, setSourceSelectionInitialized] = useState(false);
  const [removedEntityNames, setRemovedEntityNames] = useState<string[]>([]);
  const [uploadedTables, setUploadedTables] = useState<DatabaseTable[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [fieldNames, setFieldNames] = useState<Record<string, Record<string, string>>>({});
  const [collapsedEntities, setCollapsedEntities] = useState<Record<string, boolean>>({});
  const [relationNames, setRelationNames] = useState<Record<string, { lookup: string; collection: string }>>({});
  const [tableFilter, setTableFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [entityFilter, setEntityFilter] = useState("");
  const [selectedEntityName, setSelectedEntityName] = useState("");
  const [entityDraft, setEntityDraft] = useState<EditableEntity | null>(null);
  const [entityDirty, setEntityDirty] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [wizardSource, setWizardSource] = useState<WizardSource>("database");
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(location.pathname === CREATE_DOMAIN_PATH || isEditRoute ? "wizard" : "list");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const editDomainRequestRef = useRef<string | null>(null);
  const panel = useResizablePanel("domain");
  const showMessageBox = useMessageBox();
  const toggleDescription = (name: string) => {
    setExpandedDescriptions(current => ({ ...current, [name]: !current[name] }));
  };
  useEffect(() => setToolbarHost(document.getElementById("metadata-toolbar-actions")), []);
  useEffect(() => {
    if (!active) return;
    setViewMode(location.pathname === CREATE_DOMAIN_PATH || isEditRoute ? "wizard" : "list");
    if (location.pathname === CREATE_DOMAIN_PATH) {
      const source = new URLSearchParams(location.search).get("source");
      setWizardSource(source === "file" ? "file" : "database");
      setSelectedName("");
      setDraftName("");
      setDraftDescription("");
      setSelectedEntityName("");
      setEntityDraft(null);
      setEntityDirty(false);
      setSelectedTables([]);
      setSourceSelectionInitialized(true);
      setRemovedEntityNames([]);
      setUploadedTables([]);
      setSelectedColumns({});
      setEntityNames({});
      setFieldNames({});
      setCollapsedEntities({});
      setRelationNames({});
      setStep(1);
    }
    if (isEditRoute) {
      setWizardSource("database");
      setSelectedTables([]);
      setSourceSelectionInitialized(false);
      setRemovedEntityNames([]);
      setUploadedTables([]);
      setSelectedColumns({});
      setEntityNames({});
      setFieldNames({});
      setCollapsedEntities({});
      setRelationNames({});
      setTableFilter("");
      setStep(1);
      setError("");
    }
  }, [active, location.pathname, location.search]);

  const selected = domainItems.find(domain => domain.id === selectedName);
  const entityNameFor = (table: DatabaseTable) => {
    const key = tableKey(table);
    return entityNames[key] ?? (selected && findEntityForTable(selected, table)?.name) ?? table.name;
  };
  const relationNameDefaults = (relation: DatabaseRelationship) => {
    const existing = selected && findExistingRelation(selected, relation);
    return {
      lookup: existing ? existing.sourceRelationName : singularize(relation.targetTable),
      collection: existing ? existing.targetRelationName : pluralize(relation.sourceTable),
    };
  };
  const load = async () => {
    setStatus("loading");
    setError("");
    try {
      if (!isEditRoute) editDomainRequestRef.current = null;
      const routedDomain = (location.state as { domain?: Domain } | null)?.domain;
      const domainResult = routedDomain
        ? domains.some(domain => domain.id === routedDomain.id)
          ? domains.map(domain => domain.id === routedDomain.id ? routedDomain : domain)
          : [...domains, routedDomain]
        : domains;
      const routeDomainId = new URLSearchParams(location.search).get("domain")
        || new URLSearchParams(location.search).get("edit");
      const requestedDomain = routeDomainId || selectedName;
      if (requestedDomain && location.pathname !== CREATE_DOMAIN_PATH) {
        const summary = domainResult.find(domain => domain.id === requestedDomain);
        const shouldRefreshEditDomain = Boolean(
          summary
          && isEditRoute
          && !routedDomain
          && editDomainRequestRef.current !== requestedDomain,
        );
        if (summary && isEditRoute && !shouldRefreshEditDomain && !routedDomain) return;
        if (shouldRefreshEditDomain) editDomainRequestRef.current = requestedDomain;
        setDomainItems(domainResult);
        const refreshed = summary && isEditRoute
          ? toDomain(await request<DomainDto>(apiUrls.metadata.domainById(summary.id)))
          : summary;
        if (refreshed) {
          const domain = refreshed;
          setDomainItems(domainResult.map(item => item.id === domain.id ? { ...item, ...domain } : item));
          setSelectedName(domain.id);
          setDraftName(domain.name);
          setDraftDescription(domain.description || "");
          const entity = domain.entities.find(item => item.name === selectedEntityName) || domain.entities[0];
          setSelectedEntityName(entity?.name || "");
          setEntityDraft(entity ? toEditable(entity) : null);
          setEntityDirty(false);
        }
      } else {
        setDomainItems(domainResult);
      }
    } catch (reason) {
      if (isEditRoute) editDomainRequestRef.current = null;
      setError(reason instanceof Error ? reason.message : "Unable to load domains and database tables.");
    } finally {
      setStatus("ready");
    }
  };
  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, location.pathname, location.search, domains]);
  useEffect(() => {
    if (schemaStatus === "idle") void dispatch(fetchDbSchema());
  }, [dispatch, schemaStatus]);
  useEffect(() => {
    if (!isEditRoute
      || wizardSource !== "database"
      || sourceSelectionInitialized
      || !selected
      || !schema.tables.length) return;
    const existingKeys = existingTableKeys(selected, schema.tables);
    setSelectedTables(existingKeys);
    setSelectedColumns(Object.fromEntries(existingKeys.map(key => {
      const table = schema.tables.find(candidate => tableKey(candidate) === key);
      return [key, table?.columns.map(column => column.name) || []];
    })));
    setSourceSelectionInitialized(true);
  }, [location.pathname, schema.tables, selected, sourceSelectionInitialized, wizardSource]);

  const selectDomain = (domain: Domain) => {
    navigate(`/metadata?section=diagram&domain=${encodeURIComponent(domain.id)}`);
    setSelectedName(domain.id);
    setDraftName(domain.name);
    setDraftDescription(domain.description || "");
    const firstEntity = domain.entities[0];
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
    setSuccessMessage("");
  };
  useEffect(() => {
    if (!active || status === "loading" || location.pathname === CREATE_DOMAIN_PATH) return;
    const routeDomainId = new URLSearchParams(location.search).get("domain");
    if (!routeDomainId) {
      setSelectedName("");
      setEntityDraft(null);
      return;
    }
    const routeDomain = domainItems.find(domain => domain.id === routeDomainId);
    if (!routeDomain) return;
    if (routeDomain.id !== routeDomainId) {
      const nextSearchParams = new URLSearchParams(location.search);
      nextSearchParams.set("domain", routeDomain.id);
      navigate(`${location.pathname}?${nextSearchParams.toString()}`, { replace: true });
      return;
    }
    if (routeDomain.id === selectedName) return;
    setSelectedName(routeDomain.id);
    setDraftName(routeDomain.name);
    setDraftDescription(routeDomain.description || "");
    const firstEntity = routeDomain.entities[0];
    setSelectedEntityName(firstEntity?.name || "");
    setEntityDraft(firstEntity ? toEditable(firstEntity) : null);
    setEntityDirty(false);
  }, [active, location.pathname, location.search, domainItems, selectedName, status]);
  const createDomain = (source: WizardSource = "database") => {
    navigate(`${CREATE_DOMAIN_PATH}?section=domains&source=${source}`);
    setViewMode("wizard");
    setWizardSource(source);
    setSelectedName("");
    if (!selected) {
      setDraftName("");
      setDraftDescription("");
    }
    setSelectedEntityName("");
    setEntityDraft(null);
    setEntityDirty(false);
    setSelectedTables([]);
    setRemovedEntityNames([]);
    setSelectedColumns({});
    setEntityNames({});
    setFieldNames({});
    setCollapsedEntities({});
    setRelationNames({});
    setTableFilter("");
    setStep(1);
    setError("");
    setSuccessMessage("");
  };
  const editDomain = (domain: Domain) => {
    if (domain.isBuiltin) return;
    navigate(`/metadata?section=diagram&edit=${encodeURIComponent(domain.id)}`);
    setViewMode("wizard");
    setSelectedName(domain.id);
    setDraftName(domain.name);
    setDraftDescription(domain.description || "");
    setSelectedEntityName(domain.entities[0]?.name || "");
    setEntityDraft(domain.entities[0] ? toEditable(domain.entities[0]) : null);
    setRemovedEntityNames([]);
    const existingKeys = existingTableKeys(domain, schema.tables);
    setSelectedTables(existingKeys);
    setSelectedColumns(Object.fromEntries(existingKeys.map(key => {
      const table = schema.tables.find(candidate => tableKey(candidate) === key);
      return [key, table?.columns.map(column => column.name) || []];
    })));
    setEntityNames({});
    setSourceSelectionInitialized(schema.tables.length > 0);
    setStep(1);
    setError("");
    setSuccessMessage("");
  };
  const updateSelectedDomain = (updater: (domain: Domain) => Domain) => {
    setDomainItems(current => current.map(domain => domain.id === selectedName ? updater(domain) : domain));
  };
  const selectEntity = (entity: MetadataEntity) => {
    if (selected && entityDraft && entityDraft.name !== selectedEntityName) {
      const draftName = entityDraft.name;
      updateSelectedDomain(domain => ({ ...domain, relations: renameEntityInRelations(domain.relations, draftName, selectedEntityName) }));
    }
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
      }));
    if (!imported.length) {
      setError("All database tables are already represented in this domain.");
      return;
    }
    const next = imported[0];
    updateSelectedDomain(domain => ({ ...domain, entities: [...domain.entities, ...imported] }));
    setSelectedEntityName(next.name);
    setEntityDraft(next);
    setEntityDirty(true);
  };
  const removeEntity = (entityName: string) => {
    if (!selected || selected.isBuiltin) return;
    const remaining = selected.entities.filter(entity => entity.name !== entityName);
    updateSelectedDomain(domain => ({
      ...domain,
      entities: remaining,
      relations: removeEntityFromRelations(domain.relations, entityName),
    }));
    const next = remaining[0];
    setSelectedEntityName(next?.name || "");
    setEntityDraft(next ? toEditable(next) : null);
    setEntityDirty(true);
  };
  const commitEntityDraft = () => {
    if (!selected || !entityDraft) return;
    const normalized = normalizeEntityDraft(entityDraft);
    if (!normalized.name) {
      setError("An entity name is required.");
      return;
    }
    const duplicate = selected.entities.some(entity =>
      entity.name !== selectedEntityName && entity.name.trim().toLowerCase() === normalized.name.toLowerCase());
    if (duplicate) {
      setError(`An entity named "${normalized.name}" already exists in this domain.`);
      return;
    }
    updateSelectedDomain(domain => ({
      ...domain,
      entities: domain.entities.some(entity => entity.name === selectedEntityName)
        ? domain.entities.map(entity => entity.name === selectedEntityName ? normalized : entity)
        : [...domain.entities, normalized],
      relations: renameEntityInRelations(domain.relations, selectedEntityName || entityDraft.name, normalized.name),
    }));
    setSelectedEntityName(normalized.name);
    setEntityDraft(normalized);
    setEntityDirty(true);
    setError("");
  };
  const save = async (): Promise<boolean> => {
    setSuccessMessage("");
    if (!draftName.trim()) {
      setError("A domain name is required.");
      setStep(3);
      return false;
    }
    if (!selected && !selectedTables.length) {
      setError("Select at least one database table before generating metadata.");
      setStep(1);
      return false;
    }
    setStatus("saving");
    setError("");
    try {
      if (selected && entityDraft && entityDirty) commitEntityDraft();
      const saveTarget = selected
        ? (() => {
          const entityForTable = (entities: MetadataEntity[], table: DatabaseTable) =>
            entities.find(entity => entityMatchesTable(entity, table));
          const tableEntityName = (table: DatabaseTable, fallback: string) =>
            entityNames[tableKey(table)]?.trim() || fallback;
          const currentEntity = entityDraft
            ? selected.entities.find(entity => entity.name === selectedEntityName)
              ?? selected.entities.find(entity =>
                entity.rawSql === entityDraft.rawSql
                && (entity.schema || "dbo") === (entityDraft.schema || "dbo"))
            : undefined;
          const renames = new Map<string, string>();
          const entities: MetadataEntity[] = [
            ...selected.entities
              .filter(entity => !removedEntityNames.some(name => name.toLowerCase() === entity.name.toLowerCase()))
              .map(entity => {
                if (entity === currentEntity && entityDraft && entityDirty) {
                  const draftEntity = normalizeEntityDraft(entityDraft);
                  renames.set(entity.name, draftEntity.name);
                  if (entity.dbTable) renames.set(entity.dbTable, draftEntity.name);
                  if (entity.rawSql) renames.set(entity.rawSql, draftEntity.name);
                  return draftEntity;
                }
                const table = selectedTableDetails.find(candidate => entityMatchesTable(entity, candidate));
                const renamed = table ? entityNames[tableKey(table)]?.trim() : undefined;
                if (renamed) renames.set(entity.name, renamed);
                return renamed ? { ...entity, name: renamed } : entity;
              }),
            ...selectedTableDetails
              .filter(table => !entityForTable(selected.entities, table)
                || removedEntityNames.some(name => name.toLowerCase() === entityForTable(selected.entities, table)?.name.toLowerCase()))
              .map(table => ({
                name: tableEntityName(table, table.name),
                schema: table.schema,
                rawSql: table.name,
                fields: table.columns.map(column => ({
                  name: column.name,
                  dbColumn: column.name,
                  dataType: toAbstractDataType(column.dataType, column.name),
                  isRawSql: false,
                })),
              })),
          ];
          const relationsBase = renameEntitiesInRelations(selected.relations, renames);
          const relations = selectedRelations.reduce<DomainRelation[]>((currentRelations, relation) => {
            const sourceTable = { schema: relation.sourceSchema, name: relation.sourceTable, columns: [] };
            const targetTable = { schema: relation.targetSchema, name: relation.targetTable, columns: [] };
            const source = entityForTable(entities, sourceTable);
            const target = entityForTable(entities, targetTable);
            if (!source || !target) return currentRelations;
            const names = relationNames[relationKey(relation)];
            const existing = currentRelations.find(item =>
              item.sourceEntity === source.name
              && item.targetEntity === target.name
              && relationFieldsMatch(item, relation));
            if (existing) {
              const names = relationNames[relationKey(relation)];
              if (!names) return currentRelations;
              const directFieldMatch = sameFields(existing.sourceFields, relation.sourceColumns)
                && sameFields(existing.targetFields, relation.targetColumns);
              const named = {
                ...existing,
                sourceRelationName: directFieldMatch ? names.lookup : names.collection,
                targetRelationName: directFieldMatch ? names.collection : names.lookup,
              };
              return currentRelations.map(item => item === existing ? named : item);
            }
            const next: DomainRelation = {
              sourceEntity: source.name,
              sourceRelationName: names?.lookup || existing?.sourceRelationName || singularize(target.name),
              sourceFields: [...relation.sourceColumns],
              targetEntity: target.name,
              targetRelationName: names?.collection || existing?.targetRelationName || pluralize(source.name),
              targetFields: [...relation.targetColumns],
            };
            return [...currentRelations, next];
          }, relationsBase);
          const entityNamesInDomain = new Set(entities.map(entity => entity.name));
          return {
            entities,
            relations: relations.filter(relation =>
              entityNamesInDomain.has(relation.sourceEntity) && entityNamesInDomain.has(relation.targetEntity)),
          };
        })()
        : { entities: [] as MetadataEntity[], relations: [] as DomainRelation[] };
      if (selected) {
        const relationProblem = findRelationProblem(saveTarget.entities, saveTarget.relations);
        if (relationProblem) throw new Error(relationProblem);
      }
      if (selected) {
        const applied = {
          ...selected,
          name: draftName.trim(),
          description: draftDescription.trim(),
          entities: saveTarget.entities,
          relations: saveTarget.relations,
        };
        const savedDto = await request<DomainDto>(apiUrls.metadata.domainById(applied.id), {
          method: "PUT",
          body: JSON.stringify({
            name: applied.name,
            description: applied.description,
            entities: applied.entities.map(toEntityPayload),
            relations: toRelationPayload(applied.relations),
          }),
        });
        const saved = toDomain(savedDto);
        onDomainChanged?.(saved);
        setDomainItems(current => current.map(domain => domain.id === saved.id ? saved : domain));
        setEntityDirty(false);
        setRemovedEntityNames([]);
        const returnSection = new URLSearchParams(location.search).get("returnSection") || "domains";
        navigate(`/metadata?section=${encodeURIComponent(returnSection)}&domain=${encodeURIComponent(saved.id)}`);
        setSelectedName(saved.id);
        setDraftName(saved.name);
        setStep(3);
        setViewMode("detail");
        setSuccessMessage(`Domain "${saved.name}" changes applied successfully.`);
        return true;
      }
      const savedDto = wizardSource === "file"
          ? await request<DomainDto>(apiUrls.metadata.createDomain, {
            method: "POST",
            body: JSON.stringify({
              name: draftName.trim(),
              description: draftDescription.trim(),
              entities: selectedTableDetails.map(table => {
                const key = tableKey(table);
                const columns = selectedColumns[key] || table.columns.map(column => column.name);
                return toEntityPayload({
                  name: entityNames[key]?.trim() || table.name,
                  schema: table.schema,
                  rawSql: table.name,
                  fields: columns.map(column => ({
                    name: fieldNames[key]?.[column]?.trim() || column,
                    dbColumn: column,
                    dataType: toAbstractDataType(table.columns.find(item => item.name === column)?.dataType, column),
                    isRawSql: false,
                  })),
                });
              }),
              relations: [],
            }),
          })
          : await request<DomainDto>(apiUrls.metadata.generateDomain, {
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
      const saved = toDomain(savedDto);
      onDomainChanged?.(saved);
      setDomainItems(current => selected
        ? current.map(domain => domain.id === selected.id ? saved : domain)
        : [...current, saved]);
      setEntityDirty(false);
      setRemovedEntityNames([]);
      dispatch(invalidateQueryMetadata());
      const returnSection = new URLSearchParams(location.search).get("returnSection") || "domains";
      navigate(`/metadata?section=${encodeURIComponent(returnSection)}&domain=${encodeURIComponent(saved.id)}`);
      setSelectedName(saved.id);
      setDraftName(saved.name);
      setStep(3);
      setViewMode("detail");
      setSuccessMessage(`Domain "${saved.name}" generated successfully.`);
      return true;
    } catch (reason) {
      setSuccessMessage("");
      setError(reason instanceof Error ? reason.message : selected ? "Unable to apply domain changes." : "Unable to generate domain metadata.");
      return false;
    } finally {
      setStatus("ready");
    }
  };
  const deleteDomain = async (domain: Domain) => {
    if (domain.isBuiltin) return;
    const action = await showMessageBox({
      eyebrow: "DELETE DOMAIN",
      title: `Delete ${domain.name}?`,
      message: `This will permanently delete the ${domain.name} domain and all of its entity definitions.`,
      confirmationText: domain.name,
      confirmationLabel: `Enter ${domain.name} to confirm`,
      actions: [
        { value: "cancel", label: "Cancel", variant: "secondary" },
        { value: "delete", label: "Delete domain", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    setStatus("saving");
    setError("");
    try {
      await request<void>(apiUrls.metadata.domainById(domain.id), { method: "DELETE" });
      setDomainItems(current => current.filter(item => item.id !== domain.id));
      if (selectedName === domain.id) {
        setSelectedName("");
        setDraftName("");
        setSelectedEntityName("");
        setEntityDraft(null);
        setViewMode("list");
        navigate("/metadata?section=domains");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to delete domain "${domain.name}".`);
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
  const hasWizardChanges = () => {
    if (!selected) return step > 1 || Boolean(draftName.trim()) || selectedTables.length > 0;
    const initialTableKeys = existingTableKeys(selected, schema.tables);
    const currentKeys = new Set(selectedTables);
    const tablesChanged = initialTableKeys.length !== currentKeys.size
      || initialTableKeys.some(key => !currentKeys.has(key));
    return Boolean(entityDirty
      || removedEntityNames.length
      || uploadedTables.length
      || tablesChanged
      || draftName.trim() !== selected.name
      || draftDescription.trim() !== (selected.description || ""));
  };
  const changeWizardSource = async (source: WizardSource) => {
    if (source === wizardSource) return;
    const hasWizardData = hasWizardChanges();
    if (hasWizardData) {
      const action = await showMessageBox({
        eyebrow: "CHANGE DOMAIN SOURCE",
        title: "Discard current domain design?",
        message: selected
          ? "Changing the source will discard the current append selection. Existing domain entities will remain unchanged until you save."
          : "Changing the source will discard the selected tables, entity design, and domain details. The wizard will restart at step 1.",
        actions: [
          { value: "cancel", label: "Cancel", variant: "secondary" },
          { value: "continue", label: "Discard and change source", variant: "danger" },
        ],
      });
      if (action !== "continue") return;
    }
    setWizardSource(source);
    setSelectedTables([]);
    setUploadedTables([]);
    setSelectedColumns({});
    setEntityNames({});
    setFieldNames({});
    setCollapsedEntities({});
    setRelationNames({});
    setDraftName("");
    setDraftDescription("");
    setTableFilter("");
    setStep(1);
    setError("");
  };
  const cancelWizard = async () => {
    const hasWizardData = hasWizardChanges();
    if (hasWizardData) {
      const action = await showMessageBox({
        eyebrow: selected ? "CANCEL DOMAIN EDITING" : "CANCEL DOMAIN CREATION",
        title: selected ? "Discard domain changes?" : "Discard this domain?",
        message: selected
          ? "Your unsaved domain changes will be lost."
          : "Your current source selection and entity design will be lost.",
        actions: [
          { value: "cancel", label: "Keep editing", variant: "secondary" },
          { value: "discard", label: "Discard and go back", variant: "danger" },
        ],
      });
      if (action !== "discard") return;
    }
    setViewMode(selected ? "detail" : "list");
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate("/metadata?section=domains");
    }
  };
  const canContinue = step === 1
    ? (selected
      ? true
      : wizardSource === "database"
      ? connectionStatus === "succeeded" && selectedTables.length > 0
      : selectedTables.length > 0)
    : step === 2
      ? selectedTableDetails.every(table =>
        (selectedColumns[tableKey(table)] || table.columns.map(column => column.name)).length > 0)
      : Boolean(draftName.trim());
  const canNavigateToStep = (targetStep: Step) => {
    if (targetStep <= step) return true;

    const hasSourceSelection = Boolean(selected)
    || (wizardSource === "database"
      ? connectionStatus === "succeeded" && selectedTables.length > 0
      : selectedTables.length > 0);
    if (targetStep === 2) return hasSourceSelection;

    const hasValidEntityDesign = (selected?.entities.length ?? 0) > 0
      || (selectedTableDetails.length > 0
        && selectedTableDetails.every(table =>
          (selectedColumns[tableKey(table)] || table.columns.map(column => column.name)).length > 0));
    return hasSourceSelection && hasValidEntityDesign;
  };
  const goNext = () => {
    if (!selected && step === 1 && wizardSource === "database" && connectionStatus !== "succeeded") {
      setError("Connect to a database to continue.");
      return;
    }
    if (step === 1 && !selected && !selectedTables.length) {
      setError(wizardSource === "database"
        ? "Select at least one database table to continue."
        : "Upload a file containing at least one entity to continue.");
      return;
    }
    if (step === 2 && !canContinue) {
      setError("Select at least one database column for every entity.");
      return;
    }
    if (step === 3 && !draftName.trim()) {
      setError("Enter a domain name to continue.");
      return;
    }
    setError("");
    setStep(Math.min(3, step + 1) as Step);
  };
  const goBack = () => {
    setError("");
    setStep(Math.max(1, step - 1) as Step);
  };
  const renderButtons = () => (
    <div className="editor-actions" role="toolbar" aria-label="Domain actions">
      <button
        className="icon-button definition-action-button create"
        type="button"
        title="Create domain"
        aria-label="Create domain"
        onClick={() => createDomain()}
        disabled={status === "saving"}
      >
        <Icon name="file-plus" size={17} />
      </button>
    </div>
  );
  const visibleCatalogDomains = domainItems.filter(domain => domain.name.toLowerCase().includes(domainFilter.toLowerCase()));
  const catalogColumns = [
    visibleCatalogDomains.filter((_, index) => index % 2 === 0),
    visibleCatalogDomains.filter((_, index) => index % 2 === 1),
  ];
  const renderWizardButtons = () => (
    <div className="editor-actions" role="toolbar" aria-label="Domain wizard actions">
      <button
        className="icon-button definition-action-button"
        type="button"
        title={selected ? "Cancel domain editing" : "Cancel domain creation"}
        aria-label={selected ? "Cancel domain editing" : "Cancel domain creation"}
        onClick={() => void cancelWizard()}
        disabled={status === "saving"}
      >
        <Icon name="close" size={17} />
      </button>
    </div>
  );
  return (
    <section className={`domain-workspace${viewMode === "list" ? " domain-list-view" : viewMode === "wizard" ? " domain-create-view" : ""}`} style={viewMode === "list" ? undefined : panel.style}>
      {active && toolbarHost && createPortal(
        viewMode === "wizard" ? renderWizardButtons() : renderButtons(),
        toolbarHost,
      )}
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
          <input spellCheck={false} value={domainFilter} onChange={event => setDomainFilter(event.target.value)} placeholder="Filter domains" />
        </label>
        {status === "loading" && <p className="empty-state">Loading domains…</p>}
        {status !== "loading" && !visibleCatalogDomains.length && <p className="empty-state">No domains match this filter.</p>}
        <div className="domain-catalog-grid">
          {catalogColumns.map((column, columnIndex) => (
            <div className="domain-catalog-column" key={columnIndex}>
              {column.map(domain => (
            <div key={domain.name} className="domain-summary-card">
              <div className="domain-summary-copy">
                <button
                  type="button"
                  className="domain-summary-icon"
                  aria-label={`Open ${domain.name} diagram`}
                  title={`Open ${domain.name} diagram`}
                  onClick={() => selectDomain(domain)}
                >
                  <Icon name="folder" size={17} />
                </button>
                <button type="button" className="domain-summary-open" onClick={() => selectDomain(domain)}>
                  <span className="domain-summary-content">
                    <strong>{domain.name}</strong>
                  </span>
                </button>
              {domain.description && (
                <>
                  {!expandedDescriptions[domain.name] && (
                    <>
                      <br />
                      <span className="domain-summary-description-preview">
                        {getDescriptionPreview(domain.description)}
                      </span>
                    </>
                  )}
                  {hasDescriptionPreviewOverflow(domain.description) && (
                    <button
                      type="button"
                      className="domain-summary-description-toggle"
                      aria-expanded={Boolean(expandedDescriptions[domain.name])}
                      onClick={() => toggleDescription(domain.name)}
                    >
                        {expandedDescriptions[domain.name] ? "Hide details" : "more..."}
                    </button>
                  )}
                  {expandedDescriptions[domain.name] && (
                    <div className="domain-summary-description-panel">
                      <MarkdownDescription value={domain.description} />
                    </div>
                  )}
                </>
              )}
              </div>
              {domain.entities.length > 0 && (
                <div className="domain-summary-entity-preview" aria-label="Included entities">
                  <span className="domain-summary-entity-label">Included entities</span>
                  <div className="domain-summary-entity-chips">
                    {domain.entities.slice(0, 5).map(entity => (
                      <span key={entity.name} className="domain-summary-entity-chip">{entity.name}</span>
                    ))}
                    {domain.entities.length > 5 && <span className="domain-summary-entity-chip domain-summary-entity-more">more...</span>}
                  </div>
                </div>
              )}
              {!domain.isBuiltin && <button type="button" className="domain-summary-delete" title={`Delete ${domain.name} domain`} aria-label={`Delete ${domain.name} domain`} onClick={() => void deleteDomain(domain)}>
                <Icon name="trash" size={15} />
              </button>}
            </div>
              ))}
            </div>
          ))}
        </div>
      </div> : <>
      {viewMode === "detail" && <>
        <PanelSplitter panel={panel} label="domains panel" />
        <MetadataSidebar
          className="metadata-list domain-route-list"
          title="DOMAINS"
          totalCount={domainItems.length}
          filter={domainFilter}
          searchPlaceholder="Find a saved domain"
          onFilterChange={setDomainFilter}
          groups={[{
            id: "route-domains",
            title: "Saved",
            count: domainItems.filter(domain => domain.name.toLowerCase().includes(domainFilter.toLowerCase())).length,
            content: domainItems
              .filter(domain => domain.name.toLowerCase().includes(domainFilter.toLowerCase()))
              .map(domain => (
                <button key={domain.id} type="button" className={`metadata-entity${domain.id === selectedName ? " active" : ""}`} onClick={() => selectDomain(domain)}>
                  <span className="entity-icon"><Icon name="folder" size={14} /></span>
                  <span className="domain-list-item-content">
                    <b>{domain.name}</b>
                    {domain.description && <small className="domain-list-item-description">{getPlainDescription(domain.description)}</small>}
                    <small>{domain.entities.length} entities{domain.isBuiltin ? " · Built-in - Read Only" : ""}</small>
                  </span>
                  <Icon name="chevron" size={14} />
                </button>
              )),
            emptyMessage: status !== "loading" && !domainItems.length ? "No saved domains." : undefined,
          } satisfies MetadataSidebarGroup]}
        />
      </>}
      <div className="domain-editor">
        <div className="domain-editor-heading">
          <div><span className="section-kicker">BUSINESS LOGIC</span><h2>{selected ? selected.name : "New domain"}</h2>{selected?.isBuiltin && <span className="metadata-editor-heading-status readonly">Built-in - Read Only</span>}</div>
          {selected &&           <label className="domain-picker">
            <span>Domain</span>
            <select value={selected.id} onChange={event => {
              const next = domainItems.find(domain => domain.id === event.target.value);
              if (next) selectDomain(next);
            }}>
              {domainItems.map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
            </select>
          </label>}
          <span className="domain-count">{selected?.entities.length ?? 0} entities</span>
          {selected && !selected.isBuiltin && viewMode === "detail" && <button type="button" className="domain-primary" onClick={() => editDomain(selected)}>Edit domain</button>}
        </div>
        {error && selected && <p className="domain-error" role="alert">{error}</p>}
        {successMessage && viewMode === "detail" && <p className="domain-success" role="status">{successMessage}</p>}
        {viewMode === "wizard" ? (
          <DomainWizard
            mode={selected ? "edit" : "create"}
            domainDisplayName={selected?.name}
            source={wizardSource}
            step={step}
            canContinue={canContinue}
            canNavigateToStep={canNavigateToStep}
            saving={status === "saving"}
            error={error}
            onStepChange={setStep}
            onSourceChange={changeWizardSource}
            onBack={goBack}
            onNext={goNext}
            onGenerate={() => void save()}
          >
            {wizardSource === "file" && step === 1 && <div className="domain-upload-step">
              <strong>{selected ? "Append domain metadata" : "Upload domain metadata"}</strong>
              <p>{selected ? "Choose a JSON or YAML file. Existing entity names will be validated and skipped." : "Choose a JSON or YAML file containing entities and their fields."}</p>
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
            {wizardSource === "database" && step === 1 && <div className="domain-source-step">
              {connectionStatus !== "succeeded" && <div className="domain-connection-prompt">
                <strong>Connect to a database</strong>
                <p>Choose the database that provides the tables for this domain.</p>
                <button type="button" className="domain-primary" onClick={() => setConnectionDialogOpen(true)}>Open connection</button>
              </div>}
              {connectionStatus === "succeeded" && <div className="domain-table-picker">
              <div className="domain-step-title"><strong>{selected ? "Select tables to append" : "Select database tables"}</strong><span>{selectedTables.length} selected</span></div>
              <span>{selected ? "Existing domain tables are selected automatically. Choose additional tables to append." : "Tables are read from the active database connection."}</span>
              {selected && <div className="domain-source-legend" aria-label="Source legend"><span className="existing-source"><i /> Existing table</span><span className="append-source"><i /> New table to append</span></div>}
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
                      const existingEntity = selected?.entities.find(entity => entityMatchesTable(entity, table));
                      const alreadyIncluded = Boolean(existingEntity);
                      const sourceClass = selected ? (alreadyIncluded ? " existing-source" : " append-source") : "";
                      return <label key={key} className={sourceClass.trim()}><input type="checkbox" checked={selectedTables.includes(key)} onChange={() => {
                        const isSelected = selectedTables.includes(key);
                        setSelectedTables(current => isSelected ? current.filter(item => item !== key) : [...current, key]);
                        if (existingEntity) {
                          setRemovedEntityNames(current => isSelected
                            ? current.includes(existingEntity.name) ? current : [...current, existingEntity.name]
                            : current.filter(name => name.toLowerCase() !== existingEntity.name.toLowerCase()));
                        }
                      }} /><span><strong>{table.name}</strong>{existingEntity && <small className="domain-table-entity">Entity: {existingEntity.name}</small>}</span></label>;
                    })}</div>
                  </section>)}
                  {schema.tables.length > 0 && !filteredTables.length && <p className="empty-state">No tables match this filter.</p>}
                </div>
                <aside className="domain-selected-tables" aria-label="Selected database tables">
                  <div className="domain-table-list-heading"><strong>Selected tables</strong><span><small>{selectedTableDetails.length}</small><button type="button" className="domain-clear-selection" onClick={() => {
                    setSelectedTables([]);
                    if (selected) setRemovedEntityNames(selected.entities.map(entity => entity.name));
                  }} disabled={!selectedTableDetails.length}>Clear all</button></span></div>
                  {selectedTableDetails.length > 0 ? <div className="domain-selected-table-list">{selectedTableDetails.map(table => {
                    const existingEntity = selected?.entities.find(entity => entityMatchesTable(entity, table));
                    const existing = Boolean(existingEntity);
                    return <button key={tableKey(table)} className={existing ? "existing-source" : "append-source"} type="button" onClick={() => {
                    setSelectedTables(current => current.filter(key => key !== tableKey(table)));
                    if (selected) {
                      const entity = selected.entities.find(item => entityMatchesTable(item, table));
                      if (entity) setRemovedEntityNames(current => current.includes(entity.name) ? current : [...current, entity.name]);
                    }
                  }} title={`Remove ${table.name}`}>
                    <span><strong>{table.name}</strong><small>{table.schema}</small>{existingEntity && <small className="domain-table-entity">Entity: {existingEntity.name}</small>}</span><b aria-hidden="true">×</b>
                  </button>;
                  })}</div> : <p className="domain-selected-empty">Choose tables from the list to add them to this domain.</p>}
                </aside>
              </div>
              {!schema.tables.length && <p className="empty-state">No database tables are available.</p>}
            </div>}
            </div>}
            {step === 2 && <div className="domain-generation">
              <strong>{selected ? "Review domain changes" : "Review and generate metadata"}</strong>
              <p>{selected ? "Existing entities remain selected unless removed. Review the entity definitions and appended tables before saving." : `${selectedTables.length} entities selected. Choose the fields and relation names to generate.`}</p>
              {selected && <div className="domain-source-legend" aria-label="Entity source legend"><span className="existing-source"><i /> Existing entity</span><span className="append-source"><i /> New entity to append</span></div>}
              <div className="domain-step-section">
                <h4>Entities</h4>
                <div className="domain-entity-preview">{selectedTableDetails.map(table => {
                const key = tableKey(table);
                const columns = selectedColumns[key] || table.columns.map(column => column.name);
                const collapsed = collapsedEntities[key] ?? false;
                const orderedColumns = [...table.columns].sort((left, right) => Number(columns.includes(right.name)) - Number(columns.includes(left.name)));
                const existing = selected?.entities.some(entity => entityMatchesTable(entity, table)) ?? false;
                return <div key={key} className={`domain-entity-item ${existing ? "existing-source" : "append-source"}`}><button type="button" className="domain-collapse" onClick={() => setCollapsedEntities(current => ({ ...current, [key]: !collapsed }))} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${table.name} entity`}><Icon name={collapsed ? "chevron-right" : "chevron-down"} size={15} /></button><section className="domain-preview-card">
                  <div className="domain-preview-heading"><div className="domain-entity-heading-names"><input className="domain-entity-name" spellCheck={false} value={entityNameFor(table)} onChange={event => setEntityNames(current => ({ ...current, [key]: event.target.value }))} aria-label={`Entity name for ${table.name}`} /><small>{table.schema}.{table.name}</small></div><button type="button" className="domain-remove" onClick={() => setSelectedTables(current => current.filter(item => item !== key))} aria-label={`Remove ${table.name} table`} title="Remove table"><Icon name="trash" size={15} /></button></div>
                  {!collapsed && <div className="domain-column-grid">{orderedColumns.map(column => <label key={column.name}><input type="checkbox" checked={columns.includes(column.name)} onChange={() => setSelectedColumns(current => ({ ...current, [key]: columns.includes(column.name) ? columns.filter(name => name !== column.name) : [...columns, column.name] }))} /><input className="domain-field-name" spellCheck={false} value={fieldNames[key]?.[column.name] ?? column.name} disabled={!columns.includes(column.name)} onChange={event => setFieldNames(current => ({ ...current, [key]: { ...current[key], [column.name]: event.target.value } }))} aria-label={`Field name for ${column.name}`} /><small className="domain-data-type" title={column.dataType} aria-label={`Data type: ${column.dataType}`}><Icon name={getDataTypeIcon(column.dataType, column.name)} size={14} /></small></label>)}</div>}
                </section></div>;
                })}</div>
              </div>
              {selectedRelations.length > 0 && <div className="domain-step-section"><h4>Relations</h4><div className="domain-relation-preview"><div className="domain-relation-header"><strong>Relation</strong><strong>Lookup name</strong><strong>Collection name</strong></div>{selectedRelations.map(relation => {
                const key = relationKey(relation);
                const names = relationNames[key] || relationNameDefaults(relation);
                const existing = selected ? relationMatchesDatabaseRelation(selected, relation) : false;
                return <div key={key} className={`domain-relation-row${selected ? (existing ? " existing-source" : " append-source") : ""}`}><span>{relation.sourceTable} → {relation.targetTable}</span><input spellCheck={false} value={names.lookup} aria-label={`Lookup relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, lookup: event.target.value } }))} /><input spellCheck={false} value={names.collection} aria-label={`Collection relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, collection: event.target.value } }))} /></div>;
              })}</div></div>}
            </div>}
            {step === 3 && <div className="domain-final-details">
              <label className="domain-name"><span>Domain name</span><input autoFocus spellCheck={false} value={draftName} onChange={event => setDraftName(event.target.value)} placeholder="e.g. Sales" /><small>Use a name that describes the business area this workspace serves.</small></label>
              <label className="domain-description"><span>Description <small>(optional)</small></span><textarea spellCheck={false} value={draftDescription} onChange={event => setDraftDescription(event.target.value)} placeholder="Describe the business area this domain represents." rows={4} /></label>
              <p className="domain-generation-summary">{selected ? `${selected.entities.length - removedEntityNames.length + selectedTableDetails.filter(table => !selected.entities.some(entity => entityMatchesTable(entity, table))).length} entities will be applied to the diagram.` : `${selectedTables.length} entities are ready to generate.`}</p>
              <button type="button" className="domain-primary domain-generate-content-button" onClick={() => void save()} disabled={status === "saving" || !canContinue}>
                {status === "saving" ? (selected ? "Applying…" : "Generating…") : (selected ? "Apply domain changes" : "Generate metadata")} <Icon name={selected ? "check" : "arrow-right"} size={14} />
              </button>
            </div>}
          </DomainWizard>
        ) : selected ? <div className="domain-detail-layout">
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
                  <Icon name="table" size={14} /><span><b>{entity.name}</b><small>{entity.fields.length} fields · {relationsForEntity(entity.name, selected.relations).length} relations</small></span><Icon name="chevron" size={13} />
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
              allEntities={selected.entities.map(entity =>
                entity.name === selectedEntityName && entityDraft ? entityDraft : entity)}
              domainRelations={selected.relations}
              onDraftChange={updater => {
                if (!entityDraft) return;
                const nextDraft = updater(entityDraft);
                setEntityDraft(nextDraft);
                if (nextDraft.name !== entityDraft.name) {
                  updateSelectedDomain(domain => ({ ...domain, relations: renameEntityInRelations(domain.relations, entityDraft.name, nextDraft.name) }));
                }
                setEntityDirty(true);
              }}
              onRelationsChange={updater => {
                updateSelectedDomain(domain => ({ ...domain, relations: updater(domain.relations) }));
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
        </div> : null}
      </div>
      </>}
      {connectionDialogOpen && createPortal(
        <div className="database-connection-dialog-backdrop" onClick={() => setConnectionDialogOpen(false)}>
          <section className="database-connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-title" onClick={event => event.stopPropagation()}>
            <button className="database-connection-dialog-close" type="button" aria-label="Close database connection" onClick={() => setConnectionDialogOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <DatabaseConnection onConnected={() => { setConnectionDialogOpen(false); setError(""); }} />
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
