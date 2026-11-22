export type MetadataField = {
  name: string;
  dbColumn?: string | null;
  dataType?: string;
  isRawSql?: boolean;
};

export type MetadataEntity = {
  name: string;
  schema?: string | null;
  dbTable?: string | null;
  fields: MetadataField[];
  rawSql?: string;
};

export type DomainRelation = {
  sourceEntity: string;
  sourceRelationName: string;
  sourceFields: string[];
  targetEntity: string;
  targetRelationName: string;
  targetFields: string[];
};

export type DomainEntityDto = {
  name: string;
  dbSchema?: string | null;
  dbTable?: string | null;
  rawSql?: string;
  fields: MetadataField[];
};

export function metadataEntityFromDto(entity: DomainEntityDto): MetadataEntity {
  return {
    name: entity.name,
    schema: entity.dbSchema ?? null,
    dbTable: entity.dbTable,
    rawSql: entity.rawSql,
    fields: entity.fields,
  };
}

export type EntityRelationView = {
  relationIndex: number;
  side: "source" | "target";
  name: string;
  refEntity: string;
  fromFields: string[];
  toFields: string[];
};

export function relationsForEntity(entityName: string, relations: DomainRelation[] | undefined): EntityRelationView[] {
  return (relations ?? []).flatMap((relation, relationIndex): EntityRelationView[] => {
    const views: EntityRelationView[] = [];
    if (relation.sourceEntity === entityName) {
      views.push({
        relationIndex,
        side: "source",
        name: relation.sourceRelationName,
        refEntity: relation.targetEntity,
        fromFields: [...relation.sourceFields],
        toFields: [...relation.targetFields],
      });
    }
    if (relation.targetEntity === entityName) {
      views.push({
        relationIndex,
        side: "target",
        name: relation.targetRelationName,
        refEntity: relation.sourceEntity,
        fromFields: [...relation.targetFields],
        toFields: [...relation.sourceFields],
      });
    }
    return views;
  });
}
