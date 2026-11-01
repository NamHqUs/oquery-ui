import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { apiUrls } from "../../../const/api-urls";
import type { FunctionDefinition } from "../../function-definition/types";

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

export type MetadataRelation = {
  name: string;
  relatedEntity: string;
  type?: number | string;
  relatedKeys?: RelationKey[];
};

export type RelationKey = { fromDbColumn: string; toDbColumn: string };

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
  contexts?: ApiQueryContextDefinition[] | null;
};

export type ApiQueryContextDefinition = {
  name: string;
  alias?: string;
  joinType?: number | string;
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
  id: string;
  name: string;
  entity: string;
  projection?: ApiProjectionDefinition[];
  filters?: ApiQueryFilterGroup | null;
  sorts?: { field: string | IFieldDefinition; direction: number | string }[][] | null;
  page?: number | null;
  pageSize?: number | null;
  extraRelations?: {
    refContextId: string;
    alias: string;
    condition: ApiQueryFilterNode | string | null;
    joinType?: number | string;
  }[] | null;
};

export type ApiQueryDto = {
  mainQuery: ApiQueryContextDto;
  contexts?: ApiQueryContextDto[] | null;
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
  mainQuery: ApiQueryContextDto;
  contexts?: ApiQueryContextDto[] | null;
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
  if (body) {
    try {
      const problem = JSON.parse(body);
      if (typeof problem?.detail === "string") return new Error(problem.detail);
      if (typeof problem?.title === "string") return new Error(problem.title);
    } catch {
      return new Error(body);
    }
  }
  return new Error(fallback);
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
      fields: toApiProjectionFields(expression ?? { kind: "field", field }),
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

export function fromApiQueryDefinition(query: ApiQueryDefinition): QueryDefinition {
  const filter = query.filter
    ? "filters" in query.filter
      ? query.filter
      : { logicalOperation: 0, filters: [query.filter] }
    : null;

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
  });
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

function toApiProjectionFields(expression: IFieldDefinition): ApiProjectionNode[] {
  if (expression.kind === "group" && (!expression.oper || expression.oper === "+"))
    return expression.arguments.map((argument) => toApiProjectionNode(argument));
  return [toApiProjectionNode(expression)];
}

function toApiProjectionNode(expression: IFieldDefinition): ApiProjectionNode {
  let node: ApiProjectionNode;
  switch (expression.kind) {
    case "field":
      node = { kind: "field", field: expression.field };
      break;
    case "value":
      node = { kind: "value", value: expression.value };
      break;
    case "group":
      node = {
        kind: "group",
        fields: expression.arguments.map(toApiProjectionNode),
      };
      break;
    case "function":
      node = {
        kind: "function",
        function: expression.function,
        arguments: expression.arguments.map((argument) => toApiProjectionNode(argument)),
      };
      break;
    case "condition":
      node = {
        kind: "condition",
        condition: expression.condition,
      };
      break;
  }
  return expression.oper && expression.oper !== "+"
    ? { ...node, oper: expression.oper }
    : node;
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
  const mainQuery = request.mainQuery;
  const contextsById = new Map((request.contexts ?? []).map((context) => [context.id, context]));
  const toApiDefinition = (context: ApiQueryContextDto, visited = new Set<string>()): ApiQueryDefinition => {
    if (!visited.add(context.id)) throw new Error(`Query API returned recursive context '${context.id}'.`);
    const contexts = (context.extraRelations ?? []).map((joined) => {
      const referenced = contextsById.get(joined.refContextId);
      if (!referenced) throw new Error(`Query API returned an unknown context reference '${joined.refContextId}'.`);
      return {
        id: referenced.id,
        name: referenced.name,
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
    sorts: context.sorts?.flat() ?? [],
    page: context.page,
    pageSize: context.pageSize,
    contexts: contexts.length ? contexts : undefined,
    };
  };
  const extraRelations: ApiQueryContextDefinition[] = (mainQuery.extraRelations ?? []).map((joined) => {
    const context = contextsById.get(joined.refContextId);
    if (!context) throw new Error(`Query API returned an unknown context reference '${joined.refContextId}'.`);
    return {
      id: context.id,
      name: context.name,
      alias: joined.alias,
      joinType: joined.joinType,
      condition: joined.condition,
      query: toApiDefinition(context),
    };
  });
  const sourceContextDto = (request.contexts ?? []).find((context) =>
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
  const contextCatalog: ApiQueryContextDefinition[] = (request.contexts ?? []).map((context) => ({
    id: context.id,
    name: context.name,
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
      filter: mainQuery.filters ?? null,
      sorts: mainQuery.sorts?.flat() ?? [],
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

function toApiSavedRequest(request: { name: string; definition: QueryDefinition; id?: string }): ApiQueryDto {
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
  const collectedContexts = new Set<string>();
  const collectContexts = (contextDefinitions: ApiQueryContextDefinition[]) => {
    for (const context of contextDefinitions) {
      const identity = context.id ?? `reference-${allContexts.length}`;
      if (collectedContexts.has(identity)) continue;
      collectedContexts.add(identity);
      allContexts.push(context);
      if (context.query.contexts) collectContexts(context.query.contexts);
    }
  };
  collectContexts(request.definition.contextCatalog ?? []);
  collectContexts(apiQuery.contexts ?? []);
  const contextIds = new Map<string, string>();
  allContexts.forEach((context, index) => {
    contextIds.set(context.id ?? `reference-${index}`, context.id ?? `${request.id ?? request.name}-context-${index}`);
  });
  const getContextId = (context: ApiQueryContextDefinition) => contextIds.get(context.id ?? "")
    ?? `${request.id ?? request.name}-context-${allContexts.indexOf(context)}`;
  const toStoredContext = (context: ApiQueryContextDefinition) => ({
    id: getContextId(context),
    name: context.name,
    entity: context.query.entity,
    projection: context.query.projection,
    filters: context.query.filter,
    sorts: context.query.sorts?.length ? [context.query.sorts] : null,
    page: context.query.page,
    pageSize: context.query.pageSize,
    extraRelations: context.query.contexts?.map((nested) => ({
      refContextId: getContextId(nested),
      alias: nested.alias ?? nested.name,
      condition: nested.condition ?? { logicalOperation: 0, filters: [] },
      joinType: nested.joinType ?? 1,
    })) ?? null,
  });
  const contexts = allContexts.map(toStoredContext);
  const extraRelations = (apiQuery.contexts ?? [])
    .filter((context) => !isSourceContext(context, apiQuery.entity))
    .map((context) => ({
      refContextId: getContextId(context),
      alias: context.alias ?? context.name,
      condition: context.condition ?? { logicalOperation: 0, filters: [] },
      joinType: context.joinType ?? 1,
    }));

  return {
    mainQuery: {
      id: request.id ?? "",
      name: request.name,
      entity: apiQuery.entity,
      projection,
      filters: apiQuery.filter,
      sorts: apiQuery.sorts.length ? [apiQuery.sorts] : null,
      page: apiQuery.page,
      pageSize: apiQuery.pageSize,
      extraRelations,
    },
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
        body: JSON.stringify(createApiQuery(definition)),
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

export const getSqlStatement = createAsyncThunk(
  "queryBuilder/getSqlStatement",
  async (definition: QueryDefinition, { rejectWithValue }) => {
    try {
      const payload = await requestText(apiUrls.dynamicQuery.toString, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createApiQuery(definition)),
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
      if (!Array.isArray(payload) || payload.some((item) => !item
        || typeof item.isBuiltin !== "boolean"
        || !item.mainQuery
        || typeof item.mainQuery.id !== "string"
        || typeof item.mainQuery.name !== "string"
        || typeof item.mainQuery.entity !== "string"
        || !Array.isArray(item.mainQuery.projection)
        || (item.contexts !== undefined && item.contexts !== null && !Array.isArray(item.contexts)))) {
        return rejectWithValue("Query request API must return saved query requests.");
      }
      return payload.map((item) => item as ApiQueryDto);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load saved queries.");
    }
  },
);

export const saveQueryRequest = createAsyncThunk(
  "queryBuilder/saveQueryRequest",
  async ({ name, definition, id }: { name: string; definition: QueryDefinition; id?: string }, { rejectWithValue }) => {
    try {
      const saved = await requestJson(id ? apiUrls.queryRequests.byId(id) : apiUrls.queryRequests.create, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiSavedRequest({ name, definition, id })),
      });
      if (!saved?.mainQuery
        || typeof saved.mainQuery.id !== "string"
        || typeof saved.mainQuery.name !== "string"
        || typeof saved.mainQuery.entity !== "string"
        || !Array.isArray(saved.mainQuery.projection)) {
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
    debugUiEnabled: false,
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
        state.resultView = "data";
        state.queryStatus = "succeeded";
        state.queryError = "";
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.queryStatus = "failed";
        state.queryError = String(action.payload || action.error.message || "Unable to execute query.");
      })
      .addCase(executeQueryFromText.pending, (state) => {
        state.queryStatus = "loading";
        state.queryError = "";
      })
      .addCase(executeQueryFromText.fulfilled, (state, action) => {
        state.result = action.payload;
        state.resultView = "data";
        state.queryStatus = "succeeded";
        state.queryError = "";
      })
      .addCase(executeQueryFromText.rejected, (state, action) => {
        state.queryStatus = "failed";
        state.queryError = String(action.payload || action.error.message || "Unable to execute query.");
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
          item.isBuiltin || item.mainQuery.id !== action.payload.mainQuery.id);
        state.queryRequests.unshift(action.payload);
      })
      .addCase(saveQueryRequest.rejected, (state, action) => {
        state.queryRequestsError = String(action.payload || action.error.message || "Unable to save query.");
      })
      .addCase(deleteQueryRequest.fulfilled, (state, action) => {
        state.queryRequests = state.queryRequests.filter((item) =>
          item.mainQuery.id !== action.payload);
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
