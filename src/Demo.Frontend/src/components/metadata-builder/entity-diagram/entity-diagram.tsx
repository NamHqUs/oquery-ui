import { type ReactNode } from "react";
import type { MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import DiagramView, { diagramGroupTone } from "../../data-sources/diagram-view/diagram-view";
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
  onSelectDomain,
  onOpenEntity,
  entityEditorHeader,
  entityEditor,
}: EntityDiagramProps) {
  const panel = useResizablePanel("metadata-entity-diagram");
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
    (entity.relations || []).map((relation) => {
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
      };
    }),
  );

  return (
    <div
      className={`metadata-diagram-mode-content split-workspace${panel.collapsed ? " panel-collapsed" : ""}`}
      style={panel.style}
    >
      <section className="metadata-diagram-editor split-panel" aria-label="Entity definition editor">
        {entityEditorHeader}
        {entityEditor}
      </section>
      <PanelSplitter panel={panel} label="entity editor panel" />
      <DiagramView
        tables={tables}
        groups={scopeGroups}
        initialGroup={activeScopeName}
        relationships={relationships}
        onSelectGroup={onSelectDomain}
        onOpenTable={onOpenEntity}
      />
    </div>
  );
}
