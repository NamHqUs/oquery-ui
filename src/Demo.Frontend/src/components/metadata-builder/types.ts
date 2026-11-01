import { MetadataEntity, MetadataField, MetadataRelation } from "../query-builder/query-design/query-builder-slice";

let nextFieldId = 1;
export const createFieldId = () => `f_${nextFieldId++}`;

let nextRelationId = 1;
export const createRelationId = () => `r_${nextRelationId++}`;

export type RelationKey = { fromDbColumn: string; toDbColumn: string };
export type EditableField = MetadataField & { id?: string };
export type EditableRelation = MetadataRelation & { id?: string; type: string; relatedKeys: RelationKey[] };
export type EditableEntity = MetadataEntity & { schema: string; rawSql: string; fields: EditableField[]; relations: EditableRelation[] };

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
export const emptyRelation = (): EditableRelation => ({ id: createRelationId(), name: "", relatedEntity: "", type: "Lookup", relatedKeys: [{ fromDbColumn: "", toDbColumn: "" }] });

export function toEditable(entity: MetadataEntity): EditableEntity {
  return {
    ...entity,
    schema: entity.schema || "dbo",
    rawSql: "",
    fields: entity.fields.map((field) => ({ ...field, id: createFieldId() })),
    relations: (entity.relations || []).map((relation) => ({
      ...relation,
      id: (relation as Partial<EditableRelation>).id || createRelationId(),
      type: String(relation.type ?? "Lookup"),
      relatedKeys: (relation as MetadataRelation & { relatedKeys?: RelationKey[] }).relatedKeys || [{ fromDbColumn: "", toDbColumn: "" }],
    })),
  };
}

export function emptyEntity(): EditableEntity {
  return { name: "", schema: "dbo", rawSql: "", fields: [emptyField()], relations: [] };
}
