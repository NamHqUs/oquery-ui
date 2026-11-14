import { relationsForEntity, type DomainRelation, type MetadataEntity } from "../query-builder/query-design/query-builder-slice";

export function getOQuerySuggestionData(metadata: MetadataEntity[], relations: DomainRelation[]) {
  return {
    fields: [...new Set(metadata.flatMap((item) => item.fields.map((field) => field.name)))],
    entities: metadata.map((item) => item.name),
    entitiesMetadata: metadata.map((item) => ({
      name: item.name,
      fields: item.fields.map((field) => field.name),
      fieldDataTypes: Object.fromEntries(
        item.fields.flatMap((field) => field.dataType ? [[field.name, field.dataType]] : []),
      ),
      relations: relationsForEntity(item.name, relations).map((relation) => ({
        name: relation.name,
        target: relation.refEntity,
        kind: relation.side === "target" ? "collection" : "lookup",
      })),
    })),
  };
}
