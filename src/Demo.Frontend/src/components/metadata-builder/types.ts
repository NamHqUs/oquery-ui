import type { DomainRelation, MetadataEntity, MetadataField } from "../query-builder/query-design/query-builder-slice";

export type { DomainRelation } from "../query-builder/query-design/query-builder-slice";

let nextFieldId = 1;
export const createFieldId = () => `f_${nextFieldId++}`;

export type EditableField = MetadataField & { id?: string };
export type EditableEntity = MetadataEntity & { schema: string; rawSql: string; fields: EditableField[] };

export function toAbstractDataType(databaseType?: string, columnName?: string): string {
  const type = databaseType?.trim().toLowerCase() || "";
  const name = columnName?.trim().toLowerCase() || "";
  if (/^(is|has|can|should)[a-z0-9_]/.test(name) || /(bool|boolean|flag)$/.test(name)) return "Boolean";
  if (/(birth|date|time|created|updated|deleted)/.test(name)) return "Datetime";
  if (/(bool|boolean|bit)/.test(type)) return "Boolean";
  if (/(date|time|timestamp)/.test(type)) return "Datetime";
  if (/(bigint|smallint|tinyint|int|numeric|decimal|number|money|float|double|real|serial)/.test(type)) return "Number";
  return "String";
}

export const emptyField = (): EditableField => ({ id: createFieldId(), name: "", dbColumn: "", dataType: "String", isRawSql: false });

export function toEditable(entity: MetadataEntity): EditableEntity {
  return {
    ...entity,
    schema: entity.schema || "dbo",
    rawSql: entity.rawSql || "",
    fields: entity.fields.map((field) => ({ ...field, id: createFieldId() })),
  };
}

export function emptyEntity(): EditableEntity {
  return { name: "", schema: "dbo", rawSql: "", fields: [] };
}

export function toEntityPayload(entity: MetadataEntity) {
  return {
    name: entity.name,
    dbSchema: entity.schema || undefined,
    rawSql: entity.rawSql || entity.name,
    fields: entity.fields.map((field) => ({
      name: field.name,
      dbColumn: field.dbColumn,
      dataType: field.dataType,
      isRawSql: field.isRawSql,
    })),
  };
}

export function toRelationPayload(relations: DomainRelation[]): DomainRelation[] {
  return relations.map((relation) => ({
    sourceEntity: relation.sourceEntity.trim(),
    sourceRelationName: relation.sourceRelationName.trim(),
    sourceFields: relation.sourceFields.map((field) => field.trim()),
    targetEntity: relation.targetEntity.trim(),
    targetRelationName: relation.targetRelationName.trim(),
    targetFields: relation.targetFields.map((field) => field.trim()),
  }));
}

export function renameEntitiesInRelations(relations: DomainRelation[], renames: ReadonlyMap<string, string>): DomainRelation[] {
  if (!renames.size) return relations;
  const rename = (name: string) => renames.get(name) ?? name;
  return relations.map((relation) => ({
    ...relation,
    sourceEntity: rename(relation.sourceEntity),
    targetEntity: rename(relation.targetEntity),
  }));
}

export function renameEntityInRelations(relations: DomainRelation[], from: string, to: string): DomainRelation[] {
  return renameEntitiesInRelations(relations, new Map([[from, to]]));
}

export function removeEntityFromRelations(relations: DomainRelation[], name: string): DomainRelation[] {
  return relations.filter((relation) => relation.sourceEntity !== name && relation.targetEntity !== name);
}

export function findEntityNameProblem(entities: Pick<MetadataEntity, "name">[]): string | null {
  const names = new Set<string>();
  for (const entity of entities) {
    const name = entity.name.trim();
    const normalizedName = name.toLowerCase();
    if (!name) return "Every entity must have a name.";
    if (names.has(normalizedName)) return `An entity named "${name}" already exists in this domain.`;
    names.add(normalizedName);
  }
  return null;
}

export function singularize(value: string): string {
  return value.endsWith("ies") ? `${value.slice(0, -3)}y` : value.endsWith("s") && !value.endsWith("ss") ? value.slice(0, -1) : value;
}

export function pluralize(value: string): string {
  return value.endsWith("y") ? `${value.slice(0, -1)}ies` : value.endsWith("s") ? value : `${value}s`;
}

export type RelationSideChanges = {
  name?: string;
  refEntity?: string;
  fromFields?: string[];
  toFields?: string[];
};

export function updateRelationSide(relation: DomainRelation, side: "source" | "target", changes: RelationSideChanges): DomainRelation {
  if (side === "source") {
    return {
      ...relation,
      sourceRelationName: changes.name ?? relation.sourceRelationName,
      targetEntity: changes.refEntity ?? relation.targetEntity,
      sourceFields: changes.fromFields ?? relation.sourceFields,
      targetFields: changes.toFields ?? relation.targetFields,
    };
  }
  return {
    ...relation,
    targetRelationName: changes.name ?? relation.targetRelationName,
    sourceEntity: changes.refEntity ?? relation.sourceEntity,
    targetFields: changes.fromFields ?? relation.targetFields,
    sourceFields: changes.toFields ?? relation.sourceFields,
  };
}

export function findRelationProblem(entities: Pick<MetadataEntity, "name">[], relations: DomainRelation[]): string | null {
  const entityNames = new Set(entities.map((entity) => entity.name.trim()));
  for (const relation of relations) {
    const sourceEntity = relation.sourceEntity.trim();
    const targetEntity = relation.targetEntity.trim();
    if (!sourceEntity || !targetEntity) return "Every relation must have a source and a target entity.";
    if (!entityNames.has(sourceEntity) || !entityNames.has(targetEntity)) return "Every relation must reference entities in this domain.";
    if (!relation.sourceRelationName.trim() || !relation.targetRelationName.trim()) return "Every relation must have a name on both sides.";
    if (!relation.sourceFields.length
      || relation.sourceFields.length !== relation.targetFields.length
      || [...relation.sourceFields, ...relation.targetFields].some((field) => !field.trim())) {
      return "Every relation must map equal, non-empty From and To columns.";
    }
  }
  return null;
}
