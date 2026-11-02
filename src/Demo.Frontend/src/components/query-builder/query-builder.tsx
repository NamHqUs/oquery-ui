import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import Icon from "../icon/icon";
import { useMessageBox } from "../message-box/message-box";
import PanelSplitter from "../panel-splitter/panel-splitter";
import ToastNotice from "../toast-notice/toast-notice";
import { ApiQueryContextDefinition, createApiQuery, deleteQueryRequest, executeQuery, fetchFilterOperators, fetchFunctionDefinitions, fetchQueryMetadata, fetchQueryRequests, fromApiQuery, fromApiQueryDefinition, getSqlStatement, IFieldDefinition, MetadataEntity, MetadataField, QueryDefinition, QueryFilterGroup, QueryFilterNode, saveQueryRequest, toQueryBuilderSavedView } from "./query-design/query-builder-slice";
import QueryDesign from "./query-design/query-design";
import QueryResult from "./query-result/query-result";
import SavedQueryList from "./saved-query-list/saved-query-list";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import type { AppDispatch, RootState } from "../../store/store";
import "./query-builder.css";

type QueryBuilderProps = {
  onBackToReports?: () => void;
  onRequestConnection: () => void;
};

let cachedDefinition: QueryDefinition | null = null;
const QUERY_DEFINITION_STORAGE_KEY = "OQuery-query-builder-definition";

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

export default function QueryBuilder({ onBackToReports, onRequestConnection }: QueryBuilderProps) {
  const dispatch = useDispatch<AppDispatch>();
  const showMessageBox = useMessageBox();
  const [searchParams, setSearchParams] = useSearchParams();
  const savedQueriesPanel = useResizablePanel("query-builder-saved-queries");
  const { metadata, metadataStatus, metadataError, result, sqlStatement, resultView, queryStatus, queryError, functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, filterOperators, filterOperatorsStatus, filterOperatorsError, queryRequests, queryRequestsStatus, queryRequestsError, debugUiEnabled } = useSelector((state: RootState) => state.queryBuilder);
  const { connectedProvider, connectionStatus } = useSelector((state: RootState) => state.database);
  const [definition, setDefinition] = useState<QueryDefinition>(loadDefinition);
  const [requestName, setRequestName] = useState("");
  const boundModelRef = useRef(JSON.stringify({ definition, requestName }));
  const hasUnsavedChanges = JSON.stringify({ definition, requestName }) !== boundModelRef.current;
  const [selectedContextIndex, setSelectedContextIndex] = useState<number | null>(null);
  const [selectedRequestName, setSelectedRequestName] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequestIsBuiltin, setSelectedRequestIsBuiltin] = useState(false);
  const [queryRequestNotice, setQueryRequestNotice] = useState("");
  const [requestNameError, setRequestNameError] = useState("");
  const [isSavingQuery, setIsSavingQuery] = useState(false);
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
    const contexts = definition.contextCatalog.map((context, index) =>
      index === activeContextIndex ? { ...context, name } : context,
    );
    updateDefinition({ ...definition, contextCatalog: contexts });
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
    if (activeDefinition.entity.trim() && activeDefinition.columns.length) {
      if (!connectedProvider || connectionStatus !== "succeeded") {
        onRequestConnection();
        return;
      }
      if (activeContextIndex !== null) {
        updateDefinition(updateContextDefinition(activeContextIndex, activeDefinition));
      }
      dispatch(executeQuery({
        ...activeDefinition,
        filters: activeDefinition.filters,
      }));
    }
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
    if (activeDefinition.entity.trim() && activeDefinition.columns.length) {
      if (!connectedProvider || connectionStatus !== "succeeded") {
        onRequestConnection();
        return;
      }
      dispatch(getSqlStatement({
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
        setSelectedRequestId(resultAction.payload.mainQuery.id);
        setSelectedRequestName(resultAction.payload.mainQuery.name);
        setSelectedRequestIsBuiltin(false);
        setRequestName(resultAction.payload.mainQuery.name);
        updateRequestRoute(resultAction.payload.mainQuery.name);
        setQueryRequestNotice("Query saved.");
        boundModelRef.current = JSON.stringify({
          definition: currentDefinition,
          requestName: resultAction.payload.mainQuery.name,
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
    updateRequestRoute(null);
    setSelectedRequestName(null);
    setSelectedRequestId(null);
    setSelectedContextIndex(null);
    setSelectedRequestIsBuiltin(false);
    setRequestName("");
    setRequestNameError("");
    setQueryRequestNotice("");
    const nextDefinition = createDefinition("");
    boundModelRef.current = JSON.stringify({ definition: nextDefinition, requestName: "" });
    updateDefinition(nextDefinition);
  };
  const selectSavedRequest = async (
    savedRequest: (typeof queryRequests)[number],
    updateRoute = true,
  ) => {
    if (!(await confirmModelReplacement())) return;
    if (debugUiEnabled) console.log("Saved Query Request:", savedRequest);
    const savedView = toQueryBuilderSavedView(savedRequest);
    const nextDefinition = fromApiQuery(savedView.query, savedView.projectionRows);
    if (updateRoute) updateRequestRoute(savedRequest.mainQuery.name);
    setSelectedContextIndex(null);
    boundModelRef.current = JSON.stringify({
      definition: nextDefinition,
      requestName: savedRequest.mainQuery.name,
    });
    updateDefinition(nextDefinition);
    setRequestName(savedRequest.mainQuery.name);
    setRequestNameError("");
    setSelectedRequestName(savedRequest.mainQuery.name);
    setSelectedRequestId(savedRequest.mainQuery.id);
    setSelectedRequestIsBuiltin(savedRequest.isBuiltin);
    setQueryRequestNotice("");
  };
  useEffect(() => {
    const requestedName = searchParams.get("request");
    if (!requestedName || selectedRequestName === requestedName) return;
    const savedRequest = queryRequests.find((request) => request.mainQuery.name === requestedName);
    if (savedRequest) void selectSavedRequest(savedRequest, false);
  }, [queryRequests, searchParams, selectedRequestName]);

  const saveCurrentRequest = () => void persistCurrentRequest(definition);
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

  return (
    <>
      <section className="page-heading query-page-heading">
        <div className="query-heading-main">
          <span className="query-heading-mark"><Icon name="query" size={21} /></span>
          <div className="query-heading-copy">
            <span className="query-heading-eyebrow">QUERY WORKSPACE <i /> DESIGN Â· RUN Â· REFINE</span>
            <h2>Explore your data</h2>
            <p>Shape a query visually, then inspect its SQL and live results.</p>
          </div>
        </div>
        <div className="heading-actions">
          {onBackToReports && <button className="button secondary" onClick={onBackToReports}><Icon name="arrow-left" size={14} /> Back to reports</button>}
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
            />
          </div>
        </div>
        {queryError && <p className="query-message error query-builder-error" role="alert">{queryError}</p>}
      </section>
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
          queryDisabled={!activeDefinition.entity.trim() || !activeDefinition.columns.length}
        />
      </section>
    </>
  );
}
