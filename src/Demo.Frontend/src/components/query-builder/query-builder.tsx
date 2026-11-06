import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { FunctionDefinition } from "../function-definition/types";
import Icon from "../icon/icon";
import { useMessageBox } from "../message-box/message-box";
import PanelSplitter from "../panel-splitter/panel-splitter";
import ToastNotice from "../toast-notice/toast-notice";
import { ApiQueryContextDefinition, clearQueryResult, createApiQuery, deleteQueryRequest, executeContextFromText, executeQuery, executeQueryFromText, fetchFilterOperators, fetchFunctionDefinitions, fetchQueryMetadata, fetchQueryRequests, fromApiQuery, fromApiQueryDefinition, getQueryRequestText, getSqlStatement, getSqlStatementFromText, IFieldDefinition, MetadataEntity, MetadataField, parseQueryRequestText, QueryDefinition, QueryFilterGroup, QueryFilterNode, saveQueryRequest, toQueryBuilderSavedView } from "./query-design/query-builder-slice";
import QueryDesign from "./query-design/query-design";
import QueryResult from "./query-result/query-result";
import SavedQueryList from "./saved-query-list/saved-query-list";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import type { AppDispatch, RootState } from "../../store/store";
import "./query-builder.css";

type QueryBuilderProps = {
  onBackToHome?: () => void;
  onRequestConnection: () => void;
};

let cachedDefinition: QueryDefinition | null = null;
const QUERY_DEFINITION_STORAGE_KEY = "OQuery-query-builder-definition";
const OQUERY_DESIGN_HEIGHT_STORAGE_KEY = "OQuery.query-builder.oquery-design-height.v2";
const OQUERY_DESIGN_HEIGHT_DEFAULT = 840;
const OQUERY_DESIGN_HEIGHT_MIN = 440;
const OQUERY_DESIGN_HEIGHT_MAX = 1100;
const EDITOR_MODE_SEARCH_PARAM = "mode";

type EditorMode = "visual" | "oquery";

function getEditorMode(searchParams: URLSearchParams): EditorMode {
  return searchParams.get(EDITOR_MODE_SEARCH_PARAM) === "oquery" ? "oquery" : "visual";
}

export function resetQueryBuilderCache() {
  cachedDefinition = null;
  window.sessionStorage.removeItem(QUERY_DEFINITION_STORAGE_KEY);
}

export function setQueryBuilderDefinition(definition: QueryDefinition) {
  cachedDefinition = definition;
  window.sessionStorage.setItem(QUERY_DEFINITION_STORAGE_KEY, JSON.stringify(definition));
}

function createDefinition(entity: string, fields: MetadataField[] = []): QueryDefinition {
  return {
    entity,
    columns: fields.map((field) => ({ field: field.name, alias: null })),
    filters: { logicalOperation: 0, filters: [] },
    sorts: [],
    page: 1,
    pageSize: 50,
  };
}

function createContextEntity(
  contexts: QueryDefinition["contexts"],
  entityName: string,
  fallbackColumns: QueryDefinition["columns"],
): MetadataEntity | undefined {
  const context = contexts?.find((item) => item.name === entityName);
  if (!context) return undefined;

  const projectedFields = context.query.projection?.flatMap((projection) => {
    const alias = projection.alias?.trim();
    if (alias) return [alias];

    const field = "fields" in projection
      ? projection.fields.length === 1 && projection.fields[0].kind === "field"
        ? projection.fields[0].field
        : undefined
      : projection.field.kind === "field"
        ? projection.field.field
        : undefined;
    return field ? [field.split(".").pop() ?? field] : [];
  }) ?? [];
  const fields = [...new Set([
    ...projectedFields,
    ...fallbackColumns
      .filter((column) => !column.expression && !column.field.startsWith("__calculated__"))
      .map((column) => column.field),
  ])]
    .map((name) => ({ name, dbColumn: name }));

  return { name: context.name, fields };
}

function loadDefinition(): QueryDefinition {
  if (!cachedDefinition) {
    const savedDefinition = window.sessionStorage.getItem(QUERY_DEFINITION_STORAGE_KEY);
    if (!savedDefinition) return createDefinition("");

    let parsedDefinition: unknown;
    try {
      parsedDefinition = JSON.parse(savedDefinition);
    } catch {
      throw new Error("Saved Query Builder definition is not valid JSON.");
    }
    const normalizedDefinition = normalizeQueryDefinition(parsedDefinition);
    if (!normalizedDefinition) {
      throw new Error("Saved Query Builder definition has an invalid shape.");
    }
    cachedDefinition = normalizedDefinition;
    window.sessionStorage.setItem(QUERY_DEFINITION_STORAGE_KEY, JSON.stringify(normalizedDefinition));
  }

  return {
    ...cachedDefinition,
    filters: cachedDefinition.filters,
  };
}

function normalizeQueryDefinition(value: unknown): QueryDefinition | null {
  if (!isRecord(value) || !isQueryDefinition(value)) return null;
  const definition = value as QueryDefinition;
  return {
    entity: definition.entity,
    columns: definition.columns,
    contexts: definition.contexts,
    contextCatalog: definition.contextCatalog,
    projectionRows: definition.projectionRows,
    filters: definition.filters,
    sorts: definition.sorts,
    page: definition.page,
    pageSize: definition.pageSize,
  };
}

function isQueryDefinition(value: unknown): value is QueryDefinition {
  if (!isRecord(value)) return false;
  const definition = value as Partial<QueryDefinition>;
  return typeof definition.entity === "string"
    && Array.isArray(definition.columns)
    && definition.columns.every((column) => column !== null
      && typeof column === "object"
      && typeof column.field === "string"
      && (typeof column.alias === "string" || column.alias === null))
    && (definition.projectionRows === undefined
      || Array.isArray(definition.projectionRows)
        && definition.projectionRows.every((row) => Array.isArray(row)
          && row.every((field) => typeof field === "string")))
    && definition.filters !== null
    && typeof definition.filters === "object"
    && Array.isArray(definition.filters.filters)
    && Array.isArray(definition.sorts)
    && (definition.page === null || typeof definition.page === "number")
    && (definition.pageSize === null || typeof definition.pageSize === "number")
    && (definition.contexts === undefined
      || definition.contexts === null
      || Array.isArray(definition.contexts)
        && definition.contexts.every((context) => isRecord(context)
          && typeof context.name === "string"
          && isRecord(context.query)
          && typeof context.query.entity === "string"))
    && (definition.contextCatalog === undefined
      || definition.contextCatalog === null
      || Array.isArray(definition.contextCatalog)
        && definition.contextCatalog.every((context) => isRecord(context)
          && typeof context.name === "string"
          && isRecord(context.query)
          && typeof context.query.entity === "string"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOqueryDesignHeight() {
  const stored = Number(window.localStorage.getItem(OQUERY_DESIGN_HEIGHT_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= OQUERY_DESIGN_HEIGHT_MIN && stored <= OQUERY_DESIGN_HEIGHT_MAX
    ? stored
    : OQUERY_DESIGN_HEIGHT_DEFAULT;
}

function QuerySectionSplitter({ height, onHeightChange }: { height: number; onHeightChange: (height: number) => void }) {
  const resizeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const designSection = event.currentTarget.previousElementSibling;
    if (!(designSection instanceof HTMLElement)) return;
    const nextHeight = Math.min(OQUERY_DESIGN_HEIGHT_MAX, Math.max(OQUERY_DESIGN_HEIGHT_MIN, event.clientY - designSection.getBoundingClientRect().top));
    onHeightChange(nextHeight);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 80 : 16;
    if (event.key === "ArrowUp") onHeightChange(height - step);
    else if (event.key === "ArrowDown") onHeightChange(height + step);
    else if (event.key === "Home") onHeightChange(OQUERY_DESIGN_HEIGHT_MIN);
    else if (event.key === "End") onHeightChange(OQUERY_DESIGN_HEIGHT_MAX);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="query-section-splitter"
      role="separator"
      aria-label="Resize query design and results"
      aria-orientation="horizontal"
      aria-valuemin={OQUERY_DESIGN_HEIGHT_MIN}
      aria-valuemax={OQUERY_DESIGN_HEIGHT_MAX}
      aria-valuenow={height}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        resizeFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeFromPointer(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

function getOqueryEntity(text: string): string {
  const header = text.split(/\r?\n/).find((line) => line.trim() && !line.trimStart().startsWith("#") && !/^\s/.test(line));
  const match = header?.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+is\s+([A-Za-z_][A-Za-z0-9_]*))?\s*:/i);
  return match?.[2] ?? match?.[1] ?? "";
}

function stripOqueryLineComments(text: string): string {
  return text.split(/\r?\n/).map((line) => {
    let quote: "'" | "\"" | null = null;
    for (let index = 0; index < line.length - 1; index++) {
      const character = line[index];
      if (quote) {
        if (character === quote && line[index - 1] !== "\\") quote = null;
        continue;
      }
      if (character === "'" || character === "\"") {
        quote = character;
        continue;
      }
      if (character === "/" && line[index + 1] === "/" && (index === 0 || /\s/.test(line[index - 1] ?? ""))) {
        return line.slice(0, index).trimEnd();
      }
    }
    return line;
  }).join("\n");
}

function stripOqueryComment(value: string): string {
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
    } else if (character === "'" || character === "\"") {
      quote = character;
    } else if (character === "#" && (index === 0 || /\s/.test(value[index - 1] ?? ""))) {
      return value.slice(0, index);
    }
  }
  return value;
}

function preserveOqueryKeys(formatted: string, source: string): string {
  const topLevelKeyPattern = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  const formattedKeys = new Set(Array.from(formatted.matchAll(topLevelKeyPattern), (match) => match[1]!.toLowerCase()));
  const sourceKeys = Array.from(source.matchAll(topLevelKeyPattern), (match) => match[1]!);
  const missingKeys = sourceKeys.filter((key, index) =>
    !formattedKeys.has(key.toLowerCase())
    && sourceKeys.findIndex((sourceKey) => sourceKey.toLowerCase() === key.toLowerCase()) === index);
  if (!missingKeys.length) return formatted;
  return `${formatted.trimEnd()}\n${missingKeys.map((key) => `${key}:`).join("\n")}\n`;
}

function getOquerySyntaxError(
  text: string,
  functionDefinitions: FunctionDefinition[],
  filterOperators: FilterOperatorDefinition[],
): string | null {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() && !line.trimStart().startsWith("#") && !/^\s/.test(line));
  if (!firstLine || !/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:/i.test(firstLine)) {
    return "Invalid OQuery: expected a query header such as \"Users: Id, Name\".";
  }
  return getOqueryFilterSyntaxError(text, filterOperators) ?? getOqueryExpressionSyntaxError(text, functionDefinitions);
}

function getOqueryFilterSyntaxError(text: string, filterOperators: FilterOperatorDefinition[]): string | null {
  const operatorTokens = filterOperators
    .flatMap((operator) => [operator.symbol, operator.name])
    .filter((token) => token.trim())
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const operatorPattern = operatorTokens.length
    ? new RegExp(`(?:${operatorTokens.join("|")})`, "i")
    : /[=<>!]|\b(?:IS|IN|LIKE|BETWEEN|CONTAINS|NULL)\b/i;

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = /^(\s*)(?:Filter\s*:\s*|where\s+)(.*)$/i.exec(line);
    const expression = match?.[2]?.trim();
    if (!match || !expression || operatorPattern.test(expression)) continue;
    const column = line.indexOf(expression) + 1;
    return `Line ${index + 1}, column ${column}: where expression must include an operator. Try "where UserId = <value>".`;
  }

  return null;
}

function getOqueryExpressionSyntaxError(text: string, functionDefinitions: FunctionDefinition[]): string | null {
  const openings: Array<{ line: number; column: number }> = [];
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  let line = 1;
  let column = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    column += 1;
    if (character === "\n") {
      line += 1;
      column = 0;
      escaped = false;
      continue;
    }
    if (character === "#" && !quote) {
      while (index < text.length && text[index] !== "\n") index++;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (character === "(") {
      openings.push({ line, column });
      continue;
    }
    if (character !== ")") continue;
    if (!openings.pop()) return `Line ${line}, column ${column}: Unexpected closing ")" in expression.`;
  }

  const opening = openings[openings.length - 1];
  if (opening) return `Line ${opening.line}, column ${opening.column}: Function expression is missing a closing ")".`;

  const functionSignatures = new Map(
    functionDefinitions.map((definition) => [
      definition.name.toLocaleLowerCase(),
      {
        name: definition.name,
        requiredArguments: definition.arguments.filter((argument) =>
          argument.defaultValue === null || argument.defaultValue === undefined).length,
        totalArguments: definition.arguments.length,
      },
    ]),
  );
  let functionQuote: "'" | "\"" | null = null;
  let functionEscaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (functionQuote) {
      if (functionEscaped) functionEscaped = false;
      else if (character === "\\") functionEscaped = true;
      else if (character === functionQuote) functionQuote = null;
      continue;
    }
    if (character === "'" || character === "\"") {
      functionQuote = character;
      continue;
    }
    if (!/[A-Za-z_]/.test(character)) continue;
    const nameStart = index;
    let nameEnd = index + 1;
    while (nameEnd < text.length && /[A-Za-z0-9_]/.test(text[nameEnd]!)) nameEnd += 1;
    const signature = functionSignatures.get(text.slice(nameStart, nameEnd).toLocaleLowerCase());
    if (!signature) {
      index = nameEnd - 1;
      continue;
    }
    let openingIndex = nameEnd;
    while (openingIndex < text.length && /\s/.test(text[openingIndex]!)) openingIndex += 1;
    if (text[openingIndex] !== "(") {
      index = nameEnd - 1;
      continue;
    }

    let depth = 1;
    let argumentCount = 0;
    let hasArgument = false;
    let argumentQuote: "'" | "\"" | null = null;
    let argumentEscaped = false;
    for (let argumentIndex = openingIndex + 1; argumentIndex < text.length; argumentIndex += 1) {
      const argumentCharacter = text[argumentIndex]!;
      if (argumentQuote) {
        if (argumentEscaped) argumentEscaped = false;
        else if (argumentCharacter === "\\") argumentEscaped = true;
        else if (argumentCharacter === argumentQuote) argumentQuote = null;
        continue;
      }
      if (argumentCharacter === "'" || argumentCharacter === "\"") {
        argumentQuote = argumentCharacter;
      } else if (argumentCharacter === "(") {
        depth += 1;
        hasArgument = true;
      } else if (argumentCharacter === ")") {
        depth -= 1;
        if (depth === 0) {
          if (hasArgument) argumentCount += 1;
          break;
        }
      } else if (depth === 1 && argumentCharacter === ",") {
        argumentCount += 1;
      } else if (depth === 1 && !/\s/.test(argumentCharacter)) {
        hasArgument = true;
      }
    }

    const line = text.slice(0, nameStart).split(/\r?\n/).length;
    const lastLineBreak = text.lastIndexOf("\n", nameStart - 1);
    const column = nameStart - lastLineBreak;
    if (argumentCount < signature.requiredArguments) {
      return `Line ${line}, column ${column}: ${signature.name} requires at least ${signature.requiredArguments} argument(s), but ${argumentCount} provided.`;
    }
    if (argumentCount > signature.totalArguments) {
      return `Line ${line}, column ${column}: ${signature.name} accepts at most ${signature.totalArguments} argument(s), but ${argumentCount} provided.`;
    }
    index = nameEnd - 1;
  }

  return null;
}

function pruneFilters(group: QueryFilterGroup, entity: MetadataEntity, metadata: MetadataEntity[]): QueryFilterGroup {
  return {
    ...group,
    filters: group.filters.flatMap((node): QueryFilterNode[] => {
      if ("filters" in node) return [pruneFilters(node, entity, metadata)];
      return isProjectionColumnAvailable(node.field, entity, metadata)
        && (!node.rightField || isProjectionColumnAvailable(node.rightField, entity, metadata))
        ? [node]
        : [];
    }),
  };
}

function resolveEntityPath(entity: MetadataEntity, metadata: MetadataEntity[], path: string[]): MetadataEntity | undefined {
  let current: MetadataEntity | undefined = entity;
  for (const relationName of path) {
    const relation = current?.relations?.find((item) => item.name === relationName);
    current = relation && metadata.find((item) => item.name === relation.refEntity);
    if (!current) return undefined;
  }
  return current;
}

function isAvailableFieldPath(entity: MetadataEntity, metadata: MetadataEntity[], fieldPath: string): boolean {
  const segments = fieldPath.split(".");
  const fieldName = segments.pop();
  const owner = resolveEntityPath(entity, metadata, segments);
  return Boolean(fieldName && owner?.fields.some((field) => field.name === fieldName));
}

function isAvailableAggregateField(
  functionName: string,
  fieldName: string,
  entity: MetadataEntity,
  metadata: MetadataEntity[],
): boolean {
  const field = fieldName.trim();
  return (functionName.toLowerCase() === "count" && (!field || field === "*"))
    || isAvailableFieldPath(entity, metadata, field);
}

function isProjectionColumnAvailable(column: string, entity: MetadataEntity, metadata: MetadataEntity[]): boolean {
  if (isAvailableFieldPath(entity, metadata, column)) return true;

  const wrappedAggregate = column.match(/^(COUNT|SUM|MAX|MIN|AVG)\(([^()]*)\)$/i);
  if (wrappedAggregate) {
    return isAvailableAggregateField(wrappedAggregate[1], wrappedAggregate[2], entity, metadata);
  }

  const pathAggregate = column.match(/^(.*)\.(COUNT|SUM|MAX|MIN|AVG)\(([^()]*)\)$/i);
  if (!pathAggregate) return false;

  const aggregateOwner = resolveEntityPath(entity, metadata, pathAggregate[1].split("."));
  return Boolean(aggregateOwner
    && isAvailableAggregateField(pathAggregate[2], pathAggregate[3], aggregateOwner, metadata));
}

function isExpressionAvailable(expression: IFieldDefinition, entity: MetadataEntity, metadata: MetadataEntity[]): boolean {
  switch (expression.kind) {
    case "field":
      return isAvailableFieldPath(entity, metadata, expression.field);
    case "value":
      return expression.value === null || typeof expression.value === "string" || typeof expression.value === "boolean"
        || (typeof expression.value === "number" && Number.isFinite(expression.value));
    case "group":
      return expression.arguments.every((argument) => isExpressionAvailable(argument, entity, metadata));
    case "function":
      return expression.arguments.every((argument) =>
        argument.kind === "field" && argument.field === "*"
          ? expression.function.toLowerCase() === "count"
          : isExpressionAvailable(argument, entity, metadata));
    case "condition":
      return true;
  }
}

// Drops columns, sorts and filters that reference fields removed from the entity metadata.
function reconcileDefinition(definition: QueryDefinition, entity: MetadataEntity, metadata: MetadataEntity[]): QueryDefinition {
  const columns = definition.columns.filter((column) => column.expression
    ? isExpressionAvailable(column.expression, entity, metadata)
    : isProjectionColumnAvailable(column.field, entity, metadata));
  const sorts = definition.sorts.filter((sort) => sort.expression
    ? isExpressionAvailable(sort.expression, entity, metadata)
    : isProjectionColumnAvailable(sort.field, entity, metadata)
      || isAvailableFieldPath(entity, metadata, sort.field)
      || columns.some((column) => column.alias === sort.field));
  const filters = pruneFilters(definition.filters, entity, metadata);
  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(definition.filters);
  const unchanged = columns.length === definition.columns.length
    && sorts.length === definition.sorts.length
    && !filtersChanged;
  return unchanged ? definition : {
    ...definition,
    columns,
    sorts,
    filters,
  };
}

export default function QueryBuilder({ onBackToHome, onRequestConnection }: QueryBuilderProps) {
  const dispatch = useDispatch<AppDispatch>();
  const showMessageBox = useMessageBox();
  const [searchParams, setSearchParams] = useSearchParams();
  const savedQueriesPanel = useResizablePanel("query-builder-saved-queries");
  const { metadata, metadataStatus, metadataError, result, sqlStatement, resultView, queryStatus, queryError, functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, filterOperators, filterOperatorsStatus, filterOperatorsError, queryRequests, queryRequestsStatus, queryRequestsError, debugUiEnabled } = useSelector((state: RootState) => state.queryBuilder);
  const { connectedProvider, connectionStatus } = useSelector((state: RootState) => state.database);
  const [definition, setDefinition] = useState<QueryDefinition>(loadDefinition);
  const [requestName, setRequestName] = useState("");
  const [oqueryText, setOqueryText] = useState("");
  const [oqueryStatus, setOqueryStatus] = useState<"idle" | "loading" | "applying">("idle");
  const [oqueryError, setOqueryError] = useState("");
  const [oqueryValidationMessage, setOqueryValidationMessage] = useState("");
  const selectedOQueryTextRef = useRef("");
  const oqueryLoadRequestRef = useRef(0);
  const updateSelectedOQueryText = (text: string) => {
    selectedOQueryTextRef.current = text;
  };
  const boundModelRef = useRef(JSON.stringify({ definition, requestName }));
  const boundOqueryTextRef = useRef("");
  const [editorMode, setEditorMode] = useState<EditorMode>(() => getEditorMode(searchParams));
  const hasUnsavedChanges = JSON.stringify({ definition, requestName }) !== boundModelRef.current
    || (editorMode === "oquery" && oqueryText !== boundOqueryTextRef.current);
  const [selectedContextIndex, setSelectedContextIndex] = useState<number | null>(null);
  const [selectedRequestName, setSelectedRequestName] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequestIsBuiltin, setSelectedRequestIsBuiltin] = useState(false);
  const [queryRequestNotice, setQueryRequestNotice] = useState("");
  const [requestNameError, setRequestNameError] = useState("");
  const [isSavingQuery, setIsSavingQuery] = useState(false);
  const [oqueryDesignHeight, setOqueryDesignHeight] = useState(readOqueryDesignHeight);
  const [oqueryDesignResized, setOqueryDesignResized] = useState(() => Boolean(window.localStorage.getItem(OQUERY_DESIGN_HEIGHT_STORAGE_KEY)));
  const entity = useMemo(() => metadata.find((item) => item.name === definition.entity), [metadata, definition.entity]);
  const selectedContext = selectedContextIndex === null ? undefined : definition.contextCatalog?.[selectedContextIndex];
  const activeContextIndex = selectedContext ? selectedContextIndex : null;
  const activeDefinition = useMemo(
    () => selectedContext ? fromApiQueryDefinition(selectedContext.query) : definition,
    [definition, selectedContext],
  );
  const activeEntity = useMemo(
    () => metadata.find((item) => item.name === activeDefinition.entity)
      ?? createContextEntity(
        [...(definition.contextCatalog ?? []), ...(activeDefinition.contexts ?? [])],
        activeDefinition.entity,
        activeDefinition.columns,
      ),
    [metadata, activeDefinition, definition.contextCatalog],
  );
  const updateDefinition = (nextDefinition: QueryDefinition) => {
    setQueryBuilderDefinition(nextDefinition);
    setDefinition(nextDefinition);
  };
  const updateContextDefinition = (contextIndex: number, contextDefinition: QueryDefinition) => {
    const context = definition.contextCatalog?.[contextIndex];
    if (!context || !definition.contextCatalog) return definition;
    const updatedContext = { ...context, query: createApiQuery(contextDefinition) };
    const updateContextReferences = (
      contexts: ApiQueryContextDefinition[] | null | undefined,
    ): ApiQueryContextDefinition[] | null | undefined => contexts?.map((item) => {
      const isUpdatedContext = updatedContext.id
        ? item.id === updatedContext.id
        : item.name === updatedContext.name;
      const refreshed = isUpdatedContext
        ? { ...item, query: updatedContext.query }
        : item;
      return {
        ...refreshed,
        query: {
          ...refreshed.query,
          contexts: updateContextReferences(refreshed.query.contexts),
        },
      };
    });
    return {
      ...definition,
      contexts: updateContextReferences(definition.contexts),
      contextCatalog: updateContextReferences(definition.contextCatalog),
    };
  };
  const updateDefinitionFromDesign = (nextDefinition: QueryDefinition) => {
    if (activeContextIndex === null) {
      updateDefinition(nextDefinition);
      return;
    }
    updateDefinition(updateContextDefinition(activeContextIndex, nextDefinition));
  };
  const loadOquery = async (definitionToSerialize: QueryDefinition) => {
    const requestId = ++oqueryLoadRequestRef.current;
    setOqueryStatus("loading");
    setOqueryError("");
    try {
      const text = await dispatch(getQueryRequestText(definitionToSerialize)).unwrap();
      if (requestId !== oqueryLoadRequestRef.current) return;
      setOqueryText(text);
      updateSelectedOQueryText("");
      boundOqueryTextRef.current = text;
      setOqueryValidationMessage("");
    } catch (error) {
      if (requestId !== oqueryLoadRequestRef.current) return;
      setOqueryError(typeof error === "string" ? error : "Unable to load OQuery text.");
    } finally {
      if (requestId === oqueryLoadRequestRef.current)
        setOqueryStatus("idle");
    }
  };
  useEffect(() => {
    const urlEditorMode = getEditorMode(searchParams);
    setEditorMode((currentMode) => currentMode === urlEditorMode ? currentMode : urlEditorMode);
  }, [searchParams]);
  const changeEditorMode = (mode: EditorMode) => {
    if (mode === editorMode) return;
    if (mode === "oquery") {
      setEditorMode(mode);
    } else {
      setOqueryError("");
      setEditorMode(mode);
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set(EDITOR_MODE_SEARCH_PARAM, mode);
    setSearchParams(nextSearchParams);
  };
  useEffect(() => {
    if (editorMode !== "oquery") return;
    void loadOquery(activeDefinition);
  }, [editorMode, selectedRequestName, activeContextIndex]);
  const applyOquery = async () => {
    if (!oqueryText.trim() || oqueryStatus !== "idle") return;
    setOqueryStatus("applying");
    setOqueryError("");
    setOqueryValidationMessage("");
    try {
      const syntaxError = getOquerySyntaxError(oqueryText, functionDefinitions, filterOperators);
      if (syntaxError) {
        setOqueryError(syntaxError);
        return;
      }
      const normalizedOqueryText = oqueryText;
      const entityForParse = getOqueryEntity(normalizedOqueryText) || activeDefinition.entity.trim();
      if (!entityForParse) {
        setOqueryError("Missing query header: OQuery text must start with an entity, such as \"Users: Id, Name\".");
        return;
      }
      const parsed = await dispatch(parseQueryRequestText({
        text: normalizedOqueryText,
        entity: entityForParse,
      })).unwrap();
      updateDefinitionFromDesign(fromApiQueryDefinition(parsed));
      setOqueryValidationMessage("Valid OQuery");
    } catch (error) {
      setOqueryError(typeof error === "string" ? error : "Unable to parse OQuery text.");
    } finally {
      setOqueryStatus("idle");
    }
  };
  const formatOquery = async () => {
    if (!oqueryText.trim() || oqueryStatus !== "idle") return;
    setOqueryStatus("applying");
    setOqueryError("");
    setOqueryValidationMessage("");
    try {
      const syntaxError = getOquerySyntaxError(oqueryText, functionDefinitions, filterOperators);
      if (syntaxError) {
        setOqueryError(syntaxError);
        return;
      }
      const normalizedOqueryText = oqueryText;
      const entityForParse = getOqueryEntity(normalizedOqueryText) || activeDefinition.entity.trim();
      if (!entityForParse) {
        setOqueryError("Missing query header: OQuery text must start with an entity, such as \"Users: Id, Name\".");
        return;
      }
      const parsed = await dispatch(parseQueryRequestText({
        text: normalizedOqueryText,
        entity: entityForParse,
      })).unwrap();
      const formatted = await dispatch(getQueryRequestText(fromApiQueryDefinition(parsed))).unwrap();
      setOqueryText(preserveOqueryKeys(formatted, oqueryText));
      updateSelectedOQueryText("");
    } catch (error) {
      setOqueryError(typeof error === "string" ? error : "Unable to format OQuery text.");
    } finally {
      setOqueryStatus("idle");
    }
  };
  const insertOqueryTemplate = () => {
    const entityName = activeDefinition.entity.trim();
    setOqueryError("");
    setOqueryValidationMessage("");
    updateSelectedOQueryText("");
    setOqueryText([
      `${entityName}: Id`,
      "  Where ",
      "  Order ",
      "  Skip 0",
      "  Take 50",
    ].join("\n"));
  };
  const updateRequestName = (name: string) => {
    setRequestName(name);
    if (name.trim()) setRequestNameError("");
  };
  const createContext = (rawName: string) => {
    const name = rawName.trim();
    const contexts = definition.contextCatalog ?? [];
    if (contexts.some((context) => context.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return false;
    }
    const context: ApiQueryContextDefinition = {
      name,
      id: `context-${crypto.randomUUID()}`,
      query: {
        entity: "",
        projection: [],
        filter: null,
        sorts: [],
        page: null,
        pageSize: null,
      },
    };
    updateDefinition({ ...definition, contextCatalog: [...contexts, context] });
    setSelectedContextIndex(contexts.length);
    return true;
  };
  const updateContextName = (name: string) => {
    if (activeContextIndex === null || !definition.contextCatalog) return;
    const previousName = definition.contextCatalog[activeContextIndex]?.name;
    if (!previousName || !name.trim() || previousName === name) return;
    if (definition.contextCatalog.some((context, index) =>
      index !== activeContextIndex && context.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0)) return;
    const renameReferences = (contexts: ApiQueryContextDefinition[] | null | undefined): ApiQueryContextDefinition[] | undefined =>
      contexts?.map((context) => ({
        ...context,
        name: context.name === previousName ? name : context.name,
        alias: context.alias === previousName ? name : context.alias,
        query: {
          ...context.query,
          contexts: renameReferences(context.query.contexts),
        },
      }));
    updateDefinition({
      ...definition,
      contexts: renameReferences(definition.contexts),
      contextCatalog: renameReferences(definition.contextCatalog),
    });
  };
  const deleteContext = async (contextIndex: number) => {
    const context = definition.contextCatalog?.[contextIndex];
    if (!context || !definition.contextCatalog) return;
    const action = await showMessageBox({
      eyebrow: "DELETE CONTEXT",
      title: `Delete "${context.name}"?`,
      message: "This context and joins that reference it will be removed from the current query design.",
      actions: [
        { value: "cancel", label: "Keep context", variant: "secondary" },
        { value: "delete", label: "Delete context", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    const removeReferencedContext = (contexts: ApiQueryContextDefinition[] | null | undefined): ApiQueryContextDefinition[] | undefined => contexts
      ?.filter((item) => item.id !== context.id)
      .map((item) => ({
        ...item,
        query: {
          ...item.query,
          contexts: removeReferencedContext(item.query.contexts),
        },
      }));
    const remaining = definition.contextCatalog
      .filter((_, index) => index !== contextIndex)
      .map((item) => ({
        ...item,
        query: {
          ...item.query,
          contexts: removeReferencedContext(item.query.contexts),
        },
      }));
    updateDefinition({
      ...definition,
      contexts: removeReferencedContext(definition.contexts),
      contextCatalog: remaining.length ? remaining : undefined,
    });
    setSelectedContextIndex((selected) => selected === null
      ? null
      : selected === contextIndex
        ? null
        : selected > contextIndex
          ? selected - 1
          : selected);
  };
  const updateRequestRoute = (name: string | null) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (name) nextSearchParams.set("request", name);
    else nextSearchParams.delete("request");
    setSearchParams(nextSearchParams);
  };
  useEffect(() => {
    dispatch(fetchQueryMetadata());
    dispatch(fetchFunctionDefinitions());
    dispatch(fetchFilterOperators());
  }, [dispatch]);

  useEffect(() => {
    if (queryRequestsStatus === "idle") dispatch(fetchQueryRequests());
  }, [dispatch, queryRequestsStatus]);

  useEffect(() => {
    const selectedEntity = entity;
    if (!selectedEntity || definition.contexts?.length) return;
    const reconciled = reconcileDefinition(definition, selectedEntity, metadata);
    if (!reconciled.columns.length) {
      updateDefinition({
        ...reconciled,
        columns: selectedEntity.fields.map((field) => ({ field: field.name, alias: null })),
      });
    } else if (reconciled !== definition) {
      updateDefinition(reconciled);
    }
  }, [metadata, definition.entity, definition.contextCatalog, definition.contexts]);

  const runQuery = async () => {
    const textToExecute = selectedOQueryTextRef.current.trim() || oqueryText;
    if (editorMode === "oquery" ? textToExecute.trim() : activeDefinition.entity.trim() && activeDefinition.columns.length) {
      if (!connectedProvider || connectionStatus !== "succeeded") {
        onRequestConnection();
        return;
      }
      if (activeContextIndex !== null) {
        updateDefinition(updateContextDefinition(activeContextIndex, activeDefinition));
      }
      if (editorMode === "oquery") dispatch(executeQueryFromText(textToExecute));
      else dispatch(executeQuery({
          ...activeDefinition,
          filters: activeDefinition.filters,
        }));
    }
  };
  const runOQueryContext = (contextName: string) => {
    const text = selectedOQueryTextRef.current.trim() || oqueryText;
    if (!text.trim()) return;
    dispatch(executeContextFromText({ text, context: contextName }));
  };

  const changePage = (page: number) => {
    if (!activeDefinition.entity.trim() || !activeDefinition.columns.length) return;
    if (!connectedProvider || connectionStatus !== "succeeded") {
      onRequestConnection();
      return;
    }
    const nextActiveDefinition = { ...activeDefinition, page };
    const nextDefinition = activeContextIndex === null
      ? nextActiveDefinition
      : updateContextDefinition(activeContextIndex, nextActiveDefinition);
    updateDefinition(nextDefinition);
    dispatch(executeQuery(nextActiveDefinition));
  };

  const getSql = () => {
    const textToExecute = selectedOQueryTextRef.current.trim() || oqueryText;
    if (editorMode === "oquery" ? textToExecute.trim() : activeDefinition.entity.trim() && activeDefinition.columns.length) {
      if (!connectedProvider || connectionStatus !== "succeeded") {
        onRequestConnection();
        return;
      }
      if (editorMode === "oquery") dispatch(getSqlStatementFromText(textToExecute));
      else dispatch(getSqlStatement({
          ...activeDefinition,
          filters: activeDefinition.filters,
        }));
    }
  };

  const persistCurrentRequest = async (currentDefinition: QueryDefinition) => {
    const name = requestName.trim();
    if (!name) {
      setRequestNameError("Enter a query name before saving.");
      return false;
    }
    setRequestNameError("");
    setQueryRequestNotice("");
    setIsSavingQuery(true);
    try {
      const resultAction = await dispatch(saveQueryRequest({
        name,
        definition: currentDefinition,
        id: selectedRequestIsBuiltin ? undefined : selectedRequestId ?? undefined,
      }));
      if (saveQueryRequest.fulfilled.match(resultAction)) {
        setSelectedRequestId(resultAction.payload.id);
        setSelectedRequestName(resultAction.payload.name);
        setSelectedRequestIsBuiltin(false);
        setRequestName(resultAction.payload.name);
        updateRequestRoute(resultAction.payload.name);
        setQueryRequestNotice("Query saved.");
        boundModelRef.current = JSON.stringify({
          definition: currentDefinition,
          requestName: resultAction.payload.name,
        });
        return true;
      }
      return false;
    } finally {
      setIsSavingQuery(false);
    }
  };
  const confirmModelReplacement = async () => {
    if (!hasUnsavedChanges) return true;
    const action = await showMessageBox({
      eyebrow: "UNSAVED QUERY",
      title: "Save your query changes?",
      message: "Save your changes before continuing, discard them, or stay here to keep editing.",
      actions: [
        { value: "stay", label: "Stay here", variant: "secondary" },
        { value: "discard", label: "Discard changes", variant: "secondary" },
        { value: "save", label: "Save changes", variant: "primary" },
      ],
    });
    if (action === "save") return persistCurrentRequest(definition);
    return action === "discard";
  };
  const startNewRequest = async () => {
    if (!(await confirmModelReplacement())) return;
    oqueryLoadRequestRef.current++;
    dispatch(clearQueryResult());
    updateRequestRoute(null);
    setSelectedRequestName(null);
    setSelectedRequestId(null);
    setSelectedContextIndex(null);
    setSelectedRequestIsBuiltin(false);
    setRequestName("");
    setRequestNameError("");
    setQueryRequestNotice("");
    setOqueryText("");
    updateSelectedOQueryText("");
    boundOqueryTextRef.current = "";
    setOqueryError("");
    setOqueryValidationMessage("");
    setOqueryStatus("idle");
    const nextDefinition = createDefinition("");
    boundModelRef.current = JSON.stringify({ definition: nextDefinition, requestName: "" });
    updateDefinition(nextDefinition);
  };
  const selectSavedRequest = async (
    savedRequest: (typeof queryRequests)[number],
    updateRoute = true,
  ) => {
    if (!(await confirmModelReplacement())) return;
    oqueryLoadRequestRef.current++;
    dispatch(clearQueryResult());
    if (debugUiEnabled) console.log("Saved Query Request:", savedRequest);
    const savedView = toQueryBuilderSavedView(savedRequest);
    const nextDefinition = fromApiQuery(savedView.query, savedView.projectionRows);
    if (updateRoute) updateRequestRoute(savedRequest.name);
    setSelectedContextIndex(null);
    boundModelRef.current = JSON.stringify({
      definition: nextDefinition,
      requestName: savedRequest.name,
    });
    updateDefinition(nextDefinition);
    setRequestName(savedRequest.name);
    setRequestNameError("");
    setSelectedRequestName(savedRequest.name);
    setSelectedRequestId(savedRequest.id);
    setSelectedRequestIsBuiltin(savedRequest.isBuiltin);
    setQueryRequestNotice("");
  };
  useEffect(() => {
    const requestedName = searchParams.get("request");
    if (!requestedName || selectedRequestName === requestedName) return;
    const savedRequest = queryRequests.find((request) => request.name === requestedName);
    if (savedRequest) void selectSavedRequest(savedRequest, false);
  }, [queryRequests, searchParams, selectedRequestName]);

  const saveCurrentRequest = async () => {
    if (editorMode !== "oquery") {
      await persistCurrentRequest(definition);
      return;
    }
    if (!oqueryText.trim() || oqueryStatus !== "idle") return;
    setOqueryStatus("applying");
    setOqueryError("");
    try {
      const syntaxError = getOquerySyntaxError(oqueryText, functionDefinitions, filterOperators);
      if (syntaxError) {
        setOqueryError(syntaxError);
        return;
      }
      const normalizedOqueryText = oqueryText;
      const entity = getOqueryEntity(normalizedOqueryText) || activeDefinition.entity.trim();
      if (!entity) {
        setOqueryError("Missing query entity: select an entity before saving.");
        return;
      }
      const parsed = await dispatch(parseQueryRequestText({ text: normalizedOqueryText, entity })).unwrap();
      const nextActiveDefinition = fromApiQueryDefinition(parsed);
      const nextDefinition = activeContextIndex === null
        ? nextActiveDefinition
        : updateContextDefinition(activeContextIndex, nextActiveDefinition);
      updateDefinition(nextDefinition);
      await persistCurrentRequest(nextDefinition);
    } catch (error) {
      setOqueryError(typeof error === "string" ? error : "Unable to save OQuery query.");
    } finally {
      setOqueryStatus("idle");
    }
  };
  const removeCurrentRequest = async () => {
    if (!selectedRequestName || !selectedRequestId || selectedRequestIsBuiltin) return;
    const action = await showMessageBox({
      eyebrow: "DELETE SAVED QUERY",
      title: `Delete â€œ${selectedRequestName}â€?`,
      message: "This saved query request will be permanently removed.",
      actions: [
        { value: "cancel", label: "Keep query", variant: "secondary" },
        { value: "delete", label: "Delete query", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    const resultAction = await dispatch(deleteQueryRequest({ id: selectedRequestId }));
    if (deleteQueryRequest.fulfilled.match(resultAction)) {
      updateRequestRoute(null);
      setSelectedRequestName(null);
      setSelectedRequestId(null);
      setSelectedContextIndex(null);
      setSelectedRequestIsBuiltin(false);
      setRequestName("");
      setQueryRequestNotice("Query deleted. The current design remains available as a draft.");
    }
  };

  const updateOqueryDesignHeight = (height: number) => {
    const clampedHeight = Math.min(OQUERY_DESIGN_HEIGHT_MAX, Math.max(OQUERY_DESIGN_HEIGHT_MIN, Math.round(height)));
    setOqueryDesignHeight(clampedHeight);
    setOqueryDesignResized(true);
    window.localStorage.setItem(OQUERY_DESIGN_HEIGHT_STORAGE_KEY, String(clampedHeight));
  };

  return (
    <>
      <section className="page-heading query-page-heading">
        <div className="query-heading-main">
          <span className="query-heading-mark"><Icon name="query" size={21} /></span>
          <div className="query-heading-copy">
            <span className="query-heading-eyebrow">QUERY WORKSPACE <i /> DESIGN Â· RUN Â· REFINE</span>
            <h2>Explore your data</h2>
            <p>Shape a query visually or edit OQuery text, then inspect its SQL and live results.</p>
          </div>
        </div>
        <div className="heading-actions">
          <nav className="database-section-tabs query-editor-tabs" role="tablist" aria-label="Query editor">
            <button type="button" role="tab" aria-selected={editorMode === "visual"} className={editorMode === "visual" ? "active" : ""} onClick={() => changeEditorMode("visual")}>
              <Icon name="query" size={14} /> Visual
            </button>
            <button type="button" role="tab" aria-selected={editorMode === "oquery"} className={editorMode === "oquery" ? "active" : ""} onClick={() => changeEditorMode("oquery")}>
              <Icon name="code" size={14} /> OQuery
            </button>
          </nav>
          {onBackToHome && <button className="button secondary" onClick={onBackToHome}><Icon name="arrow-left" size={14} /> Back to home</button>}
          {!selectedRequestIsBuiltin && <>
            {selectedRequestName && <button type="button" className="button secondary query-icon-button query-delete-button" aria-label="Delete query" title="Delete query" onClick={() => void removeCurrentRequest()}>
              <Icon name="trash" size={16} />
            </button>}
            <button type="button" className="button primary query-icon-button query-save-button" aria-label={isSavingQuery ? "Saving query" : "Save query"} title={isSavingQuery ? "Saving query..." : "Save query"} onClick={() => void saveCurrentRequest()} disabled={queryStatus === "loading" || isSavingQuery}>
              <Icon name="save" size={17} />
            </button>
          </>}
          <button type="button" className="button secondary query-icon-button query-new-button" aria-label="New query" title="New query" onClick={startNewRequest}>
            <Icon name="file-plus" size={17} />
          </button>
          <ToastNotice
            key={queryRequestsStatus}
            message={queryRequestsError || queryRequestNotice}
            isError={Boolean(queryRequestsError)}
            placement="anchor"
          />
        </div>
      </section>

      <div className={editorMode === "oquery" ? `query-builder-sections oquery-layout${oqueryDesignResized ? " oquery-layout-resized" : ""}` : "query-builder-sections"} style={editorMode === "oquery" ? { "--oquery-design-height": `${oqueryDesignHeight}px` } as CSSProperties : undefined}>
        <section className="query-section query-design-section" aria-label="Section 1: Design">
          <div className={`query-design-workspace split-workspace${savedQueriesPanel.collapsed ? " panel-collapsed" : ""}`} style={savedQueriesPanel.style}>
            <SavedQueryList
              requests={queryRequests}
              selectedRequestName={selectedRequestName}
              status={queryRequestsStatus}
              error={queryRequestsError}
              onSelectRequest={selectSavedRequest}
              onRetry={() => {
                void dispatch(fetchQueryRequests());
              }}
            />
            <PanelSplitter panel={savedQueriesPanel} label="saved queries panel" />
            <div className="query-design-area">
              <QueryDesign
                key={`${selectedRequestName ?? "draft"}-${activeContextIndex ?? "request"}`}
                metadata={metadata}
                metadataStatus={metadataStatus}
                metadataError={metadataError}
                functionDefinitions={functionDefinitions}
                functionDefinitionsStatus={functionDefinitionsStatus}
                functionDefinitionsError={functionDefinitionsError}
                filterOperators={filterOperators}
                filterOperatorsStatus={filterOperatorsStatus}
                filterOperatorsError={filterOperatorsError}
                definition={activeDefinition}
                entity={activeEntity}
                contextDefinitions={definition.contextCatalog ?? []}
                selectedContextIndex={activeContextIndex}
                onSelectContext={setSelectedContextIndex}
                onCreateContext={createContext}
                onDeleteContext={(index) => void deleteContext(index)}
                onContextNameChange={updateContextName}
                requestName={requestName}
                requestNameError={requestNameError}
                onRequestNameChange={updateRequestName}
                onDefinitionChange={updateDefinitionFromDesign}
                editorMode={editorMode}
                oqueryText={oqueryText}
                oqueryStatus={oqueryStatus}
                oqueryError={oqueryError}
                onOqueryTextChange={(text) => {
                  dispatch(clearQueryResult());
                  setOqueryText(text);
                  updateSelectedOQueryText("");
                  setOqueryValidationMessage("");
                }}
                onOQuerySelectionChange={updateSelectedOQueryText}
                onExecuteOQueryContext={runOQueryContext}
                oqueryValidationMessage={oqueryValidationMessage}
                onFormatOquery={() => void formatOquery()}
                onInsertOqueryTemplate={insertOqueryTemplate}
                onApplyOquery={() => void applyOquery()}
              />
            </div>
          </div>
        </section>
        {editorMode === "oquery" && <QuerySectionSplitter height={oqueryDesignHeight} onHeightChange={updateOqueryDesignHeight} />}
        <section className="query-section query-result-section" aria-label="Section 2: Query Result">
          <QueryResult
            result={result}
            sqlStatement={sqlStatement}
            resultView={resultView}
            onRunQuery={runQuery}
            onGetSql={getSql}
            pageNumber={activeDefinition.page ?? 1}
            pageSize={activeDefinition.pageSize}
            onPageChange={changePage}
            pageNavigationEnabled
            queryLoading={queryStatus === "loading"}
            queryDisabled={editorMode === "oquery"
              ? !oqueryText.trim()
              : !activeDefinition.entity.trim() || !activeDefinition.columns.length}
            error={queryError}
          />
        </section>
      </div>
    </>
  );
}
