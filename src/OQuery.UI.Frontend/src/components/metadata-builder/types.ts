import type { DomainRelation, MetadataField } from "../query-builder/query-design/query-builder-slice";
import type { FullDomain, SubDomainConfig, SubDomainEntity } from "../../services/project-service";

export type RelationSide = {
  relation: string;
  refEntity: string;
  keyColumns: string[];
};

export function relationSidesFor(entity: string, relations: DomainRelation[]): RelationSide[] {
  return relations.flatMap((relation) => [
    ...(relation.sourceEntity === entity
      ? [{ relation: relation.sourceRelationName, refEntity: relation.targetEntity, keyColumns: relation.sourceFields }]
      : []),
    ...(relation.targetEntity === entity
      ? [{ relation: relation.targetRelationName, refEntity: relation.sourceEntity, keyColumns: relation.targetFields }]
      : []),
  ]);
}

export function referenceKeys(sides: RelationSide[]): Set<string> {
  return new Set(sides.flatMap((side) => side.keyColumns.map((column) => column.trim().toLowerCase())));
}

export function isReferenceField(field: MetadataField, keys: Set<string>): boolean {
  return keys.has(field.name.trim().toLowerCase()) || Boolean(field.dbColumn && keys.has(field.dbColumn.trim().toLowerCase()));
}

export function emptySubDomain(): SubDomainConfig {
  return { id: "", name: "", description: "", entities: [] };
}

export function findOverride(config: SubDomainConfig, entity: string): SubDomainEntity | undefined {
  return config.entities.find((item) => item.entity === entity);
}

export function setEntityExposed(config: SubDomainConfig, entity: string, exposed: boolean): SubDomainConfig {
  if (!exposed) return { ...config, entities: config.entities.filter((item) => item.entity !== entity) };
  if (findOverride(config, entity)) return config;
  return {
    ...config,
    entities: [...config.entities, { entity, entityName: null, fieldNames: [], excludedFields: [], relationNames: [] }],
  };
}

export function updateOverride(
  config: SubDomainConfig,
  entity: string,
  update: (item: SubDomainEntity) => SubDomainEntity,
): SubDomainConfig {
  return { ...config, entities: config.entities.map((item) => (item.entity === entity ? update(item) : item)) };
}

export function setFieldName(item: SubDomainEntity, field: string, fieldName: string): SubDomainEntity {
  const exists = item.fieldNames.some((rename) => rename.field === field);
  return {
    ...item,
    fieldNames: exists
      ? item.fieldNames.map((rename) => (rename.field === field ? { field, fieldName } : rename))
      : [...item.fieldNames, { field, fieldName }],
  };
}

export function setFieldExcluded(item: SubDomainEntity, field: string, excluded: boolean): SubDomainEntity {
  const others = item.excludedFields.filter((name) => name !== field);
  return { ...item, excludedFields: excluded ? [...others, field] : others };
}

export function setRelationName(item: SubDomainEntity, relation: string, relationName: string): SubDomainEntity {
  const exists = item.relationNames.some((rename) => rename.relation === relation);
  return {
    ...item,
    relationNames: exists
      ? item.relationNames.map((rename) => (rename.relation === relation ? { relation, relationName } : rename))
      : [...item.relationNames, { relation, relationName }],
  };
}

export function exposedEntityName(item: SubDomainEntity): string {
  return item.entityName?.trim() || item.entity;
}

export function effectiveFieldName(item: SubDomainEntity, field: string): string {
  return item.fieldNames.find((rename) => rename.field === field)?.fieldName ?? field;
}

export function effectiveRelationName(item: SubDomainEntity, relation: string): string {
  return item.relationNames.find((rename) => rename.relation === relation)?.relationName ?? relation;
}

export function toSubDomainPayload(config: SubDomainConfig) {
  return {
    name: config.name.trim(),
    description: config.description.trim(),
    entities: config.entities.map((item) => {
      const entityName = item.entityName?.trim() ?? "";
      return {
        entity: item.entity,
        entityName: entityName && entityName !== item.entity ? entityName : null,
        fieldNames: item.fieldNames
          .map((rename) => ({ field: rename.field, fieldName: rename.fieldName.trim() }))
          .filter((rename) => rename.fieldName && rename.fieldName !== rename.field && !item.excludedFields.includes(rename.field)),
        excludedFields: item.excludedFields,
        relationNames: item.relationNames
          .map((rename) => ({ relation: rename.relation, relationName: rename.relationName.trim() }))
          .filter((rename) => rename.relationName && rename.relationName !== rename.relation),
      };
    }),
  };
}

export function findSubDomainProblem(config: SubDomainConfig, fullDomain: FullDomain): string | null {
  if (!config.name.trim()) return "Every sub-domain needs a name.";
  const exposedOriginals = new Set(config.entities.map((item) => item.entity));
  const exposedNames = new Set<string>();

  for (const item of config.entities) {
    if (!fullDomain.entities.some((entity) => entity.name === item.entity)) {
      return `Entity "${item.entity}" is not part of the full domain.`;
    }
    const exposedName = exposedEntityName(item).toLowerCase();
    if (exposedNames.has(exposedName)) return `More than one entity is named "${exposedEntityName(item)}".`;
    exposedNames.add(exposedName);
  }

  for (const item of config.entities) {
    const source = fullDomain.entities.find((entity) => entity.name === item.entity);
    const fieldNames = new Set<string>();
    for (const field of source?.fields ?? []) {
      if (item.excludedFields.includes(field.name)) continue;
      const name = effectiveFieldName(item, field.name).trim();
      if (!name) return `Field "${field.name}" on "${exposedEntityName(item)}" needs a name.`;
      if (fieldNames.has(name.toLowerCase())) return `Entity "${exposedEntityName(item)}" has duplicate field names.`;
      fieldNames.add(name.toLowerCase());
    }

    const relationNames = new Set<string>();
    for (const side of relationSidesFor(item.entity, fullDomain.relations)) {
      if (!exposedOriginals.has(side.refEntity)) continue;
      const name = effectiveRelationName(item, side.relation).trim();
      if (!name) return `Relation "${side.relation}" on "${exposedEntityName(item)}" needs a name.`;
      if (relationNames.has(name.toLowerCase())) return `Entity "${exposedEntityName(item)}" has duplicate relation names.`;
      relationNames.add(name.toLowerCase());
    }
  }
  return null;
}
