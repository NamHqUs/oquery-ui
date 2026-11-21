import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import type { DomainRelation, MetadataEntity } from "../query-builder/query-design/query-builder-slice";
import DiagramView, { diagramGroupTone } from "./diagram-view";
import PanelSplitter from "../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import type { EditableEntity } from "./entity-definition/types";
import "./domain-diagram.css";

type EntityDiagramProps = {
  entities: MetadataEntity[];
  relations: DomainRelation[];
  domains?: { id: string; name: string; entities: MetadataEntity[] }[];
  domainOptions?: { id: string; name: string }[];
  activeDomainId?: string;
  selectedEntityName?: string;
  loading?: boolean;
  editingEntity?: EditableEntity | null;
  editingEntityName?: string;
  onDraftChange?: (updater: (draft: EditableEntity) => EditableEntity) => void;
  onSelectDomain?: (domainId: string) => void;
  onOpenEntity: (table: { schema: string; name: string; columns: { name: string; dataType: string; isPrimaryKey: boolean }[] }) => void;
  toolbarActions?: ReactNode;
  entityEditorHeader: ReactNode;
  entityEditor: ReactNode;
};

export default function DomainDiagram({
  entities,
  relations,
  domains,
  domainOptions,
  activeDomainId,
  selectedEntityName,
  loading = false,
  editingEntity,
  editingEntityName,
  onDraftChange,
  onSelectDomain,
  onOpenEntity,
  toolbarActions,
  entityEditorHeader,
  entityEditor,
}: EntityDiagramProps) {
  const panel = useResizablePanel("metadata-entity-diagram-height", 480, 280, 900);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  useEffect(() => setToolbarHost(document.getElementById("metadata-toolbar-actions")), []);
  const applyDraft = (entity: MetadataEntity) =>
    editingEntity && entity.name === editingEntityName ? editingEntity : entity;
  const isNewDraft = Boolean(editingEntity && !editingEntityName && editingEntity.name.trim());
  const displayedEntities = [
    ...entities.filter((entity) => !isNewDraft || entity.name !== editingEntity?.name),
    ...(isNewDraft ? [editingEntity] : []),
  ].map(applyDraft);
  const tables = displayedEntities.map((entity) => ({
    schema: entity.schema || "dbo",
    name: entity.name,
    dbTable: entity.dbTable,
    columns: entity.fields.map((field) => ({
      name: field.name,
      dataType: field.dataType || "String",
      isPrimaryKey: false,
    })),
  }));
  const domainGroups = (domainOptions || domains)?.map((domainEntry, index) => ({
    id: domainEntry.id,
    name: domainEntry.name,
    tone: diagramGroupTone(index),
    tables: (domainEntry.id === activeDomainId || (!activeDomainId && domainEntry.id === "All")
      ? displayedEntities
      : domains?.find(domain => domain.id === domainEntry.id)?.entities || [])
      .map(applyDraft).map((entity) => ({
      schema: entity.schema || "dbo",
      name: entity.name,
      dbTable: entity.dbTable,
      columns: entity.fields.map((field) => ({
        name: field.name,
        dataType: field.dataType || "String",
        isPrimaryKey: false,
      })),
    })),
  }));
  const activeDomain = (domainOptions || domains)?.find((domain) => domain.id === activeDomainId);
  const relationships = relations.map((relation) => {
    const source = displayedEntities.find((entity) => entity.name === relation.sourceEntity);
    const target = displayedEntities.find((entity) => entity.name === relation.targetEntity);
    return {
      name: relation.sourceRelationName || `${relation.sourceEntity} to ${relation.targetEntity}`,
      sourceSchema: source?.schema || "dbo",
      sourceTable: relation.sourceEntity,
      sourceColumns: [...relation.sourceFields],
      targetSchema: target?.schema || "dbo",
      targetTable: relation.targetEntity,
      targetColumns: [...relation.targetFields],
      isUnique: false,
    };
  });
  return (
    <>
      {toolbarHost && toolbarActions && createPortal(toolbarActions, toolbarHost)}
      <div
        className="metadata-diagram-mode-content split-workspace"
        style={panel.style}
      >
      <section className="metadata-diagram-editor split-panel" aria-label="Entity definition editor">
        {entityEditorHeader}
        {entityEditor}
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
        groups={domainGroups}
        initialGroup={activeDomain?.name || activeDomainId}
        selectedTableName={selectedEntityName}
        loading={loading}
        relationships={relationships}
        onSelectGroup={onSelectDomain}
        onOpenTable={onOpenEntity}
      />
      </div>
    </>
  );
}
