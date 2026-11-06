import type { MetadataEntity } from "../query-builder/query-design/query-builder-slice";

export function getOQuerySuggestionData(metadata: MetadataEntity[]) {
  return {
    fields: [...new Set(metadata.flatMap((item) => item.fields.map((field) => field.name)))],
    entities: metadata.map((item) => item.name),
    entitiesMetadata: metadata.map((item) => ({
      name: item.name,
      fields: item.fields.map((field) => field.name),
      relations: (item.relations ?? []).map((relation) => ({
        name: relation.name,
        target: relation.refEntity,
      })),
    })),
  };
}
