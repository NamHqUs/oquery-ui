import { useEffect, useMemo, useState } from "react";
import Icon from "../icon/icon";
import { getDomain, getFullDomain, updateFullDomain, type ProjectSummary } from "../../services/project-service";
import { getSchema } from "../../services/db-schema-service";
import { metadataEntityFromDto, type DomainRelation, type MetadataEntity } from "../metadata/metadata-model";
import MainLayout, { Heading, type WorkspaceView } from "../main-layout/main-layout";
import DiagramView, { diagramGroupTone } from "./entity-diagram/diagram-view";
import { toDiagramRelationships, toDiagramTables } from "./entity-diagram/diagram-model";
import PanelSplitter from "../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import "./entity-diagram/entity-diagram.css";
import EntityDefinition, { type DatabaseTableOption } from "./entity-definition/entity-definition";
import { removeEntityFromRelations, renameEntityInRelations, toEditable, toEntityPayload, toRelationPayload, type EditableEntity } from "./entity-definition/types";
import { domainCreatePath, domainDiagramPath, domainEditPath, type DomainDiagramRoute } from "./domain-routes";
import DomainWizardPage from "./domain-wizard/domain-wizard-page";

type DomainGraph = { entities: MetadataEntity[]; relations: DomainRelation[] };

type DomainPageProps = {
  route: DomainDiagramRoute;
  projects: ProjectSummary[];
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
};

// The Main domain is the FullDomain itself, so its entities and relations are the editable mapping to the database.
const MAIN_DOMAIN_ID = "main";
const EMPTY_GRAPH: DomainGraph = { entities: [], relations: [] };

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

const encode = (segment: string) => encodeURIComponent(segment);

export default function DomainPage({ route, projects, connectionStatus, provider, onNavigate, onOpenConnection }: DomainPageProps) {
  if (route.kind !== "view") return <DomainWizardPage mode={route.kind} projectId={route.projectId} />;
  const { projectId } = route;
  const onSelectView = (view: WorkspaceView, domainId: string) => {
    if (view === "diagram") return;
    onNavigate(`/playground/${encode(projectId)}${domainId ? `/${encode(domainId)}` : ""}`);
  };
  return (
    <MainLayout
      view="diagram"
      projects={projects}
      projectId={projectId}
      domainId={route.domainId}
      connectionStatus={connectionStatus}
      provider={provider}
      onSelectView={onSelectView}
      onSelectProject={(id) => { if (id) onNavigate(`/playground/${encode(id)}`); }}
      onSelectDomain={(id) => { if (id) onNavigate(domainDiagramPath(projectId, id)); }}
      onOpenConnection={onOpenConnection}
      onNavigateHome={() => onNavigate("/")}
    >
      {({ domains, domainId }) => (
        <>
          <Heading icon="schema" title="Domain Diagram" text="Explore your data model, understand relationships, and get AI-powered insights" />
          <DomainDiagramContent projectId={projectId} domainId={domainId} domainOptions={domains} onNavigate={onNavigate} />
        </>
      )}
    </MainLayout>
  );
}

type DomainDiagramContentProps = {
  projectId: string;
  domainId: string;
  domainOptions: { id: string; name: string }[];
  onNavigate: (path: string) => void;
};

function DomainDiagramContent({ projectId, domainId, domainOptions, onNavigate }: DomainDiagramContentProps) {
  const isMainDomain = domainId === MAIN_DOMAIN_ID;
  const [baseline, setBaseline] = useState<DomainGraph>(EMPTY_GRAPH);
  const [working, setWorking] = useState<DomainGraph>(EMPTY_GRAPH);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTableOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedName, setSelectedName] = useState("");
  const dirty = JSON.stringify(working) !== JSON.stringify(baseline);
  const panel = useResizablePanel("metadata-entity-diagram-height", 480, 280, 900);

  useEffect(() => {
    let active = true;
    getSchema()
      .then((schema) => {
        if (active) setDatabaseTables(toDatabaseTableOptions(schema));
      })
      .catch(() => {
        if (active) setDatabaseTables([]);
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
      .catch(() => {
        if (!active) return;
        setBaseline(EMPTY_GRAPH);
        setWorking(EMPTY_GRAPH);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, domainId, isMainDomain, reloadToken]);

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

  const persist = async (graph: DomainGraph) => {
    const saved = await updateFullDomain(projectId, {
      entities: graph.entities.map(toEntityPayload),
      relations: toRelationPayload(graph.relations),
    });
    const next = { entities: saved.entities.map(metadataEntityFromDto), relations: saved.relations };
    setBaseline(next);
    setWorking(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await persist(working);
    } catch {
      // Save failures are not surfaced yet, matching the previous panel behavior.
    } finally {
      setSaving(false);
    }
  };

  const reload = () => {
    if (dirty && !window.confirm("Discard unsaved changes and reload the domain from the server?")) return;
    setReloadToken((token) => token + 1);
  };

  const toolbarActions = (
    <div className="editor-actions domain-diagram-actions" role="toolbar" aria-label="Metadata domain actions">
      <button className="domain-action-button primary" type="button" title="Save domain" aria-label="Save domain" onClick={() => void save()} disabled={!isMainDomain || !dirty || saving}>
        <Icon name="save" size={15} /> Save
      </button>
      <button className="domain-action-button" type="button" title="Reload domain from the server" aria-label="Reload domain" onClick={reload} disabled={loading || saving}>
        <Icon name="reset" size={15} /> Reload
      </button>
      <button className="domain-action-button" type="button" title="Edit the Main domain in the wizard" aria-label="Edit domain" onClick={() => onNavigate(domainEditPath(projectId, domainId))} disabled={!isMainDomain || dirty || loading || saving}>
        <Icon name="edit" size={15} /> Edit
      </button>
      <button className="domain-action-button create" type="button" title="Create a domain in the wizard" aria-label="Create domain" onClick={() => onNavigate(domainCreatePath(projectId))} disabled={dirty || loading || saving}>
        <Icon name="file-plus" size={15} /> Create
      </button>
    </div>
  );

  const displayedEntities = working.entities.map((entity) => (draft && entity.name === selectedName ? draft : entity));
  const tables = toDiagramTables(displayedEntities);
  const relationships = toDiagramRelationships(displayedEntities, working.relations);
  const groups = domainOptions.map((option, index) => ({
    id: option.id,
    name: option.name,
    tone: diagramGroupTone(index),
    tables: toDiagramTables(option.id === domainId || (!domainId && option.id === "All") ? displayedEntities : []),
  }));
  const activeDomain = domainOptions.find((option) => option.id === domainId);

  return (
    <>
      <div className="domain-diagram-toolbar">{toolbarActions}</div>
      <div className="metadata-diagram-mode-content split-workspace" style={panel.style}>
        <section className="metadata-diagram-editor split-panel" aria-label="Entity definition editor">
          <div className="table-details-heading metadata-editor-heading">
            <div className="table-details-title">
              <div className="metadata-editor-heading-title">
                <span className="metadata-editor-heading-icon"><Icon name="table" size={18} /></span>
                <h3>{draft?.name || "Select an entity"}</h3>
              </div>
            </div>
          </div>
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
        </section>
        <PanelSplitter
          panel={panel}
          label="diagram height"
          orientation="horizontal"
          horizontalAnchor="top"
          collapsible={false}
        />
        <DiagramView
          tables={tables}
          groups={groups}
          initialGroup={activeDomain?.name || domainId}
          selectedTableName={selectedName}
          loading={loading}
          relationships={relationships}
          onOpenTable={(table) => setSelectedName(table.name)}
        />
      </div>
    </>
  );
}

