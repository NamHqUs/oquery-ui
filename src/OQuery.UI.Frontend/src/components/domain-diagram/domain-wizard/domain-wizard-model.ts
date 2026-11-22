import type { DomainRelation, MetadataEntity } from "../../query-builder/query-design/query-builder-slice";
import { pluralize, singularize, toAbstractDataType } from "../entity-definition/types";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";

export type DomainGraph = { entities: MetadataEntity[]; relations: DomainRelation[] };

export type DatabaseRelationship = {
  name: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
};

// Per-table choices made in the Edit wizard for tables that are not yet mapped to an entity.
export type TableDesign = { name?: string; excludedColumns: string[] };

export function tableKey(schema: string | null | undefined, table: string) {
  return `${schema ?? ""}.${table}`;
}

export function entityTableKey(entity: MetadataEntity) {
  return tableKey(entity.schema, entity.dbTable || entity.rawSql || entity.name);
}

// Entities whose table exists in the database but was deselected are removed. Entities without a
// database table (custom entities) are never removed by the wizard because the picker cannot show them.
export function buildEditedGraph(
  base: DomainGraph,
  tables: DatabaseTableOption[],
  relationships: DatabaseRelationship[],
  selectedKeys: ReadonlySet<string>,
  design: Readonly<Record<string, TableDesign>>,
): DomainGraph {
  const databaseKeys = new Set(tables.map((table) => tableKey(table.schema, table.name)));
  const kept = base.entities.filter((entity) => {
    const key = entityTableKey(entity);
    return !databaseKeys.has(key) || selectedKeys.has(key);
  });
  const mappedKeys = new Set(kept.map(entityTableKey));
  const added: MetadataEntity[] = tables
    .map((table) => ({ table, key: tableKey(table.schema, table.name) }))
    .filter(({ key }) => selectedKeys.has(key) && !mappedKeys.has(key))
    .map(({ table, key }) => {
      const excluded = new Set(design[key]?.excludedColumns ?? []);
      return {
        name: design[key]?.name?.trim() || table.name,
        schema: table.schema,
        dbTable: table.name,
        rawSql: table.name,
        fields: table.columns
          .filter((column) => !excluded.has(column.name))
          .map((column) => ({
            name: column.name,
            dbColumn: column.name,
            dataType: toAbstractDataType(column.dataType, column.name),
            isRawSql: false,
          })),
      };
    });
  const entities = [...kept, ...added];
  const entityByKey = new Map(entities.map((entity) => [entityTableKey(entity), entity]));
  const entityNames = new Set(entities.map((entity) => entity.name));
  const relations = base.relations.filter((relation) => entityNames.has(relation.sourceEntity) && entityNames.has(relation.targetEntity));
  const addedKeys = new Set(added.map(entityTableKey));
  for (const relationship of relationships) {
    const sourceKey = tableKey(relationship.sourceSchema, relationship.sourceTable);
    const targetKey = tableKey(relationship.targetSchema, relationship.targetTable);
    if (!addedKeys.has(sourceKey) && !addedKeys.has(targetKey)) continue;
    const source = entityByKey.get(sourceKey);
    const target = entityByKey.get(targetKey);
    if (!source || !target) continue;
    const sourceNames = new Set(source.fields.map((field) => field.name));
    const targetNames = new Set(target.fields.map((field) => field.name));
    if (!relationship.sourceColumns.every((column) => sourceNames.has(column))
      || !relationship.targetColumns.every((column) => targetNames.has(column))) continue;
    const exists = relations.some((relation) => relation.sourceEntity === source.name
      && relation.targetEntity === target.name
      && relation.sourceFields.join("|") === relationship.sourceColumns.join("|")
      && relation.targetFields.join("|") === relationship.targetColumns.join("|"));
    if (exists) continue;
    relations.push({
      sourceEntity: source.name,
      sourceRelationName: singularize(target.name),
      sourceFields: [...relationship.sourceColumns],
      targetEntity: target.name,
      targetRelationName: pluralize(source.name),
      targetFields: [...relationship.targetColumns],
    });
  }
  return { entities, relations };
}
