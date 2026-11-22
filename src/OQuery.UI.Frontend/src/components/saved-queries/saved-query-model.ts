export type MatchOperation = "+" | "-" | "*" | "/" | "%" | "&" | "|";

export type IFieldDefinition =
  | { kind: "field"; field: string; oper?: MatchOperation }
  | { kind: "value"; value: unknown; oper?: MatchOperation }
  | { kind: "group"; arguments: IFieldDefinition[]; oper?: MatchOperation }
  | { kind: "function"; function: string; arguments: IFieldDefinition[]; oper?: MatchOperation }
  | { kind: "condition"; condition: ApiQueryFilterGroup; oper?: MatchOperation };

export type QueryFilterItem = {
  field: string;
  fieldExpression?: IFieldDefinition;
  operation: number | string;
  value: string;
  rightField?: string;
  parameterized: boolean;
  logicalOperator: number;
  enabled: boolean;
};

export type QueryFilterNode = QueryFilterItem | QueryFilterGroup;

export type QueryFilterGroup = {
  logicalOperation: number;
  filters: QueryFilterNode[];
  note?: string;
};

type ApiFilterOperand = IFieldDefinition;

type ApiQueryFilterItem = {
  logicalOperator?: number | null;
  left?: ApiFilterOperand | string;
  right?: ApiFilterOperand | string | number | boolean | null;
  operation: number | string;
  parameterized?: boolean;
  field?: ApiFilterOperand | string;
  value?: unknown;
  enabled?: boolean;
};

type ApiQueryFilterNode = ApiQueryFilterItem | ApiQueryFilterGroup;

type ApiQueryFilterGroup = Omit<QueryFilterGroup, "filters"> & {
  filters: ApiQueryFilterNode[];
};

export type ApiProjectionNode =
  | { kind: "field"; field: string; oper?: MatchOperation }
  | { kind: "value"; value: unknown; oper?: MatchOperation }
  | { kind: "group"; fields: ApiProjectionNode[]; oper?: MatchOperation }
  | { kind: "function"; function: string; arguments: ApiProjectionNode[]; oper?: MatchOperation }
  | { kind: "condition"; condition: ApiQueryFilterGroup; oper?: MatchOperation };

export type ApiProjectionDefinition =
  | { fields: ApiProjectionNode[]; alias: string | null }
  | { field: IFieldDefinition; alias: string | null };

type ApiQueryContextDto = {
  id?: string;
  name?: string;
  entity: string;
  projection?: ApiProjectionDefinition[];
  filters?: ApiQueryFilterGroup | null;
  sorts?: { field: string | IFieldDefinition; direction: number | string }[] | null;
  page?: number | null;
  pageSize?: number | null;
  relations?: {
    refContext: string;
    alias?: string | null;
    condition: ApiQueryFilterNode | string | null;
    joinType?: number | string | null;
  }[] | null;
  joins?: ApiQueryContextDto["relations"];
};

export type ApiQueryDto = {
  id: string;
  name: string;
  domainId: string;
  rawText?: string | null;
  entity: string;
  projection: ApiProjectionDefinition[];
  filter?: ApiQueryFilterGroup | null;
  sorts?: { field: string | IFieldDefinition; direction: number | string }[] | null;
  page?: number | null;
  pageSize?: number | null;
  relations?: {
    refContext: string;
    alias?: string | null;
    condition: ApiQueryFilterNode | string | null;
    joinType?: number | string | null;
  }[] | null;
  contexts?: Record<string, ApiQueryContextDto> | null;
  isBuiltin: boolean;
};

export type SavedQueryRequestDto = ApiQueryDto;

export function normalizeQueryRequestProjection(item: Record<string, unknown>): Record<string, unknown> {
  const normalizeContext = (name: string, value: Record<string, unknown>) => {
    const joins = value.relations ?? value.joins;
    const take = typeof value.take === "number" ? value.take : value.pageSize;
    const skip = typeof value.skip === "number"
      ? value.skip
      : typeof value.page === "number" && typeof take === "number"
        ? Math.max(0, value.page - 1) * take
        : null;
    return {
      ...value,
      id: value.id ?? name,
      name: value.name ?? name,
      projection: Array.isArray(value.projection) ? value.projection : value.projections,
      filters: value.filters ?? value.filter ?? null,
      sorts: value.sorts ?? null,
      page: value.page ?? (typeof skip === "number" && typeof take === "number" && take > 0
        ? Math.floor(skip / take) + 1
        : null),
      pageSize: value.pageSize ?? take ?? null,
      relations: Array.isArray(joins) ? joins : null,
    };
  };
  const contexts = item.contexts;
  const normalizedContexts = contexts && typeof contexts === "object" && !Array.isArray(contexts)
    ? Object.fromEntries(
      Object.entries(contexts).map(([name, context]) => [
        name,
        context && typeof context === "object" && !Array.isArray(context)
          ? normalizeContext(name, context as Record<string, unknown>)
          : context,
      ]),
    )
    : contexts;
  const take = typeof item.take === "number" ? item.take : item.pageSize;
  const skip = typeof item.skip === "number"
    ? item.skip
    : typeof item.page === "number" && typeof take === "number"
      ? Math.max(0, item.page - 1) * take
      : null;
  return {
    ...item,
    domainId: item.domainId,
    projection: Array.isArray(item.projection) ? item.projection : item.projections,
    page: item.page ?? (typeof skip === "number" && typeof take === "number" && take > 0
      ? Math.floor(skip / take) + 1
      : null),
    pageSize: item.pageSize ?? take ?? null,
    relations: Array.isArray(item.relations) ? item.relations : item.joins,
    contexts: normalizedContexts,
  };
}
