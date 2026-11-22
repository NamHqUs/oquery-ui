import type { DomainRelation, MetadataEntity } from "../domain-model";
import type { DomainGraph } from "../domain-draft-slice";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";
import { findEntityNameProblem, findRelationProblem, toAbstractDataType } from "../entity-definition/types";

export type DatabaseRelationship = {
  name: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
};
export type RelationNames = { lookup: string; collection: string };

export const tableKey = (schema: string | null | undefined, table: string) => `${schema ?? ""}.${table}`;
export const tableKeyOf = (table: DatabaseTableOption) => tableKey(table.schema, table.name);

// Maps each database table to the domain entity built from it. An entity without a schema matches by table name.
export function tableEntityMap(entities: MetadataEntity[], tables: DatabaseTableOption[]): Map<string, MetadataEntity> {
  const map = new Map<string, MetadataEntity>();
  for (const table of tables) {
    const entity = entities.find((item) => item.dbTable === table.name && (!item.schema || item.schema === table.schema));
    if (entity) map.set(tableKeyOf(table), entity);
  }
  return map;
}

export type WizardSelection = {
  selectedKeys: Set<string>;
  excludedColumns: Record<string, string[]>;
  fieldNames: Record<string, Record<string, string>>;
};

// Edit mode starts from the domain in memory: mapped tables are selected, columns without a field are excluded,
// and existing field names are kept.
export function seedWizardSelection(entities: MetadataEntity[], tables: DatabaseTableOption[]): WizardSelection {
  const selectedKeys = new Set<string>();
  const excludedColumns: Record<string, string[]> = {};
  const fieldNames: Record<string, Record<string, string>> = {};
  for (const [key, entity] of tableEntityMap(entities, tables)) {
    const table = tables.find((item) => tableKeyOf(item) === key);
    if (!table) continue;
    const fieldByColumn = new Map(entity.fields.filter((field) => field.dbColumn).map((field) => [field.dbColumn ?? "", field]));
    selectedKeys.add(key);
    excludedColumns[key] = table.columns.filter((column) => !fieldByColumn.has(column.name)).map((column) => column.name);
    fieldNames[key] = Object.fromEntries(
      table.columns.filter((column) => fieldByColumn.has(column.name)).map((column) => [column.name, fieldByColumn.get(column.name)?.name ?? column.name]),
    );
  }
  return { selectedKeys, excludedColumns, fieldNames };
}

export type WizardApplyInput = {
  graph: DomainGraph;
  tables: DatabaseTableOption[];
  chosen: DatabaseTableOption[];
  relationships: DatabaseRelationship[];
  excludedColumns: Record<string, string[]>;
  entityName: (table: DatabaseTableOption) => string;
  fieldName: (table: DatabaseTableOption, column: string) => string;
  relationNames: (relation: DatabaseRelationship) => RelationNames;
};

// Produces the domain graph after the wizard is applied. Only the in-memory graph changes; nothing is saved.
// - A table that was deselected removes its entity and every relation that touches it.
// - Entities the wizard does not manage (no database table, or a table that is not listed) are kept as they are.
// - Relations already in the domain are kept when both entities and their fields still exist.
// - Foreign keys between the chosen tables become relations unless an equivalent relation already exists.
export function applyWizardToGraph(input: WizardApplyInput): { graph: DomainGraph } | { error: string } {
  const { graph, tables, chosen, relationships, excludedColumns, entityName, fieldName, relationNames } = input;
  const mapped = tableEntityMap(graph.entities, tables);
  const tableKeyByEntity = new Map([...mapped].map(([key, entity]) => [entity, key]));
  const chosenByKey = new Map(chosen.map((table) => [tableKeyOf(table), table]));

  const buildEntity = (table: DatabaseTableOption): MetadataEntity => {
    const current = mapped.get(tableKeyOf(table));
    const excluded = excludedColumns[tableKeyOf(table)] ?? [];
    const columnNames = new Set(table.columns.map((column) => column.name));
    const columnFields: MetadataEntity["fields"] = table.columns
      .filter((column) => !excluded.includes(column.name))
      .map((column) => ({
        name: fieldName(table, column.name),
        dbColumn: column.name,
        dataType: current?.fields.find((field) => field.dbColumn === column.name)?.dataType ?? toAbstractDataType(column.dataType, column.name),
        isRawSql: false,
      }));
    // Fields the wizard does not model (raw SQL expressions) are preserved.
    const unmodeled = (current?.fields ?? []).filter((field) => !field.dbColumn || !columnNames.has(field.dbColumn));
    return {
      name: entityName(table),
      schema: table.schema,
      dbTable: table.name,
      rawSql: current?.rawSql || table.name,
      fields: [...columnFields, ...unmodeled],
    };
  };

  const built = new Map(chosen.map((table) => [tableKeyOf(table), buildEntity(table)]));
  const placed = new Set<string>();
  const entities: MetadataEntity[] = [];
  for (const entity of graph.entities) {
    const key = tableKeyByEntity.get(entity);
    if (key === undefined) {
      entities.push(entity);
      continue;
    }
    const next = built.get(key);
    if (next && !placed.has(key)) {
      entities.push(next);
      placed.add(key);
    }
  }
  for (const [key, entity] of built) if (!placed.has(key)) entities.push(entity);

  const fieldsByEntity = new Map(entities.map((entity) => [entity.name, new Set(entity.fields.map((field) => field.name))]));
  const hasFields = (entityName: string, fields: string[]) => {
    const names = fieldsByEntity.get(entityName);
    return names !== undefined && fields.every((field) => names.has(field));
  };
  const kept = graph.relations.filter((relation) => hasFields(relation.sourceEntity, relation.sourceFields) && hasFields(relation.targetEntity, relation.targetFields));
  const relationKeyOf = (relation: DomainRelation) => JSON.stringify([relation.sourceEntity, relation.targetEntity, relation.sourceFields, relation.targetFields]);
  const seen = new Set(kept.map(relationKeyOf));
  const generated: DomainRelation[] = [];
  for (const relationship of relationships) {
    const source = chosenByKey.get(tableKey(relationship.sourceSchema, relationship.sourceTable));
    const target = chosenByKey.get(tableKey(relationship.targetSchema, relationship.targetTable));
    if (!source || !target) continue;
    const names = relationNames(relationship);
    const relation: DomainRelation = {
      sourceEntity: entityName(source),
      sourceRelationName: names.lookup,
      sourceFields: relationship.sourceColumns.map((column) => fieldName(source, column)),
      targetEntity: entityName(target),
      targetRelationName: names.collection,
      targetFields: relationship.targetColumns.map((column) => fieldName(target, column)),
    };
    if (!hasFields(relation.sourceEntity, relation.sourceFields) || !hasFields(relation.targetEntity, relation.targetFields)) continue;
    const key = relationKeyOf(relation);
    if (seen.has(key)) continue;
    seen.add(key);
    generated.push(relation);
  }

  const relations = [...kept, ...generated];
  const entityProblem = findEntityNameProblem(entities);
  if (entityProblem) return { error: entityProblem };
  const relationProblem = findRelationProblem(entities, relations);
  if (relationProblem) return { error: relationProblem };
  return { graph: { entities, relations } };
}
