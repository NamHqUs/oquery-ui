import type { DomainRelation, MetadataEntity } from "../domain-model";
import type { DiagramRelationship, DiagramTable } from "./diagram-view";

// Names of working entities that differ from the saved graph: new, renamed, edited fields, or
// touched by an added/removed relation. Removed entities are not on the diagram, so they are skipped.
export function changedEntityNames(baseline: { entities: MetadataEntity[]; relations: DomainRelation[] }, working: { entities: MetadataEntity[]; relations: DomainRelation[] }): Set<string> {
  const changed = new Set<string>();
  const savedEntities = new Map(baseline.entities.map((entity) => [entity.name, JSON.stringify(entity)]));
  for (const entity of working.entities) {
    if (savedEntities.get(entity.name) !== JSON.stringify(entity)) changed.add(entity.name);
  }
  const savedRelations = new Set(baseline.relations.map((relation) => JSON.stringify(relation)));
  const workingRelations = new Set(working.relations.map((relation) => JSON.stringify(relation)));
  for (const relation of working.relations) {
    if (!savedRelations.has(JSON.stringify(relation))) markRelation(changed, relation);
  }
  for (const relation of baseline.relations) {
    if (!workingRelations.has(JSON.stringify(relation))) markRelation(changed, relation);
  }
  return changed;
}

function markRelation(changed: Set<string>, relation: DomainRelation) {
  changed.add(relation.sourceEntity);
  changed.add(relation.targetEntity);
}

export function toDiagramTables(metadata: MetadataEntity[], idOf?: (name: string) => string): DiagramTable[] {
  return metadata.map((item) => ({
    id: idOf?.(item.name),
    schema: item.schema || "dbo",
    name: item.name,
    dbTable: item.dbTable,
    columns: item.fields.map((field) => ({
      name: field.name,
      dataType: field.dataType || "String",
      isPrimaryKey: false,
    })),
  }));
}

export function toDiagramRelationships(metadata: MetadataEntity[], relations: DomainRelation[]): DiagramRelationship[] {
  return relations.map((relation) => {
    const source = metadata.find((item) => item.name === relation.sourceEntity);
    const target = metadata.find((item) => item.name === relation.targetEntity);
    return {
      name: relation.sourceRelationName || `${relation.sourceEntity} to ${relation.targetEntity}`,
      sourceSchema: source?.schema || "dbo",
      sourceTable: relation.sourceEntity,
      sourceColumns: relation.sourceFields,
      targetSchema: target?.schema || "dbo",
      targetTable: relation.targetEntity,
      targetColumns: relation.targetFields,
      targetRelationName: relation.targetRelationName,
      isUnique: false,
    };
  });
}
