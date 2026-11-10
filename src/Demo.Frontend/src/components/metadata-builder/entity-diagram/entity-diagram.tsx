import { useState, type ReactNode } from "react";
import type { MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import DiagramView, { diagramGroupTone, type DiagramRelationship } from "../../data-sources/diagram-view/diagram-view";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import type { EditableEntity } from "../types";
import "./entity-diagram.css";

type EntityDiagramProps = {
  entities: MetadataEntity[];
  domains?: { name: string; entities: MetadataEntity[] }[];
  activeScopeName?: string;
  editingEntity?: EditableEntity | null;
  editingEntityName?: string;
  onDraftChange?: (updater: (draft: EditableEntity) => EditableEntity) => void;
  onSelectDomain?: (name: string) => void;
  onOpenEntity: (table: { schema: string; name: string; columns: { name: string; dataType: string; isPrimaryKey: boolean }[] }) => void;
  entityEditorHeader: ReactNode;
  entityEditor: ReactNode;
};

export default function EntityDiagram({
  entities,
  domains,
  activeScopeName,
  editingEntity,
  editingEntityName,
  onDraftChange,
  onSelectDomain,
  onOpenEntity,
  entityEditorHeader,
  entityEditor,
}: EntityDiagramProps) {
  const panel = useResizablePanel("metadata-entity-diagram-height", 600, 420, 900);
  const [selectedRelation, setSelectedRelation] = useState<(DiagramRelationship & { from: string; to: string }) | null>(null);
  const applyDraft = (entity: MetadataEntity) =>
    editingEntity && entity.name === editingEntityName ? editingEntity : entity;
  const displayedEntities = entities.map(applyDraft);
  const tables = displayedEntities.map((entity) => ({
    schema: entity.schema || "dbo",
    name: entity.name,
    columns: entity.fields.map((field) => ({
      name: field.name,
      dataType: field.dataType || "String",
      isPrimaryKey: false,
    })),
  }));
  const scopeGroups = domains?.map((scope, index) => ({
    name: scope.name,
    tone: diagramGroupTone(index),
    tables: scope.entities.map(applyDraft).map((entity) => ({
      schema: entity.schema || "dbo",
      name: entity.name,
      columns: entity.fields.map((field) => ({
        name: field.name,
        dataType: field.dataType || "String",
        isPrimaryKey: false,
      })),
    })),
  }));
  const relationships = displayedEntities.flatMap((entity) =>
    (entity.relations || []).map((relation, sourceRelationIndex) => {
      const targetName = relation.refEntity === editingEntityName
        ? editingEntity?.name || relation.refEntity
        : relation.refEntity;
      const target = displayedEntities.find((candidate) => candidate.name === targetName);
      return {
        name: relation.name || `${entity.name} to ${targetName}`,
        sourceSchema: entity.schema || "dbo",
        sourceTable: entity.name,
        sourceColumns: (relation.refKeys || []).map((key) => key.dbColumn),
        targetSchema: target?.schema || "dbo",
        targetTable: targetName,
        targetColumns: (relation.refKeys || []).map((key) => key.refDbColumn),
        isUnique: false,
        sourceRelationIndex,
      };
    }),
  );
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
  const selectedSource = selectedRelation
    ? editingEntity?.name === selectedRelation.sourceTable ? editingEntity : undefined
    : undefined;
  const selectedRelationDraft = selectedSource && selectedRelation?.sourceRelationIndex !== undefined
    ? selectedSource.relations[selectedRelation.sourceRelationIndex]
    : undefined;
  const selectedRelationTarget = selectedRelationDraft
    ? displayedEntities.find((entity) => entity.name === selectedRelationDraft.refEntity)
    : undefined;
  const updateSelectedRelation = (update: (relation: NonNullable<typeof selectedRelationDraft>) => NonNullable<typeof selectedRelationDraft>) => {
    if (!onDraftChange || !selectedRelation || selectedRelation.sourceRelationIndex === undefined) return;
    onDraftChange((draft) => ({
      ...draft,
      relations: draft.relations.map((relation, index) =>
        index === selectedRelation.sourceRelationIndex ? update(relation) : relation,
      ),
    }));
  };

  return (
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
        groups={scopeGroups}
        initialGroup={activeScopeName}
        relationships={relationships}
        onSelectGroup={onSelectDomain}
        onSelectRelation={openRelationSource}
        relationInspector={selectedRelation && (
          <aside className="metadata-relation-inspector" aria-label="Selected relation">
            <div>
              <span className="section-kicker">SELECTED RELATION</span>
              <strong>{selectedRelationDraft?.name || selectedRelation.name || `${selectedRelation.from} to ${selectedRelation.to}`}</strong>
              <span className="metadata-relation-path">
                {selectedRelation.from} <span aria-hidden="true">→</span> {selectedRelation.to}
              </span>
            </div>
            {selectedRelationDraft && (
              <div className="metadata-relation-inspector-fields">
                <label>
                  Name
                  <input
                    spellCheck={false}
                    value={selectedRelationDraft.name}
                    onChange={(event) => updateSelectedRelation((relation) => ({ ...relation, name: event.target.value }))}
                  />
                </label>
                <label>
                  Target
                  <select
                    value={selectedRelationDraft.refEntity}
                    onChange={(event) => updateSelectedRelation((relation) => ({ ...relation, refEntity: event.target.value }))}
                  >
                    <option value="">Select entity</option>
                    {displayedEntities
                      .filter((entity) => entity.name !== selectedSource?.name)
                      .map((entity) => <option key={entity.name} value={entity.name}>{entity.name}</option>)}
                  </select>
                </label>
                {selectedRelationDraft.refKeys.map((key, index) => (
                  <div className="metadata-relation-mapping" key={index}>
                    <select
                      value={key.dbColumn}
                      aria-label={`Source field mapping ${index + 1}`}
                      onChange={(event) => updateSelectedRelation((relation) => ({
                        ...relation,
                        refKeys: relation.refKeys.map((mapping, mappingIndex) =>
                          mappingIndex === index ? { ...mapping, dbColumn: event.target.value } : mapping),
                      }))}
                    >
                      <option value="">Source field</option>
                      {selectedSource?.fields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}
                    </select>
                    <span aria-hidden="true">→</span>
                    <select
                      value={key.refDbColumn}
                      aria-label={`Target field mapping ${index + 1}`}
                      onChange={(event) => updateSelectedRelation((relation) => ({
                        ...relation,
                        refKeys: relation.refKeys.map((mapping, mappingIndex) =>
                          mappingIndex === index ? { ...mapping, refDbColumn: event.target.value } : mapping),
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
                    if (!onDraftChange || selectedRelation.sourceRelationIndex === undefined) return;
                    onDraftChange((draft) => ({
                      ...draft,
                      relations: draft.relations.filter((_, index) => index !== selectedRelation.sourceRelationIndex),
                    }));
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
  );
}
