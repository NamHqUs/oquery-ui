import { useState } from "react";
import type { DomainRelation, MetadataEntity } from "../query-builder/query-design/query-builder-slice";
import DiagramView, { diagramGroupTone, type DiagramRelationship } from "./diagram-view";
import "./domain-diagram.css";

type DomainDiagramProps = {
  entities: MetadataEntity[];
  relations: DomainRelation[];
  domainOptions: { id: string; name: string }[];
  activeDomainId?: string;
  loading?: boolean;
  onSelectDomain?: (domainId: string) => void;
};

type SelectedRelation = DiagramRelationship & { from: string; to: string; sourceRelationIndex: number };

function toDiagramTable(entity: MetadataEntity) {
  return {
    schema: entity.schema || "dbo",
    name: entity.name,
    dbTable: entity.dbTable,
    columns: entity.fields.map((field) => ({
      name: field.name,
      dataType: field.dataType || "String",
      isPrimaryKey: false,
    })),
  };
}

export default function DomainDiagram({
  entities,
  relations,
  domainOptions,
  activeDomainId,
  loading = false,
  onSelectDomain,
}: DomainDiagramProps) {
  const [selectedRelation, setSelectedRelation] = useState<SelectedRelation | null>(null);
  const tables = entities.map(toDiagramTable);
  const groups = domainOptions.map((option, index) => ({
    id: option.id,
    name: option.name,
    tone: diagramGroupTone(index),
    tables: option.id === activeDomainId ? tables : [],
  }));
  const activeDomain = domainOptions.find((option) => option.id === activeDomainId);
  const relationships = relations.map((relation, sourceRelationIndex) => {
    const source = entities.find((entity) => entity.name === relation.sourceEntity);
    const target = entities.find((entity) => entity.name === relation.targetEntity);
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
  const selectedDefinition = selectedRelation ? relations[selectedRelation.sourceRelationIndex] : undefined;

  return (
    <div className="entity-diagram">
      <DiagramView
        tables={tables}
        groups={groups}
        initialGroup={activeDomain?.name || activeDomainId}
        loading={loading}
        relationships={relationships}
        onSelectGroup={onSelectDomain}
        onSelectRelation={(relation) => setSelectedRelation(relation as SelectedRelation)}
        relationInspector={selectedRelation && selectedDefinition && (
          <aside className="metadata-relation-inspector" aria-label="Selected relation">
            <div>
              <span className="section-kicker">SELECTED RELATION</span>
              <strong>{selectedDefinition.sourceRelationName}</strong>
              <span className="metadata-relation-path">
                {selectedDefinition.sourceEntity} <span aria-hidden="true">→</span> {selectedDefinition.targetEntity}
              </span>
            </div>
            <div className="metadata-relation-inspector-fields">
              {selectedDefinition.sourceFields.map((sourceField, index) => (
                <span key={`${sourceField}-${index}`}>
                  {sourceField} <span aria-hidden="true">→</span> {selectedDefinition.targetFields[index]}
                </span>
              ))}
            </div>
          </aside>
        )}
      />
    </div>
  );
}
