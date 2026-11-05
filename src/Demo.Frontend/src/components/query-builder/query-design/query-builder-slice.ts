import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { apiUrls } from "../../../const/api-urls";
import type { FunctionDefinition } from "../../function-definition/types";
import { formatApiError } from "./api-error";

export type MetadataField = {
  name: string;
  dbColumn?: string | null;
  dataType?: string;
  isRawSql?: boolean;
};

export type FilterOperatorDefinition = {
  id: string;
  name: string;
  symbol: string;
  supportedDataTypes: string[];
  isBuiltin: boolean;
};

type StoredQueryContextPayload = {
  entity: string;
  projection: ApiProjectionDefinition[];
  filter?: ApiQueryFilterGroup | null;
  sorts?: { field: string | IFieldDefinition; direction: number | string }[] | null;
  take?: number | null;
  skip?: number | null;
  joins?: ApiQueryDto["relations"];
};

type StoredQueryRequestPayload = {
  id: string;
  name: string;
  entity: string;
  projections: ApiProjectionDefinition[];
  filter?: ApiQueryFilterGroup | null;
  sorts?: { field: string | IFieldDefinition; direction: number | string }[] | null;
  take?: number | null;
  skip?: number | null;
  joins?: ApiQueryDto["relations"];
  contexts?: Record<string, StoredQueryContextPayload> | null;
  isBuiltin: boolean;
};

export type MetadataRelation = {
  name: string;
  refEntity: string;
  type?: number | string;
  refKeys?: RelationKey[];
};

export type RelationKey = { dbColumn: string; refDbColumn: string };

export type MetadataEntity = {
  name: string;
  schema?: string | null;
  fields: MetadataField[];
  relations?: MetadataRelation[];
  canDelete?: boolean;
  rawSql?: string;
};

export type MatchOperation = "+" | "-" | "*" | "/" | "%" | "&" | "|";

export type IFieldDefinition =
  | { kind: "field"; field: string; oper?: MatchOperation }
  | { kind: "value"; value: unknown; oper?: MatchOperation }
  | { kind: "group"; arguments: IFieldDefinition[]; oper?: MatchOperation }
  | { kind: "function"; function: string; arguments: IFieldDefinition[]; oper?: MatchOperation }
  | { kind: "condition"; condition: ApiQueryFilterGroup; oper?: MatchOperation };

export type QueryColumn = {
  field: string;
  alias: string | null;
  expression?: IFieldDefinition;
};

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

export type QueryDefinition = {
  entity: string;
  columns: QueryColumn[];
  contexts?: ApiQueryContextDefinition[] | null;
  contextCatalog?: ApiQueryContextDefinition[] | null;
  projectionRows?: string[][];
  filters: QueryFilterGroup;
  sorts: { field: string; direction: string; expression?: IFieldDefinition }[];
  page: number | null;
  pageSize: number | null;
};

export type ApiQueryRequest = Omit<QueryDefinition, "filters" | "sorts" | "columns" | "projectionRows"> & {
  filter: ApiQueryFilterGroup | null;
  sorts: { field: string | IFieldDefinition; direction: number }[];
  projection: ApiProjectionDefinition[];
  contexts?: ApiQueryContextDefinition[] | null;
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

export type ApiQueryDefinition = {
  name?: string;
  entity: string;
  projection?: ApiProjectionDefinition[];
  filter?: ApiQueryFilterNode | null;
  sorts?: { field: string | IFieldDefinition; direction: number | string }[];
  page?: number | null;
  pageSize?: number | null;
  contexts?: ApiQueryContextDefinition[] | Record<string, ApiQueryContextDto> | null;
  relations?: ApiQueryDto["relations"];
};

export type ApiQueryContextDefinition = {
  name: string;
  alias?: string;
  joinType?: number | string | null;
  query: ApiQueryDefinition;
  condition?: ApiQueryFilterNode | string | null;
  id?: string;
};

export function hasApiQueryCondition(condition: ApiQueryContextDefinition["condition"]): boolean {
  if (condition == null) return false;
  if (typeof condition === "string") return Boolean(condition.trim());
  if ("filters" in condition) return condition.filters.some((filter) => hasApiQueryCondition(filter));
  return true;
}

function isSourceContext(context: ApiQueryContextDefinition, entity: string): boolean {
  return context.name === entity
    && !context.alias?.trim()
    && !hasApiQueryCondition(context.condition);
}

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

export type ReportDto = {
  fileName: string;
  name?: string | null;
  query: ApiQueryRequest;
  requestText?: string | null;
  description?: string | null;
  chartType?: string | null;
  canDelete: boolean;
};

export type SavedQueryRequestDto = ApiQueryDto;

type ApiSavedQueryRequestDto = {
  id: string;
  name: string;
  entity: string;
  projection: ApiProjectionDefinition[];
  filter?: ApiQueryFilterGroup | null;
  sorts?: { field: string | IFieldDefinition; direction: number | string }[] | null;
  relations?: ApiQueryDto["relations"];
  contexts?: Record<string, ApiQueryContextDto> | null;
  isBuiltin: boolean;
};

function createApiFilter(group: QueryFilterGroup): ApiQueryFilterGroup | null {
  const filters = group.filters.flatMap((filter) => {
    if ("filters" in filter) {
      const nested = createApiFilter(filter);
      return nested ? [nested] : [];
    }
    return filter.enabled && (filter.fieldExpression || filter.field) ? [{
      logicalOperator: filter.logicalOperator,
      left: filter.fieldExpression ?? { kind: "field", field: filter.field },
      operation: filter.operation,
      right: filter.rightField
        ? { kind: "field", field: filter.rightField }
        : { kind: "value", value: filter.value },
      parameterized: filter.parameterized,
    }] : [];
  });

  return filters.length ? { logicalOperation: group.logicalOperation, filters } : null;
}

export type QueryResult = {
  name: string;
  columns: string[];
  rows: string[][];
  totalRecords: number;
};

async function getApiError(response: Response, fallback: string): Promise<Error> {
  const body = await response.text();
  return new Error(formatApiError(body, fallback));
}

async function requestJson(url: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Could not reach the query API: ${error instanceof Error ? error.message : "network error"}`);
  }
  if (!response.ok) {
    throw await getApiError(response, `Query request failed (${response.status}).`);
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error("Query API returned invalid JSON.");
  }
}

function normalizeQueryRequestProjection(item: Record<string, unknown>): Record<string, unknown> {
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
    projection: Array.isArray(item.projection) ? item.projection : item.projections,
    page: item.page ?? (typeof skip === "number" && typeof take === "number" && take > 0
      ? Math.floor(skip / take) + 1
      : null),
    pageSize: item.pageSize ?? take ?? null,
    relations: Array.isArray(item.relations) ? item.relations : item.joins,
    contexts: normalizedContexts,
  };
}

async function requestText(url: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Could not reach the query API: ${error instanceof Error ? error.message : "network error"}`);
  }
  if (!response.ok) {
    throw await getApiError(response, `Query request failed (${response.status}).`);
  }
  return response.text();
}

export function createApiQuery(definition: QueryDefinition) {
  const { filters, sorts, columns, contextCatalog: _contextCatalog, ...query } = definition;
  delete query.projectionRows;
  const noPaging = definition.pageSize !== null && definition.pageSize < 1;
  const contexts = query.contexts?.map((context) =>
    isSourceContext(context, query.entity)
      ? { ...context, condition: null }
      : context);
  return {
    ...query,
    contexts,
    projection: columns.map(({ field, alias, expression }) => ({
      field: expression ?? { kind: "field", field },
      alias,
    })),
    page: noPaging ? null : query.page,
    pageSize: noPaging ? null : query.pageSize,
    sorts: sorts.map(({ field, expression, direction }) => ({
      field: expression ?? field,
      direction: direction === "desc" ? 1 : 0,
    })),
    filter: createApiFilter(filters),
  };
}

type BackendApiQueryDefinition = Omit<ApiQueryDefinition, "contexts" | "relations"> & {
  contexts?: Record<string, BackendApiQueryDefinition> | null;
  joins?: ApiQueryDto["relations"];
};

function toBackendApiQuery(query: ApiQueryDefinition): BackendApiQueryDefinition {
  const { contexts: _contexts, relations: _relations, ...queryWithoutClientRelations } = query;
  const contextDefinitions = Array.isArray(query.contexts) ? query.contexts : [];
  const contexts = Object.fromEntries(
    contextDefinitions.map((context) => [
      context.name,
      toBackendApiQuery(context.query),
    ]),
  );
  const relations = [
    ...(query.relations ?? []),
    ...contextDefinitions
      .filter((context) => !isSourceContext(context, query.entity))
      .map((context) => ({
        refContext: context.name,
        alias: context.alias ?? null,
        condition: context.condition ?? null,
        joinType: context.joinType ?? null,
      })),
  ];

  return {
    ...queryWithoutClientRelations,
    contexts: Object.keys(contexts).length ? contexts : null,
    joins: relations.length ? relations : null,
  };
}

export function fromApiQueryDefinition(query: ApiQueryDefinition): QueryDefinition {
  query = normalizeApiQueryDefinition(query);
  const filter = query.filter
    ? "filters" in query.filter
      ? query.filter
      : { logicalOperation: 0, filters: [query.filter] }
    : null;
  const contextCatalog: ApiQueryContextDefinition[] = [];
  const addContext = (context: ApiQueryContextDefinition) => {
    const key = context.id ?? context.name;
    if (contextCatalog.some((item) => (item.id ?? item.name) === key)) return;
    contextCatalog.push(context);
    context.query.contexts?.forEach(addContext);
  };
  query.contexts?.forEach(addContext);

  return fromApiQuery({
    entity: query.entity,
    projection: query.projection ?? [],
    filter,
    sorts: (query.sorts ?? []).map((sort) => ({
      ...sort,
      direction: sort.direction === 1 || sort.direction === "desc" ? 1 : 0,
    })),
    page: query.page ?? null,
    pageSize: query.pageSize ?? null,
    contexts: query.contexts,
    contextCatalog,
  });
}

function normalizeApiQueryDefinition(query: ApiQueryDefinition): ApiQueryDefinition {
  const queryWithLegacyRelations = query as ApiQueryDefinition & {
    joins?: ApiQueryDefinition["relations"];
  };
  const relations = query.relations ?? queryWithLegacyRelations.joins;
  if (!query.contexts || Array.isArray(query.contexts))
    return {
      ...query,
      relations,
      contexts: query.contexts?.map((context) => ({
        ...context,
        query: normalizeApiQueryDefinition(context.query),
      })),
    };

  const entries = Object.entries(query.contexts);
  const byReference = new Map(entries.flatMap(([name, context]) => [
    [name, { name, context }] as const,
    ...(context.id ? [[context.id, { name, context }] as const] : []),
  ]));
  const visiting = new Set<string>();

  const buildContext = (
    name: string,
    context: ApiQueryContextDto,
    relation?: ApiQueryDto["relations"][number],
  ): ApiQueryContextDefinition => {
    const identity = context.id ?? name;
    if (!visiting.add(identity))
      throw new Error(`Query API returned recursive context '${name}'.`);

    const nestedContexts = (context.relations ?? context.joins ?? []).map((nestedRelation) => {
      const referenced = byReference.get(nestedRelation.refContext);
      if (!referenced)
        throw new Error(`Query API returned an unknown context reference '${nestedRelation.refContext}'.`);
      return buildContext(referenced.name, referenced.context, nestedRelation);
    });

    visiting.delete(identity);
    return {
      id: context.id ?? name,
      name,
      alias: relation?.alias ?? undefined,
      joinType: relation?.joinType,
      condition: relation?.condition,
      query: {
        name,
        entity: context.entity,
        projection: context.projection ?? [],
        filter: context.filters,
        sorts: context.sorts ?? [],
        page: context.page,
        pageSize: context.pageSize,
        contexts: nestedContexts.length ? nestedContexts : undefined,
      },
    };
  };

  const contextRelations = relations ?? entries.map(([refContext]) => ({ refContext }));
  return {
    ...query,
    relations: contextRelations,
    contexts: contextRelations.map((relation) => {
      const referenced = byReference.get(relation.refContext);
      if (!referenced)
        throw new Error(`Query API returned an unknown context reference '${relation.refContext}'.`);
      return buildContext(referenced.name, referenced.context, relation);
    }),
  };
}

function normalizeMatchOperation(value: unknown): MatchOperation | undefined {
  const operations: Record<string, MatchOperation> = {
    add: "+",
    subtract: "-",
    multiply: "*",
    divide: "/",
    modulus: "%",
    bitwiseand: "&",
    bitwiseor: "|",
  };
  if (typeof value === "string") {
    if (isMatchOperation(value)) return value;
    return operations[value.toLowerCase()];
  }
  return typeof value === "number"
    ? ["+", "-", "*", "/", "%", "&", "|"][value] as MatchOperation | undefined
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeFieldDefinition(value: unknown): IFieldDefinition | undefined {
  if (!value || typeof value !== "object" || !("kind" in value)) return undefined;

  switch (value.kind) {
    case "field": {
      if (!("field" in value) || typeof value.field !== "string") return undefined;
      return applyApiOperator({ kind: "field", field: value.field }, value);
    }
    case "value": {
      if (!("value" in value)) return undefined;
      return applyApiOperator({ kind: "value", value: value.value }, value);
    }
    case "math": {
      const oper = "oper" in value ? normalizeMatchOperation(value.oper) : undefined;
      const field = "field" in value ? normalizeFieldDefinition(value.field) : undefined;
      return oper && field ? { ...field, oper } : undefined;
    }
    case "group": {
      const argumentsValue = "arguments" in value ? value.arguments : "fields" in value ? value.fields : undefined;
      if (!Array.isArray(argumentsValue)) return undefined;
      const arguments_: IFieldDefinition[] = [];
      for (const argument of argumentsValue) {
        const normalizedArgument = normalizeFieldDefinition(argument);
        if (!normalizedArgument) return undefined;
        arguments_.push(normalizedArgument);
      }
      const operatorValue = "operator" in value ? value.operator : undefined;
      const operator = operatorValue === undefined ? undefined : normalizeMatchOperation(operatorValue);
      if (operatorValue !== undefined && !operator) return undefined;
      const group: IFieldDefinition = {
        kind: "group",
        arguments: arguments_.map((argument, index) =>
          operator && index > 0 && argument.oper === undefined
            ? { ...argument, oper: operator }
            : argument,
        ),
      };
      return applyApiOperator(group, value);
    }
    case "function": {
      if (!("function" in value) || typeof value.function !== "string"
        || !("arguments" in value) || !Array.isArray(value.arguments)) return undefined;
      const arguments_: IFieldDefinition[] = [];
      for (const argument of value.arguments) {
        const normalizedArgument = normalizeFieldDefinition(argument);
        if (!normalizedArgument) return undefined;
        arguments_.push(normalizedArgument);
      }
      return applyApiOperator(
        { kind: "function", function: value.function, arguments: arguments_ },
        value,
      );
    }
    case "condition": {
      if (!("condition" in value) || !isRecord(value.condition)
        || !Array.isArray(value.condition.filters)) return undefined;
      return applyApiOperator(
        { kind: "condition", condition: value.condition as ApiQueryFilterGroup },
        value,
      );
    }
    default:
      return undefined;
  }
}

function applyApiOperator(
  expression: IFieldDefinition,
  node: object,
): IFieldDefinition | undefined {
  if (!("oper" in node)) return expression;
  const operation = normalizeMatchOperation(node.oper);
  if (!operation) return undefined;
  if (operation === "+") return expression;
  return { ...expression, oper: operation };
}

export function normalizeApiProjectionDefinition(
  projection: ApiProjectionDefinition,
): IFieldDefinition | undefined {
  if ("field" in projection)
    return normalizeFieldDefinition(projection.field);
  if (!Array.isArray(projection.fields) || projection.fields.length === 0)
    return undefined;

  const fields = projection.fields.map(normalizeFieldDefinition);
  if (fields.some((field) => !field)) return undefined;
  const definitions = fields.filter((field): field is IFieldDefinition => field !== undefined);
  return definitions.length === 1
    ? definitions[0]
    : { kind: "group", arguments: definitions };
}

function isFieldDefinition(value: unknown): value is IFieldDefinition {
  return normalizeFieldDefinition(value) !== undefined;
}

function isMatchOperation(value: unknown): value is MatchOperation {
  return value === "+" || value === "-" || value === "*" || value === "/" || value === "%"
    || value === "&" || value === "|";
}

function expressionToText(expression: IFieldDefinition): string {
  const formatOperand = (operand: IFieldDefinition): string => {
    const text = expressionToText({ ...operand, oper: undefined });
    return operand.kind === "group" ? `(${text})` : text;
  };
  let text: string;
  switch (expression.kind) {
    case "field":
      text = expression.field;
      break;
    case "value":
      text = `<${String(expression.value ?? "")}>`;
      break;
    case "group":
      text = expression.arguments.map((argument, index) => {
        const operation = index === 0 ? undefined : argument.oper ?? "+";
        return `${operation ? `${operation} ` : ""}${formatOperand(argument)}`;
      }).join(" ");
      break;
    case "function":
      text = `${expression.function}[${expression.arguments.map(expressionToText).join(", ")}]`;
      break;
  }
  return expression.oper && expression.oper !== "+" ? `${expression.oper} ${text}` : text;
}

function filterOperandToText(operand: ApiFilterOperand | string): string {
  if (typeof operand === "string") return operand;

  if (operand.kind === "function")
    return `${operand.function}(${operand.arguments.map(filterOperandToText).join(", ")})`;
  return expressionToText(operand);
}

function fromApiQuery(query: ApiQueryRequest, projectionRows?: string[][]): QueryDefinition {
  const restoreGroup = (group: ApiQueryFilterGroup): QueryFilterGroup => ({
    ...group,
    filters: group.filters.map((node): QueryFilterNode => {
      if ("filters" in node) return restoreGroup(node);
      const left = node.left ?? node.field;
      const fieldExpression = normalizeFieldDefinition(left);
      const field = typeof left === "string"
        ? left
        : fieldExpression
          ? filterOperandToText(fieldExpression)
          : "";
      const right = node.right;
      const rightExpression = normalizeFieldDefinition(right);
      const rightField = rightExpression && rightExpression.kind !== "value"
        ? filterOperandToText(rightExpression)
        : undefined;
      const value = rightField
        ? ""
        : rightExpression?.kind === "value"
        ? String(rightExpression.value ?? "")
        : "right" in node
          ? String(right ?? "")
          : String(node.value ?? "");
      return {
        field,
        ...(fieldExpression ? { fieldExpression } : {}),
        operation: node.operation,
        value,
        ...(rightField ? { rightField } : {}),
        parameterized: node.parameterized ?? false,
        logicalOperator: node.logicalOperator ?? 0,
        enabled: true,
      };
    }),
  });

  return {
    entity: query.entity,
    contexts: query.contexts ?? undefined,
    contextCatalog: query.contextCatalog ?? undefined,
    columns: query.projection.map((projection, index) => {
      const expression = normalizeApiProjectionDefinition(projection);
      if (!expression) throw new Error("Query API returned an unsupported projection expression.");
      return {
      field: expression.kind === "field"
        ? expression.field
        : `__calculated__${index}`,
      alias: projection.alias,
      ...(expression.kind === "field" ? {} : { expression }),
    };
    }),
    projectionRows: projectionRows?.length
      ? projectionRows.map((row) => [...row])
      : query.projection.length
      ? [query.projection.map((projection, index) => {
        const expression = normalizeApiProjectionDefinition(projection);
        if (!expression) throw new Error("Query API returned an unsupported projection expression.");
        return expression.kind === "field"
          ? expression.field
          : `__calculated__${index}`;
      })]
      : [[]],
    filters: query.filter ? restoreGroup(query.filter) : { logicalOperation: 0, filters: [] },
    sorts: query.sorts.map((sort) => {
      const direction = sort.direction === 1 ? "desc" : "asc";
      if (typeof sort.field === "string") return { ...sort, direction };
      const expression = normalizeFieldDefinition(sort.field);
      if (!expression) throw new Error("Query API returned an unsupported sort expression.");
      return expression.kind === "field"
        ? { field: expression.field, direction }
        : { field: expressionToText(expression), expression, direction };
    }),
        page: query.page,
        pageSize: query.pageSize,
  };
}

type QueryBuilderSavedView = {
  query: ApiQueryRequest;
  projectionRows: string[][];
};

export function toQueryBuilderSavedView(request: ApiSavedQueryRequest): QueryBuilderSavedView {
  const fields: ApiProjectionDefinition[] = [];
  const projectionRows: string[][] = [];
  let row: string[] = [];
  const mainQuery = request;
  const contextEntries = Object.entries(request.contexts ?? {}).map(([name, context]) => ({
    ...context,
    name,
    id: context.id ?? name,
  }));
  const contextsById = new Map(contextEntries.map((context) => [context.id!, context]));
  const toApiDefinition = (context: ApiQueryContextDto, visited = new Set<string>()): ApiQueryDefinition => {
    const contextId = context.id!;
    if (!visited.add(contextId)) throw new Error(`Query API returned recursive context '${contextId}'.`);
    const contexts = (context.relations ?? []).map((joined) => {
      const referenced = contextsById.get(joined.refContext);
      if (!referenced) throw new Error(`Query API returned an unknown context reference '${joined.refContext}'.`);
      return {
        id: referenced.id!,
        name: referenced.name!,
        alias: joined.alias,
        joinType: joined.joinType,
        condition: joined.condition,
        query: toApiDefinition(referenced, new Set(visited)),
      };
    });
    return {
    name: context.name,
    entity: context.entity,
    projection: context.projection ?? [],
    filter: context.filters,
    sorts: context.sorts ?? [],
    page: context.page,
    pageSize: context.pageSize,
    contexts: contexts.length ? contexts : undefined,
    };
  };
  const extraRelations: ApiQueryContextDefinition[] = (mainQuery.relations ?? []).map((joined) => {
    const context = contextsById.get(joined.refContext);
    if (!context) throw new Error(`Query API returned an unknown context reference '${joined.refContext}'.`);
    return {
      id: context.id,
      name: context.name,
      alias: joined.alias,
      joinType: joined.joinType,
      condition: joined.condition,
      query: toApiDefinition(context),
    };
  });
  const sourceContextDto = contextEntries.find((context) =>
    context.name === mainQuery.entity);
  const sourceContext: ApiQueryContextDefinition | undefined = sourceContextDto
    ? {
      id: sourceContextDto.id,
      name: sourceContextDto.name,
      joinType: 1,
      condition: null,
      query: toApiDefinition(sourceContextDto),
    }
    : undefined;
  const queryContexts = [
    ...(sourceContext ? [sourceContext] : []),
    ...extraRelations.filter((context) =>
      !(sourceContextDto
        && context.id === sourceContextDto.id
        && (context.alias === sourceContextDto.name || !context.alias?.trim())
        && !hasApiQueryCondition(context.condition))),
  ];
  const contextCatalog: ApiQueryContextDefinition[] = contextEntries.map((context) => ({
    id: context.id!,
    name: context.name!,
    query: toApiDefinition(context),
  }));

  (mainQuery.projection ?? []).forEach((projection, index) => {
    if (projection.alias?.toUpperCase() === "NEW_LINE") {
      if (row.length) projectionRows.push(row);
      row = [];
      return;
    }

    fields.push(projection);
    const expression = normalizeApiProjectionDefinition(projection);
    if (!expression) throw new Error("Query API returned an unsupported projection expression.");
    row.push(expression.kind === "field"
      ? expression.field
      : `__calculated__${fields.length - 1}`);
  });
  if (row.length) projectionRows.push(row);

  return {
    query: {
      entity: mainQuery.entity,
      projection: fields,
      filter: mainQuery.filter ?? null,
      sorts: mainQuery.sorts ?? [],
      page: mainQuery.page ?? null,
      pageSize: mainQuery.pageSize ?? null,
      contexts: queryContexts.length ? queryContexts : undefined,
      contextCatalog,
    },
    projectionRows,
  };
}

function getSavedProjectionRows(definition: QueryDefinition): string[][] {
  const rows = definition.projectionRows?.length
    ? definition.projectionRows
    : definition.columns.length
      ? [definition.columns.map((column) => column.field)]
      : [];
  return rows.filter((row) => row.length).map((row) => [...row]);
}

function toApiSavedRequest(request: { name: string; definition: QueryDefinition; id?: string }): StoredQueryRequestPayload {
  const apiQuery = createApiQuery(request.definition);
  const rows = getSavedProjectionRows(request.definition);
  const projection = rows.flatMap((row, rowIndex) => [
    ...(rowIndex > 0
      ? [{ field: { kind: "field" as const, field: "" }, alias: "NEW_LINE" }]
      : []),
    ...row.map((field) => {
      const index = request.definition.columns.findIndex((candidate) => candidate.field === field);
      return apiQuery.projection[index] ?? {
        fields: [{ kind: "field" as const, field }],
        alias: null,
      };
    }),
  ]);

  const allContexts: ApiQueryContextDefinition[] = [];
  const contextIndexes = new Map<string, number>();
  const contextCompleteness = (context: ApiQueryContextDefinition) =>
    (context.query.projection?.length ?? 0) + (context.query.contexts?.length ?? 0);
  const collectContexts = (contextDefinitions: ApiQueryContextDefinition[]) => {
    for (const context of contextDefinitions) {
      const identity = context.id ?? `reference-${allContexts.length}`;
      const existingIndex = contextIndexes.get(identity);
      if (existingIndex === undefined) {
        contextIndexes.set(identity, allContexts.length);
        allContexts.push(context);
      } else if (contextCompleteness(context) > contextCompleteness(allContexts[existingIndex])) {
        allContexts[existingIndex] = context;
      }
      if (context.query.contexts) collectContexts(context.query.contexts);
    }
  };
  collectContexts(apiQuery.contexts ?? []);
  // Referenced contexts contain the current edited definitions. The catalog
  // can still contain an older snapshot, so only use it for contexts that
  // are not already reachable from the query.
  collectContexts(request.definition.contextCatalog ?? []);
  const toStoredContext = (context: ApiQueryContextDefinition) => ({
    entity: context.query.entity,
    projection: context.query.projection ?? [],
    filter: context.query.filter,
    sorts: context.query.sorts ?? null,
    take: context.query.pageSize,
    skip: context.query.page !== null && context.query.pageSize !== null
      ? Math.max(0, context.query.page - 1) * context.query.pageSize
      : null,
    joins: context.query.contexts?.map((nested) => ({
      refContext: nested.name,
      alias: nested.alias ?? null,
      condition: nested.condition ?? { logicalOperation: 0, filters: [] },
      joinType: nested.joinType ?? null,
    })) ?? null,
  });
  const contexts = Object.fromEntries(allContexts.map((context) => [
    context.name,
    toStoredContext(context),
  ]));
  const relations = (apiQuery.contexts ?? [])
    .filter((context) => !isSourceContext(context, apiQuery.entity))
    .map((context) => ({
      refContext: context.name,
      alias: context.alias ?? null,
      condition: context.condition ?? { logicalOperation: 0, filters: [] },
      joinType: context.joinType ?? null,
    }));

  return {
    id: request.id ?? "",
    name: request.name,
    entity: apiQuery.entity,
    projections: projection,
    filter: apiQuery.filter,
    sorts: apiQuery.sorts,
    take: apiQuery.pageSize,
    skip: apiQuery.page !== null && apiQuery.pageSize !== null
      ? Math.max(0, apiQuery.page - 1) * apiQuery.pageSize
      : null,
    joins: relations,
    contexts,
    isBuiltin: false,
  };
}

export const fetchQueryMetadata = createAsyncThunk(
  "queryBuilder/fetchMetadata",
  async (_, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.metadata.list);
      if (!Array.isArray(payload) || payload.some((entity) => !entity
        || typeof entity.name !== "string"
        || !Array.isArray(entity.fields)
        || (entity.relations !== undefined && !Array.isArray(entity.relations)))) {
        return rejectWithValue("Metadata API must return entities with fields.");
      }
      return payload as MetadataEntity[];
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load query metadata.");
    }
  },
  {
    condition: (_, { getState }) => getState().queryBuilder.metadataStatus !== "loading",
  },
);

export const fetchFunctionDefinitions = createAsyncThunk(
  "queryBuilder/fetchFunctionDefinitions",
  async (_, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.metadata.functions);
      if (!Array.isArray(payload) || payload.some((definition) =>
        !definition
        || typeof definition.name !== "string"
        || !definition.name.trim()
        || !Array.isArray(definition.arguments)
        || definition.arguments.some((argument: unknown) => !argument
          || typeof argument !== "object"
          || typeof (argument as { name?: unknown }).name !== "string"
          || typeof (argument as { dataType?: unknown }).dataType !== "string"))) {
        return rejectWithValue("Function metadata API must return function definitions with names and arguments.");
      }
      return payload as FunctionDefinition[];
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load function metadata.");
    }
  },
  {
    condition: (_, { getState }) => getState().queryBuilder.functionDefinitionsStatus !== "loading",
  },
);

export const fetchFilterOperators = createAsyncThunk(
  "queryBuilder/fetchFilterOperators",
  async (_, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.metadata.operators);
      const definitions = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { value?: unknown }).value)
          ? (payload as { value: unknown[] }).value
          : null;
      if (!definitions || definitions.some((operator) =>
        !operator
        || typeof operator.id !== "string"
        || typeof operator.name !== "string"
        || typeof operator.symbol !== "string"
        || !Array.isArray(operator.supportedDataTypes))) {
        return rejectWithValue("Operator metadata API must return operators with data types.");
      }
      return definitions as FilterOperatorDefinition[];
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load filter operators.");
    }
  },
  {
    condition: (_, { getState }) => getState().queryBuilder.filterOperatorsStatus !== "loading",
  },
);

export const executeQuery = createAsyncThunk(
  "queryBuilder/execute",
  async (definition: QueryDefinition, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.dynamicQuery.execute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBackendApiQuery(createApiQuery(definition))),
      });
      if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.rows) || payload.rows.some((row) => typeof row !== "string") || typeof payload.totalRecords !== "number" || !Number.isFinite(payload.totalRecords) || payload.totalRecords < -1) {
        return rejectWithValue("Query API must return a name, an array of row strings, and a valid total record count.");
      }
      const responseColumns = typeof payload.columns === "string"
        ? payload.columns.split(",").filter((column: string) => column.trim())
        : [];
      return {
        name: payload.name,
        columns: responseColumns.length ? responseColumns : definition.columns.map((column) => column.alias || column.field),
        rows: payload.rows.map((row: string) => row.split(",")),
        totalRecords: payload.totalRecords,
      } as QueryResult;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to execute query.");
    }
  },
);

export const executeQueryFromText = createAsyncThunk(
  "queryBuilder/executeFromText",
  async (text: string, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.dynamicQuery.executeText, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.rows) || payload.rows.some((row) => typeof row !== "string") || typeof payload.totalRecords !== "number" || !Number.isFinite(payload.totalRecords) || payload.totalRecords < -1) {
        return rejectWithValue("Query API must return a name, an array of row strings, and a valid total record count.");
      }
      const responseColumns = typeof payload.columns === "string"
        ? payload.columns.split(",").filter((column: string) => column.trim())
        : [];
      return {
        name: payload.name,
        columns: responseColumns,
        rows: payload.rows.map((row: string) => row.split(",")),
        totalRecords: payload.totalRecords,
      } as QueryResult;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to execute query.");
    }
  },
);

export const executeContextFromText = createAsyncThunk(
  "queryBuilder/executeContextFromText",
  async ({ text, context }: { text: string; context: string }, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.dynamicQuery.executeContextText(context), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.rows)
        || typeof payload.totalRecords !== "number") {
        return rejectWithValue("Query API returned an invalid context result.");
      }
      const responseColumns = typeof payload.columns === "string"
        ? payload.columns.split(",").filter((column: string) => column.trim())
        : [];
      return {
        name: payload.name,
        columns: responseColumns,
        rows: payload.rows.map((row: string) => row.split(",")),
        totalRecords: payload.totalRecords,
      } as QueryResult;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to execute context.");
    }
  },
);

export const getSqlStatement = createAsyncThunk(
  "queryBuilder/getSqlStatement",
  async (definition: QueryDefinition, { rejectWithValue }) => {
    try {
      const payload = await requestText(apiUrls.dynamicQuery.toString, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBackendApiQuery(createApiQuery(definition))),
      });
      if (typeof payload !== "string") {
        return rejectWithValue("Query API must return a SQL statement string.");
      }
      return payload;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to generate SQL statement.");
    }
  },
);

export const getSqlStatementFromText = createAsyncThunk(
  "queryBuilder/getSqlStatementFromText",
  async (text: string, { rejectWithValue }) => {
    try {
      return await requestText(apiUrls.dynamicQuery.toStringText, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to generate SQL statement.");
    }
  },
);

export const getQueryRequestText = createAsyncThunk(
  "queryBuilder/getQueryRequestText",
  async (definition: QueryDefinition, { rejectWithValue }) => {
    try {
      const payload = await requestText(apiUrls.dynamicQuery.toOQuery, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBackendApiQuery(createApiQuery(definition))),
      });
      if (!payload.trim()) return rejectWithValue("Query API returned an empty OQuery request.");
      return payload;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to generate OQuery request.");
    }
  },
);

export const parseQueryRequestText = createAsyncThunk(
  "queryBuilder/parseQueryRequestText",
  async ({ text, entity }: { text: string; entity: string }, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.dynamicQuery.fromOQuery, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, entity }),
      });
      if (!payload || typeof payload !== "object" || typeof (payload as { entity?: unknown }).entity !== "string"
        || !Array.isArray((payload as { projection?: unknown }).projection)) {
        return rejectWithValue("Query API returned an invalid OQuery query.");
      }
      return payload as ApiQueryDefinition;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to parse OQuery request.");
    }
  },
);

export const fetchReports = createAsyncThunk(
  "queryBuilder/fetchReports",
  async (_, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.reports.list);
      if (!Array.isArray(payload) || payload.some((item) => !item
        || typeof item.fileName !== "string"
        || typeof item.canDelete !== "boolean"
        || !item.query
        || (item.requestText !== undefined && item.requestText !== null && typeof item.requestText !== "string")
        || (item.description !== undefined && item.description !== null && typeof item.description !== "string")
        || (item.chartType !== undefined && item.chartType !== null && typeof item.chartType !== "string"))) {
        return rejectWithValue("Report API must return reports.");
      }
      return payload as ReportDto[];
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load reports.");
    }
  },
);

export const saveReport = createAsyncThunk(
  "queryBuilder/saveReport",
  async ({ fileName, name, definition, requestText, description, chartType }: {
    fileName?: string;
    name: string;
    definition: QueryDefinition;
    requestText?: string;
    description?: string;
    chartType?: string;
  }, { rejectWithValue }) => {
    try {
      const url = fileName ? apiUrls.reports.byFileName(fileName) : apiUrls.reports.list;
      const payload = await requestJson(url, {
        method: fileName ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createApiQuery(definition),
          name,
          ...(requestText !== undefined ? { requestText } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(chartType !== undefined ? { chartType } : {}),
        }),
      });
      if (!payload || typeof payload.fileName !== "string" || !payload.query
        || typeof payload.canDelete !== "boolean") {
        return rejectWithValue("Report API returned an invalid report.");
      }
      return payload as ReportDto;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to save report.");
    }
  },
);

export const deleteReport = createAsyncThunk(
  "queryBuilder/deleteReport",
  async (fileName: string, { rejectWithValue }) => {
    try {
      await requestJson(apiUrls.reports.byFileName(fileName), { method: "DELETE" });
      return fileName;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to delete query request.");
    }
  },
);

export const fetchQueryRequests = createAsyncThunk(
  "queryBuilder/fetchQueryRequests",
  async (_, { rejectWithValue }) => {
    try {
      const payload = await requestJson(apiUrls.queryRequests.list);
      const normalizedPayload = Array.isArray(payload)
        ? payload.map((item) => item && typeof item === "object" && !Array.isArray(item)
          ? normalizeQueryRequestProjection(item as Record<string, unknown>)
          : item)
        : payload;
      if (!Array.isArray(normalizedPayload) || normalizedPayload.some((item) => !item
        || typeof item.isBuiltin !== "boolean"
        || typeof item.id !== "string"
        || typeof item.name !== "string"
        || typeof item.entity !== "string"
        || !Array.isArray(item.projection)
        || (item.contexts !== undefined && item.contexts !== null
          && (typeof item.contexts !== "object" || Array.isArray(item.contexts))))) {
        return rejectWithValue("Query request API must return saved query requests.");
      }
      return normalizedPayload.map((item) => item as ApiQueryDto);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load saved queries.");
    }
  },
);

export const saveQueryRequest = createAsyncThunk(
  "queryBuilder/saveQueryRequest",
  async ({ name, definition, id }: { name: string; definition: QueryDefinition; id?: string }, { rejectWithValue }) => {
    try {
      const response = await requestJson(id ? apiUrls.queryRequests.byId(id) : apiUrls.queryRequests.create, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiSavedRequest({ name, definition, id })),
      });
      const saved = response && typeof response === "object" && !Array.isArray(response)
        ? normalizeQueryRequestProjection(response as Record<string, unknown>)
        : response;
      if (!saved
        || typeof saved.id !== "string"
        || typeof saved.name !== "string"
        || typeof saved.entity !== "string"
        || !Array.isArray(saved.projection)
        || (saved.contexts !== undefined && saved.contexts !== null
          && (typeof saved.contexts !== "object" || Array.isArray(saved.contexts)))) {
        throw new Error("Query request API must return the saved query request.");
      }
      return saved as ApiQueryDto;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to save query.");
    }
  },
);

export const deleteQueryRequest = createAsyncThunk(
  "queryBuilder/deleteQueryRequest",
  async ({ id }: { id: string }, { rejectWithValue }) => {
    try {
      await requestJson(apiUrls.queryRequests.byId(id), { method: "DELETE" });
      return id;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to delete query.");
    }
  },
);

const queryBuilderSlice = createSlice({
  name: "queryBuilder",
  initialState: {
    metadata: [] as MetadataEntity[],
    metadataStatus: "idle",
    metadataError: "",
    result: null as QueryResult | null,
    sqlStatement: null as string | null,
    resultView: "data" as "data" | "sql",
    queryStatus: "idle",
    queryError: "",
    reports: [] as ReportDto[],
    reportsStatus: "idle",
    reportsError: "",
    queryRequests: [] as SavedQueryRequestDto[],
    queryRequestsStatus: "idle",
    queryRequestsError: "",
    debugUiEnabled: true,
    functionDefinitions: [] as FunctionDefinition[],
    functionDefinitionsStatus: "idle",
    functionDefinitionsError: "",
    filterOperators: [] as FilterOperatorDefinition[],
    filterOperatorsStatus: "idle",
    filterOperatorsError: "",
  },
  reducers: {
    clearQueryResult(state) {
      state.result = null;
      state.sqlStatement = null;
      state.resultView = "data";
      state.queryError = "";
    },
    invalidateQueryMetadata(state) {
      state.metadata = [];
      state.metadataStatus = "idle";
      state.metadataError = "";
    },
    setExpressionDebugUiEnabled(state, action: PayloadAction<boolean>) {
      state.debugUiEnabled = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQueryMetadata.pending, (state) => {
        state.metadataStatus = "loading";
        state.metadataError = "";
      })
      .addCase(fetchQueryMetadata.fulfilled, (state, action) => {
        state.metadata = action.payload;
        state.metadataStatus = "succeeded";
      })
      .addCase(fetchQueryMetadata.rejected, (state, action) => {
        state.metadataStatus = "failed";
        state.metadataError = String(action.payload || action.error.message || "Unable to load query metadata.");
      })
      .addCase(fetchFunctionDefinitions.pending, (state) => {
        state.functionDefinitionsStatus = "loading";
        state.functionDefinitionsError = "";
      })
      .addCase(fetchFunctionDefinitions.fulfilled, (state, action) => {
        state.functionDefinitions = action.payload;
        state.functionDefinitionsStatus = "succeeded";
      })
      .addCase(fetchFunctionDefinitions.rejected, (state, action) => {
        state.functionDefinitionsStatus = "failed";
        state.functionDefinitionsError = String(action.payload || action.error.message || "Unable to load function metadata.");
      })
      .addCase(fetchFilterOperators.pending, (state) => {
        state.filterOperatorsStatus = "loading";
        state.filterOperatorsError = "";
      })
      .addCase(fetchFilterOperators.fulfilled, (state, action) => {
        state.filterOperators = action.payload;
        state.filterOperatorsStatus = "succeeded";
      })
      .addCase(fetchFilterOperators.rejected, (state, action) => {
        state.filterOperatorsStatus = "failed";
        state.filterOperatorsError = String(action.payload || action.error.message || "Unable to load filter operators.");
      })
      .addCase(executeQuery.pending, (state) => {
        state.queryStatus = "loading";
        state.queryError = "";
      })
      .addCase(executeQuery.fulfilled, (state, action) => {
        state.result = action.payload;
        state.sqlStatement = null;
        state.resultView = "data";
        state.queryStatus = "succeeded";
        state.queryError = "";
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.result = null;
        state.sqlStatement = null;
        state.resultView = "data";
        state.queryStatus = "failed";
        state.queryError = String(action.payload || action.error.message || "Unable to execute query.");
      })
      .addCase(executeQueryFromText.pending, (state) => {
        state.queryStatus = "loading";
        state.queryError = "";
      })
      .addCase(executeQueryFromText.fulfilled, (state, action) => {
        state.result = action.payload;
        state.sqlStatement = null;
        state.resultView = "data";
        state.queryStatus = "succeeded";
        state.queryError = "";
      })
      .addCase(executeQueryFromText.rejected, (state, action) => {
        state.result = null;
        state.sqlStatement = null;
        state.resultView = "data";
        state.queryStatus = "failed";
        state.queryError = String(action.payload || action.error.message || "Unable to execute query.");
      })
      .addCase(executeContextFromText.pending, (state) => {
        state.queryStatus = "loading";
        state.queryError = "";
      })
      .addCase(executeContextFromText.fulfilled, (state, action) => {
        state.result = action.payload;
        state.sqlStatement = null;
        state.resultView = "data";
        state.queryStatus = "succeeded";
        state.queryError = "";
      })
      .addCase(executeContextFromText.rejected, (state, action) => {
        state.result = null;
        state.sqlStatement = null;
        state.resultView = "data";
        state.queryStatus = "failed";
        state.queryError = String(action.payload || action.error.message || "Unable to execute context.");
      });
    builder
      .addCase(getSqlStatement.pending, (state) => {
        state.queryStatus = "loading";
        state.queryError = "";
      })
      .addCase(getSqlStatement.fulfilled, (state, action) => {
        state.sqlStatement = action.payload;
        state.resultView = "sql";
        state.queryStatus = "succeeded";
      })
      .addCase(getSqlStatement.rejected, (state, action) => {
        state.queryStatus = "failed";
        state.queryError = String(action.payload || action.error.message || "Unable to generate SQL statement.");
      })
      .addCase(getSqlStatementFromText.pending, (state) => {
        state.queryStatus = "loading";
        state.queryError = "";
      })
      .addCase(getSqlStatementFromText.fulfilled, (state, action) => {
        state.sqlStatement = action.payload;
        state.resultView = "sql";
        state.queryStatus = "succeeded";
      })
      .addCase(getSqlStatementFromText.rejected, (state, action) => {
        state.queryStatus = "failed";
        state.queryError = String(action.payload || action.error.message || "Unable to generate SQL statement.");
      })
      .addCase(fetchReports.pending, (state) => {
        state.reportsStatus = "loading";
        state.reportsError = "";
      })
      .addCase(fetchReports.fulfilled, (state, action) => {
        state.reports = action.payload;
        state.reportsStatus = "succeeded";
      })
      .addCase(fetchReports.rejected, (state, action) => {
        state.reportsStatus = "failed";
        state.reportsError = String(action.payload || action.error.message || "Unable to load reports.");
      })
      .addCase(saveReport.fulfilled, (state, action) => {
        const savedReport = {
          ...action.payload,
          requestText: action.payload.requestText ?? action.meta.arg.requestText ?? null,
        };
        const index = state.reports.findIndex((item) => item.fileName === savedReport.fileName);
        if (index >= 0) state.reports[index] = savedReport;
        else state.reports.unshift(savedReport);
      })
      .addCase(deleteReport.fulfilled, (state, action) => {
        state.reports = state.reports.filter((item) => item.fileName !== action.payload);
      })
      .addCase(fetchQueryRequests.pending, (state) => {
        state.queryRequestsStatus = "loading";
        state.queryRequestsError = "";
      })
      .addCase(fetchQueryRequests.fulfilled, (state, action) => {
        state.queryRequests = action.payload;
        state.queryRequestsStatus = "succeeded";
      })
      .addCase(fetchQueryRequests.rejected, (state, action) => {
        state.queryRequestsStatus = "failed";
        state.queryRequestsError = String(action.payload || action.error.message || "Unable to load saved queries.");
      })
      .addCase(saveQueryRequest.pending, (state) => {
        state.queryRequestsError = "";
      })
      .addCase(saveQueryRequest.fulfilled, (state, action) => {
        state.queryRequestsError = "";
        state.queryRequestsStatus = "succeeded";
        state.queryRequests = state.queryRequests.filter((item) =>
          item.isBuiltin || item.id !== action.payload.id);
        state.queryRequests.unshift(action.payload);
      })
      .addCase(saveQueryRequest.rejected, (state, action) => {
        state.queryRequestsError = String(action.payload || action.error.message || "Unable to save query.");
      })
      .addCase(deleteQueryRequest.fulfilled, (state, action) => {
        state.queryRequests = state.queryRequests.filter((item) =>
          item.id !== action.payload);
      })
      .addCase(deleteQueryRequest.rejected, (state, action) => {
        state.queryRequestsError = String(action.payload || action.error.message || "Unable to delete query.");
      });
  },
});

export const {
  clearQueryResult,
  invalidateQueryMetadata,
  setExpressionDebugUiEnabled,
} = queryBuilderSlice.actions;
export { fromApiQuery };
export default queryBuilderSlice.reducer;
