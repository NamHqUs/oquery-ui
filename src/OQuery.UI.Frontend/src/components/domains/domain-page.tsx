import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../shared/icon/icon";
import { updateDomain, type ProjectSummary } from "../../services/project-service";
import { getSchema } from "../../services/db-schema-service";
import type { AppDispatch, RootState } from "../../store/store";
import { metadataEntityFromDto, type DomainRelation, type MetadataEntity } from "./domain-model";
import { clearDomainDraft, domainDraftSaved, setDomainDraftWorking, type DomainGraph } from "./domain-draft-slice";
import { loadDomainDraft } from "./domain-draft-actions";
import MainLayout, { Heading, type WorkspaceView } from "../main-layout/main-layout";
import DiagramView, { diagramGroupTone } from "./entity-diagram/diagram-view";
import { toDiagramRelationships, toDiagramTables } from "./entity-diagram/diagram-model";
import PanelSplitter from "../shared/panel-splitter/panel-splitter";
import ToastNotice from "../shared/toast-notice/toast-notice";
import { useMessageBox } from "../shared/message-box/message-box";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import "./entity-diagram/entity-diagram.css";
import EntityDefinition, { type DatabaseTableOption } from "./entity-definition/entity-definition";
import { removeEntityFromRelations, renameEntityInRelations, toEditable, toEntityPayload, toRelationPayload, type EditableEntity } from "./entity-definition/types";
import { domainCreatePath, domainDiagramPath, domainEditPath, type DomainDiagramRoute } from "./domain-routes";
import DomainWizardPage from "./domain-wizard/domain-wizard-page";

type DomainPageProps = {
  route: DomainDiagramRoute;
  projects: ProjectSummary[];
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
};

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
  if (route.kind !== "view") {
    // Cancel closes the wizard and returns to the diagram of the domain it was opened from (Main for create).
    // Edit shares the diagram's in-memory draft, so applying the wizard only changes that draft until Save.
    const returnDomainId = route.kind === "edit" ? route.domainId : MAIN_DOMAIN_ID;
    const returnToDiagram = () => onNavigate(domainDiagramPath(route.projectId, returnDomainId));
    return (
      <DomainWizardPage
        mode={route.kind}
        projectId={route.projectId}
        domainId={returnDomainId}
        onCancel={returnToDiagram}
        onApplied={returnToDiagram}
      />
    );
  }
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
  const dispatch = useDispatch<AppDispatch>();
  const draftState = useSelector((state: RootState) => state.domainDraft);
  // The store keeps one draft; until its load finishes, the diagram must not show another domain's graph.
  const isCurrentDraft = draftState.projectId === projectId && draftState.domainId === domainId;
  const baseline: DomainGraph = isCurrentDraft ? draftState.baseline : EMPTY_GRAPH;
  const working: DomainGraph = isCurrentDraft ? draftState.working : EMPTY_GRAPH;
  const loading = !isCurrentDraft || draftState.status === "loading";
  const [databaseTables, setDatabaseTables] = useState<DatabaseTableOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [notice, setNotice] = useState<{ message: string; isError: boolean } | null>(null);
  const dirty = JSON.stringify(working) !== JSON.stringify(baseline);
  const panel = useResizablePanel("metadata-entity-diagram-height", 480, 280, 900);
  const showMessageBox = useMessageBox();

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

  // Reuses the in-memory draft when it already holds this domain, so unsaved edits survive the wizard round trip.
  useEffect(() => {
    setSelectedName("");
    if (!projectId || !domainId) {
      dispatch(clearDomainDraft());
      return;
    }
    void dispatch(loadDomainDraft({ projectId, domainId }));
  }, [projectId, domainId, dispatch]);

  const selected = working.entities.find((entity) => entity.name === selectedName) ?? null;
  const draft = useMemo(() => (selected ? toEditable(selected) : null), [selected]);
  const selectedTable = draft?.dbTable
    ? databaseTables.find((table) => table.name === draft.dbTable && table.schema === (draft.schema || "dbo"))
    : undefined;

  const changeDraft = (updater: (draft: EditableEntity) => EditableEntity) => {
    if (!draft) return;
    const next = updater(draft);
    const entity: MetadataEntity = { ...next, fields: next.fields.map(({ id, ...field }) => field) };
    dispatch(setDomainDraftWorking({
      entities: working.entities.map((item) => (item.name === selectedName ? entity : item)),
      relations: renameEntityInRelations(working.relations, selectedName, entity.name),
    }));
    if (entity.name !== selectedName) setSelectedName(entity.name);
  };

  const changeRelations = (updater: (relations: DomainRelation[]) => DomainRelation[]) => {
    dispatch(setDomainDraftWorking({ ...working, relations: updater(working.relations) }));
  };

  // Adds an unmapped entity to the domain and opens it, so its table and fields can be chosen in the editor.
  const createEntity = () => {
    const name = nextEntityName(working.entities);
    dispatch(setDomainDraftWorking({
      ...working,
      entities: [...working.entities, { name, schema: "dbo", dbTable: null, rawSql: "", fields: [] }],
    }));
    setSelectedName(name);
  };

  // Removes the entity and its relations from the in-memory domain only; nothing is persisted until save.
  const removeEntity = () => {
    if (!selectedName) return;
    dispatch(setDomainDraftWorking({
      entities: working.entities.filter((entity) => entity.name !== selectedName),
      relations: removeEntityFromRelations(working.relations, selectedName),
    }));
    setSelectedName("");
  };

  const selectTable = (table: DatabaseTableOption) => {
    changeDraft((current) => ({ ...current, schema: table.schema, dbTable: table.name, rawSql: table.name }));
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const saved = await updateDomain(projectId, domainId, {
        name: draftState.name,
        description: draftState.description,
        entities: working.entities.map(toEntityPayload),
        relations: toRelationPayload(working.relations),
      });
      dispatch(domainDraftSaved({
        projectId,
        domainId,
        name: saved.name,
        description: saved.description,
        entities: saved.entities.map(metadataEntityFromDto),
        relations: saved.relations,
      }));
      setNotice({ message: "Domain saved.", isError: false });
    } catch (error) {
      setNotice({ message: `Save failed. ${error instanceof Error ? error.message : "Something went wrong."}`, isError: true });
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscard = async (title: string, message: string, confirmLabel: string) => {
    const choice = await showMessageBox({
      eyebrow: "Unsaved changes",
      title,
      message,
      actions: [
        { value: "cancel", label: "Cancel" },
        { value: "discard", label: confirmLabel, variant: "danger" },
      ],
    });
    return choice === "discard";
  };

  // Reload replaces the in-memory draft with the saved domain, so it is the only action that discards unsaved edits.
  const reload = async () => {
    if (dirty && !(await confirmDiscard("Reload domain?", "Discard unsaved changes and reload the domain from the server?", "Reload"))) return;
    void dispatch(loadDomainDraft({ projectId, domainId, force: true }));
  };

  const toolbarActions = (
    <div className="editor-actions domain-diagram-actions" role="toolbar" aria-label="Metadata domain actions">
      <button className="domain-action-button primary" type="button" title="Save domain" aria-label="Save domain" onClick={() => void save()} disabled={!dirty || saving}>
        <Icon name="save" size={15} /> Save
      </button>
      <button className="domain-action-button" type="button" title="Reload domain from the server" aria-label="Reload domain" onClick={() => void reload()} disabled={loading || saving}>
        <Icon name="reset" size={15} /> Reload
      </button>
      <button className="domain-action-button" type="button" title="Edit this domain in the wizard" aria-label="Edit domain" onClick={() => onNavigate(domainEditPath(projectId, domainId))}>
        <Icon name="edit" size={15} /> Edit
      </button>
      <button className="domain-action-button create" type="button" title="Create a domain in the wizard" aria-label="Create domain" onClick={() => onNavigate(domainCreatePath(projectId))}>
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
            <div className="editor-actions domain-entity-actions" role="toolbar" aria-label="Entity actions">
              <button className="domain-action-button create" type="button" title="Add a new entity to this domain" aria-label="New entity" onClick={createEntity} disabled={loading || saving}>
                <Icon name="plus" size={14} /> New entity
              </button>
              <button className="domain-action-button danger" type="button" title="Remove the selected entity and its relations" aria-label="Remove entity" onClick={removeEntity} disabled={!draft || loading || saving}>
                <Icon name="trash" size={14} /> Remove entity
              </button>
            </div>
          </div>
          <EntityDefinition
            draft={draft}
            canEdit
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
      <ToastNotice message={notice?.message} isError={notice?.isError} onDismiss={() => setNotice(null)} />
    </>
  );
}

