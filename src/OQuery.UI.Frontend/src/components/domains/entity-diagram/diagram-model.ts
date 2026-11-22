import type { DomainRelation, MetadataEntity } from "../../metadata/metadata-model";
import type { DiagramRelationship, DiagramTable } from "./diagram-view";

export function toDiagramTables(metadata: MetadataEntity[]): DiagramTable[] {
  return metadata.map((item) => ({
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
