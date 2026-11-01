import { type ReactNode } from "react";
import type { MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import DiagramView from "../../data-sources/diagram-view/diagram-view";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import "./entity-diagram.css";

type EntityDiagramProps = {
  entities: MetadataEntity[];
  onOpenEntity: (table: { schema: string; name: string; columns: { name: string; dataType: string; isPrimaryKey: boolean }[] }) => void;
  entityEditorHeader: ReactNode;
  entityEditor: ReactNode;
};

export default function EntityDiagram({ entities, onOpenEntity, entityEditorHeader, entityEditor }: EntityDiagramProps) {
  const panel = useResizablePanel("metadata-entity-diagram");
  const tables = entities.map((entity) => ({
    schema: entity.schema || "dbo",
    name: entity.name,
    columns: entity.fields.map((field) => ({
      name: field.name,
      dataType: field.dataType || "String",
      isPrimaryKey: false,
    })),
  }));

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
      <DiagramView tables={tables} onOpenTable={onOpenEntity} />
    </div>
  );
}
