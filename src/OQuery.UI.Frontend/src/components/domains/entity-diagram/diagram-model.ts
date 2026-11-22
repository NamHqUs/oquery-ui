import { isSameSchema, type DomainRelation, type MetadataEntity } from "../domain-model";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";
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

// Entities whose definition differs from the physical table they map to: the entity name or a field
// name differs from the table/column, or a field column is missing from the table. Entities that map
// to no loaded table (raw SQL, schema not loaded) are not compared. Relations are not compared.
export function dbSchemaChangedEntityNames(entities: MetadataEntity[], databaseTables: DatabaseTableOption[]): Set<string> {
  const changed = new Set<string>();
  for (const entity of entities) {
    const table = databaseTables.find((item) => item.name === entity.dbTable && isSameSchema(item.schema, entity.schema));
    if (!table) continue;
    const columns = new Set(table.columns.map((column) => column.name));
    const fieldChanged = entity.fields.some((field) =>
      !field.isRawSql && (field.name !== field.dbColumn || (Boolean(field.dbColumn) && !columns.has(field.dbColumn))));
    if (entity.name !== table.name || fieldChanged) changed.add(entity.name);
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
    isRawSql: Boolean(item.isRawSql),
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
