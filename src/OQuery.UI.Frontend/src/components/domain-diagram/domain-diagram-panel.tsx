import { useEffect, useMemo, useState } from "react";
import Icon from "../icon/icon";
import { getDomain, getFullDomain, updateFullDomain } from "../../services/project-service";
import { getSchema } from "../../services/db-schema-service";
import { metadataEntityFromDto, type DomainRelation, type MetadataEntity } from "../query-builder/query-design/query-builder-slice";
import DefinitionActions from "../metadata-builder/definition-actions/definition-actions";
import DomainDiagram from "./domain-diagram";
import EntityDefinition, { type DatabaseTableOption } from "./entity-definition/entity-definition";
import { removeEntityFromRelations, renameEntityInRelations, toEditable, toEntityPayload, toRelationPayload, type EditableEntity } from "./entity-definition/types";

type DomainDiagramPanelProps = {
  projectId: string;
  domainId: string;
  domainOptions: { id: string; name: string }[];
  onSelectDomain?: (domainId: string) => void;
  onError?: (message: string) => void;
};

type DomainGraph = { entities: MetadataEntity[]; relations: DomainRelation[] };

// The Main domain is the FullDomain itself, so its entities and relations are the editable mapping to the database.
const MAIN_DOMAIN_ID = "main";
const EMPTY_GRAPH: DomainGraph = { entities: [], relations: [] };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

type DatabaseSchemaPayload = {
  tables: { schema: string; name: string; columns: { name: string; dataType: string; isPrimaryKey: boolean }[] }[];
};

function nextEntityName(entities: MetadataEntity[]) {
  const taken = new Set(entities.map((entity) => entity.name.trim().toLowerCase()));
  let name = "NewEntity";
  for (let suffix = 2; taken.has(name.toLowerCase()); suffix++) name = `NewEntity${suffix}`;
  return name;
}

function toDatabaseTableOptions(schema: unknown): DatabaseTableOption[] {
  const tables = (schema as DatabaseSchemaPayload | null)?.tables ?? [];
  return tables.map((table) => ({
    schema: table.schema,
    name: table.name,
    columns: table.columns.map((column) => ({ name: column.name, dataType: column.dataType, isPrimaryKey: column.isPrimaryKey })),
  }));
}

export default function DomainDiagramPanel({ projectId, domainId, domainOptions, onSelectDomain, onError }: DomainDiagramPanelProps) {
  const isMainDomain = domainId === MAIN_DOMAIN_ID;
  const [baseline, setBaseline] = useState<DomainGraph>(EMPTY_GRAPH);
  const [working, setWorking] = useState<DomainGraph>(EMPTY_GRAPH);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTableOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const dirty = JSON.stringify(working) !== JSON.stringify(baseline);

  useEffect(() => {
    let active = true;
    getSchema()
      .then((schema) => {
        if (active) setDatabaseTables(toDatabaseTableOptions(schema));
      })
      .catch((error: unknown) => {
        if (active) onError?.(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelectedName("");
    if (!projectId || !domainId) {
      setBaseline(EMPTY_GRAPH);
      setWorking(EMPTY_GRAPH);
      return;
    }
    let active = true;
    setLoading(true);
    const request: Promise<DomainGraph> = isMainDomain
      ? getFullDomain(projectId).then((full) => ({ entities: full.entities.map(metadataEntityFromDto), relations: full.relations }))
      : getDomain(projectId, domainId).then((resolved) => ({ entities: resolved.entities, relations: resolved.relations }));
    request
      .then((graph) => {
        if (!active) return;
        setBaseline(graph);
        setWorking(graph);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setBaseline(EMPTY_GRAPH);
        setWorking(EMPTY_GRAPH);
        onError?.(messageOf(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, domainId, isMainDomain]);

  const selected = working.entities.find((entity) => entity.name === selectedName) ?? null;
  const draft = useMemo(() => (selected ? toEditable(selected) : null), [selected]);
  const selectedTable = draft?.dbTable
    ? databaseTables.find((table) => table.name === draft.dbTable && table.schema === (draft.schema || "dbo"))
    : undefined;

  const changeDraft = (updater: (draft: EditableEntity) => EditableEntity) => {
    if (!draft || !isMainDomain) return;
    const next = updater(draft);
    const entity: MetadataEntity = { ...next, fields: next.fields.map(({ id, ...field }) => field) };
    setWorking((current) => ({
      entities: current.entities.map((item) => (item.name === selectedName ? entity : item)),
      relations: renameEntityInRelations(current.relations, selectedName, entity.name),
    }));
    if (entity.name !== selectedName) setSelectedName(entity.name);
  };

  const changeRelations = (updater: (relations: DomainRelation[]) => DomainRelation[]) => {
    if (!isMainDomain) return;
    setWorking((current) => ({ ...current, relations: updater(current.relations) }));
  };

  // Adds an unmapped entity to the Main domain and opens it, so its table and fields can be chosen in the editor.
  const createEntity = () => {
    if (!isMainDomain) return;
    const name = nextEntityName(working.entities);
    setWorking((current) => ({
      ...current,
      entities: [...current.entities, { name, schema: "dbo", dbTable: null, rawSql: "", fields: [] }],
    }));
    setSelectedName(name);
  };

  // Removes the entity and its relations from the in-memory domain only; nothing is persisted until save.
  const removeEntity = () => {
    if (!isMainDomain || !selectedName) return;
    setWorking((current) => ({
      ...current,
      entities: current.entities.filter((entity) => entity.name !== selectedName),
      relations: removeEntityFromRelations(current.relations, selectedName),
    }));
    setSelectedName("");
  };

  const selectTable = (table: DatabaseTableOption) => {
    changeDraft((current) => ({ ...current, schema: table.schema, dbTable: table.name, rawSql: table.name }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updateFullDomain(projectId, {
        entities: working.entities.map(toEntityPayload),
        relations: toRelationPayload(working.relations),
      });
      const graph = { entities: saved.entities.map(metadataEntityFromDto), relations: saved.relations };
      setBaseline(graph);
      setWorking(graph);
    } catch (error) {
      onError?.(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const entityActionAdapter = {
    resourceName: "entity",
    selectedName,
    hasSelection: Boolean(selected),
    isBuiltIn: false,
    hasDraft: Boolean(draft),
    dirty: false,
    saving: false,
    onNew: isMainDomain ? createEntity : undefined,
    onDelete: isMainDomain ? removeEntity : undefined,
  };
  const entityHeaderActions = <DefinitionActions adapter={entityActionAdapter} />;

  const toolbarActions = (
    <div className="editor-actions" role="toolbar" aria-label="Metadata domain actions">
      <button className="icon-button definition-action-button primary" type="button" title="Save domain" aria-label="Save domain" onClick={() => void save()} disabled={!isMainDomain || !dirty || saving}>
        <Icon name="save" size={17} />
      </button>
      <button className="icon-button definition-action-button danger" type="button" title="Delete domain" aria-label="Delete domain" disabled>
        <Icon name="trash" size={17} />
      </button>
      <button className="icon-button definition-action-button" type="button" title="Reload domain" aria-label="Reload domain" onClick={() => setWorking(baseline)} disabled={!dirty || saving}>
        <Icon name="reset" size={17} />
      </button>
      <button className="icon-button definition-action-button" type="button" title="Edit domain entities in wizard" aria-label="Edit domain entities in wizard" disabled>
        <Icon name="edit" size={17} />
      </button>
      <button className="icon-button definition-action-button create" type="button" title="Create domain" aria-label="Create domain" disabled>
        <Icon name="file-plus" size={17} />
      </button>
    </div>
  );

  return (
    <DomainDiagram
      entities={working.entities}
      relations={working.relations}
      domainOptions={domainOptions}
      activeDomainId={domainId}
      selectedEntityName={selectedName}
      loading={loading}
      editingEntity={draft}
      editingEntityName={selectedName}
      onDraftChange={changeDraft}
      onSelectDomain={onSelectDomain}
      onOpenEntity={(table) => setSelectedName(table.name)}
      toolbarActions={toolbarActions}
      entityEditorHeader={
        <div className="table-details-heading metadata-editor-heading">
          <div className="table-details-title">
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
        <EntityDefinition
          draft={draft}
          canEdit={isMainDomain}
          message=""
          allEntities={working.entities}
          domainRelations={working.relations}
          onDraftChange={changeDraft}
          onRelationsChange={changeRelations}
          databaseTables={databaseTables}
          selectedTable={selectedTable}
          onSelectTable={selectTable}
          compact
        />
      }
    />
  );
}
