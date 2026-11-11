import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import type { DomainRelation, MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import DiagramView, { diagramGroupTone, type DiagramRelationship } from "../../data-sources/diagram-view/diagram-view";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import type { EditableEntity } from "../types";
import "./entity-diagram.css";

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
  onRelationsChange?: (updater: (relations: DomainRelation[]) => DomainRelation[]) => void;
  onSelectDomain?: (domainId: string) => void;
  onOpenEntity: (table: { schema: string; name: string; columns: { name: string; dataType: string; isPrimaryKey: boolean }[] }) => void;
  toolbarActions?: ReactNode;
  entityEditorHeader: ReactNode;
  entityEditor: ReactNode;
};

export default function EntityDiagram({
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
  onRelationsChange,
  onSelectDomain,
  onOpenEntity,
  toolbarActions,
  entityEditorHeader,
  entityEditor,
}: EntityDiagramProps) {
  const panel = useResizablePanel("metadata-entity-diagram-height", 480, 280, 900);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<(DiagramRelationship & { from: string; to: string }) | null>(null);
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
  const relationships = relations.map((relation, sourceRelationIndex) => {
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
      sourceRelationIndex,
    };
  });
  const openRelationSource = (relation: DiagramRelationship & { from: string; to: string }) => {
    const source = displayedEntities.find((entity) => entity.name === relation.sourceTable);
    if (!source) return;
    setSelectedRelation(relation);
    onOpenEntity({
      schema: source.schema || "dbo",
      name: source.name,
      columns: source.fields.map((field) => ({
        name: field.name,
        dataType: field.dataType || "String",
        isPrimaryKey: false,
      })),
    });
  };
  const selectedRelationIndex = selectedRelation?.sourceRelationIndex;
  const selectedRelationDraft = selectedRelationIndex !== undefined
    ? relations[selectedRelationIndex]
    : undefined;
  const selectedSource = selectedRelationDraft
    ? displayedEntities.find((entity) => entity.name === selectedRelationDraft.sourceEntity)
    : undefined;
  const selectedRelationTarget = selectedRelationDraft
    ? displayedEntities.find((entity) => entity.name === selectedRelationDraft.targetEntity)
    : undefined;
  const updateSelectedRelation = (update: (relation: DomainRelation) => DomainRelation) => {
    if (!onRelationsChange || selectedRelationIndex === undefined) return;
    onRelationsChange((current) => current.map((relation, index) =>
      index === selectedRelationIndex ? update(relation) : relation));
  };

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
        onSelectRelation={openRelationSource}
        relationInspector={selectedRelation && (
          <aside className="metadata-relation-inspector" aria-label="Selected relation">
            <div>
              <span className="section-kicker">SELECTED RELATION</span>
              <strong>{selectedRelationDraft?.sourceRelationName || selectedRelation.name || `${selectedRelation.from} to ${selectedRelation.to}`}</strong>
              <span className="metadata-relation-path">
                {selectedRelation.from} <span aria-hidden="true">→</span> {selectedRelation.to}
              </span>
            </div>
            {selectedRelationDraft && (
              <div className="metadata-relation-inspector-fields">
                <label>
                  Source name
                  <input
                    spellCheck={false}
                    value={selectedRelationDraft.sourceRelationName}
                    onChange={(event) => updateSelectedRelation((relation) => ({ ...relation, sourceRelationName: event.target.value }))}
                  />
                </label>
                <label>
                  Target name
                  <input
                    spellCheck={false}
                    value={selectedRelationDraft.targetRelationName}
                    onChange={(event) => updateSelectedRelation((relation) => ({ ...relation, targetRelationName: event.target.value }))}
                  />
                </label>
                <label>
                  Target
                  <select
                    value={selectedRelationDraft.targetEntity}
                    onChange={(event) => updateSelectedRelation((relation) => ({ ...relation, targetEntity: event.target.value }))}
                  >
                    <option value="">Select entity</option>
                    {displayedEntities
                      .filter((entity) => entity.name !== selectedSource?.name)
                      .map((entity) => <option key={entity.name} value={entity.name}>{entity.name}</option>)}
                  </select>
                </label>
                {selectedRelationDraft.sourceFields.map((sourceField, index) => (
                  <div className="metadata-relation-mapping" key={index}>
                    <select
                      value={sourceField}
                      aria-label={`Source field mapping ${index + 1}`}
                      onChange={(event) => updateSelectedRelation((relation) => ({
                        ...relation,
                        sourceFields: relation.sourceFields.map((field, fieldIndex) =>
                          fieldIndex === index ? event.target.value : field),
                      }))}
                    >
                      <option value="">Source field</option>
                      {selectedSource?.fields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}
                    </select>
                    <span aria-hidden="true">→</span>
                    <select
                      value={selectedRelationDraft.targetFields[index]}
                      aria-label={`Target field mapping ${index + 1}`}
                      onChange={(event) => updateSelectedRelation((relation) => ({
                        ...relation,
                        targetFields: relation.targetFields.map((field, fieldIndex) =>
                          fieldIndex === index ? event.target.value : field),
                      }))}
                    >
                      <option value="">Target field</option>
                      {selectedRelationTarget?.fields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary compact metadata-relation-remove"
                  onClick={() => {
                    if (!onRelationsChange || selectedRelationIndex === undefined) return;
                    onRelationsChange((current) => current.filter((_, index) => index !== selectedRelationIndex));
                    setSelectedRelation(null);
                  }}
                >
                  Remove relation
                </button>
              </div>
            )}
          </aside>
        )}
        onOpenTable={onOpenEntity}
      />
      </div>
    </>
  );
}
