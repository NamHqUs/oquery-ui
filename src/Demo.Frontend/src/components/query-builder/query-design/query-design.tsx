import { createPortal } from "react-dom";
import { useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiQueryContextDefinition, FilterOperatorDefinition, hasApiQueryCondition, MetadataEntity, QueryDefinition } from "./query-builder-slice";
import { FunctionDefinition } from "../../function-definition/types";
import Icon from "../../icon/icon";
import ProjectionBuilder from "./projection-builder/projection-builder";
import SortBuilder from "./sort-builder/sort-builder";
import FilterBuilder from "./filter-builder/filter-builder";
import JoinsBuilder from "./joins-builder/joins-builder";
import OQueryEditor from "../../oquery-editor/oquery-editor";
import { getOQuerySuggestionData } from "../../oquery-editor/oquery-suggestion-data";
import { MetadataRelationsContext } from "./metadata-relations-context";
import DiagramView, { type DiagramRelationship, type DiagramTable } from "../../metadata-builder/entity-diagram/diagram-view";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import "./query-design.css";

const OQUERY_EDITOR_MIN_HEIGHT = 6 * 20.8 + 32;

type EntityMenuProps = {
  entities: MetadataEntity[];
  value: string;
  disabled: boolean;
  onChange: (entity: MetadataEntity) => void;
};

function EntityMenu({ entities, value, disabled, onChange }: EntityMenuProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedEntity = entities.find((item) => item.name === value);
  const filteredEntities = entities.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const bounds = trigger.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const top = window.innerHeight - bounds.bottom < menuHeight + 4 && bounds.top >= menuHeight + 4
        ? bounds.top - menuHeight - 4
        : bounds.bottom + 4;
      const width = Math.max(bounds.width, 240);
      const left = Math.min(bounds.left, Math.max(8, window.innerWidth - width - 8));
      setMenuPosition({ top, left, width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, search, filteredEntities.length]);

  useLayoutEffect(() => {
    if (open && menuPosition) searchRef.current?.focus();
  }, [open, menuPosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node
        && !containerRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)
      ) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="entity-menu" ref={containerRef}>
      <button
        type="button"
        className={`entity-menu-trigger${selectedEntity ? "" : " empty"}`}
        ref={triggerRef}
        aria-label="Entity"
        aria-invalid={!value.trim()}
        aria-describedby={!value.trim() ? "query-entity-error" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => {
          setSearch("");
          setOpen((isOpen) => !isOpen);
        }}
      >
        <span>{selectedEntity?.name ?? (value || "Select an entity...")}</span>
      </button>
      {open && createPortal(
        <div
          className="entity-menu-popup"
          ref={menuRef}
          role="menu"
          aria-label="Entities"
          style={{
            position: "fixed",
            top: menuPosition?.top ?? 0,
            left: menuPosition?.left ?? 0,
            width: menuPosition?.width,
            visibility: menuPosition ? "visible" : "hidden",
          }}
        >
          <input
            ref={searchRef}
            className="entity-menu-search"
            type="search"
            aria-label="Search entities"
            placeholder="Search entities..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {filteredEntities.length
            ? filteredEntities.map((item) => (
              <button
                type="button"
                className={`entity-menu-option${item.name === value ? " selected" : ""}`}
                role="menuitemradio"
                aria-checked={item.name === value}
                key={item.name}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setSearch("");
                  triggerRef.current?.focus();
                }}
              >
                {item.name}
              </button>
            ))
            : <span className="entity-menu-empty" role="status">No entities found.</span>}
        </div>,
        document.body,
      )}
    </div>
  );
}

type QueryDesignProps = {
  domainId: string;
  metadata: MetadataEntity[];
  metadataStatus: string;
  metadataError: string;
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  filterOperators: FilterOperatorDefinition[];
  filterOperatorsStatus: string;
  filterOperatorsError: string;
  definition: QueryDefinition;
  contextDefinitions: ApiQueryContextDefinition[];
  selectedContextIndex: number | null;
  onSelectContext: (index: number | null) => void;
  onCreateContext: (name: string) => boolean;
  onDeleteContext: (index: number) => void;
  onContextNameChange: (name: string) => void;
  entity?: MetadataEntity;
  requestName: string;
  requestNameError: string;
  onRequestNameChange: (name: string) => void;
  onDefinitionChange: (definition: QueryDefinition) => void;
  editorMode: "visual" | "oquery";
  oqueryText: string;
  oqueryStatus: "idle" | "loading" | "applying";
  oqueryError: string;
  onOqueryTextChange: (text: string) => void;
  onOQuerySelectionChange: (text: string) => void;
  onExecuteOQueryContext?: (contextName: string) => void;
  onFormatOquery: () => void;
  onInsertOqueryTemplate: () => void;
  onApplyOquery: () => void;
};

type OQueryDiagramLayout = "horizontal" | "vertical";

const OQUERY_DIAGRAM_LAYOUT_STORAGE_KEY = "OQuery.query-builder.diagram-layout";

function readOQueryDiagramLayout(): OQueryDiagramLayout {
  return window.localStorage.getItem(OQUERY_DIAGRAM_LAYOUT_STORAGE_KEY) === "vertical"
    ? "vertical"
    : "horizontal";
}

export default function QueryDesign({
  domainId,
  metadata,
  metadataStatus,
  metadataError,
  functionDefinitions,
  functionDefinitionsStatus,
  functionDefinitionsError,
  filterOperators,
  filterOperatorsStatus,
  filterOperatorsError,
  definition,
  contextDefinitions,
  selectedContextIndex,
  onSelectContext,
  onCreateContext,
  onDeleteContext,
  onContextNameChange,
  entity,
  requestName,
  requestNameError,
  onRequestNameChange,
  onDefinitionChange,
  editorMode,
  oqueryText,
  oqueryStatus,
  oqueryError,
  onOqueryTextChange,
  onOQuerySelectionChange,
  onExecuteOQueryContext,
  onFormatOquery,
  onInsertOqueryTemplate,
  onApplyOquery,
}: QueryDesignProps) {
  const [draggedProjectionField, setDraggedProjectionField] = useState<string | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const entityDiagramPanel = useResizablePanel("query-builder-oquery-diagram-height", 360, OQUERY_EDITOR_MIN_HEIGHT, 1200);
  const [diagramLayout, setDiagramLayout] = useState<OQueryDiagramLayout>(readOQueryDiagramLayout);
  const [newContextName, setNewContextName] = useState("");
  const [contextNameError, setContextNameError] = useState("");
  const contextEntities = contextDefinitions.map((context) => {
    const fields = context.query.projection?.flatMap((projection) => {
      const alias = projection.alias?.trim();
      if (alias) return [alias];

      const projectionFields = "fields" in projection
        ? projection.fields
        : [projection.field];
      return projectionFields.length === 1 && projectionFields[0].kind === "field"
        ? [projectionFields[0].field.split(".").pop() ?? projectionFields[0].field]
        : [];
    }) ?? [];
    return {
      name: context.name,
      fields: [...new Set(fields)].map((name) => ({ name, dbColumn: name })),
    };
  });
  const metadataRelations = useContext(MetadataRelationsContext);
  const suggestionData = getOQuerySuggestionData(metadata, metadataRelations);
  const diagramTables: DiagramTable[] = metadata.map((item) => ({
    schema: item.schema || "dbo",
    name: item.name,
    dbTable: item.dbTable,
    columns: item.fields.map((field) => ({
      name: field.name,
      dataType: field.dataType || "String",
      isPrimaryKey: false,
    })),
  }));
  const diagramRelationships: DiagramRelationship[] = metadataRelations.map((relation) => {
    const source = metadata.find((item) => item.name === relation.sourceEntity);
    const target = metadata.find((item) => item.name === relation.targetEntity);
    return {
      name: relation.sourceRelationName || `${relation.sourceEntity} to ${relation.targetEntity}`,
      sourceSchema: source?.schema || "dbo",
      sourceTable: relation.sourceEntity,
      sourceColumns: relation.sourceFields,
      targetSchema: target?.schema || "dbo",
      targetTable: relation.targetEntity,
      targetColumns: relation.targetFields,
      isUnique: false,
    };
  });
  const metadataWithContexts = [
    ...metadata,
    ...contextEntities.filter((context) => !metadata.some((item) => item.name === context.name)),
  ];
  const entityOptions = [
    ...metadata,
    ...(selectedContextIndex === null
      ? contextEntities.filter((context) => !metadata.some((item) => item.name === context.name))
      : []),
  ];
  if (entity && !entityOptions.some((item) => item.name === entity.name)) entityOptions.push(entity);
  const sourceContext = definition.contexts?.find((context) =>
    context.name === definition.entity && !context.alias?.trim() && !hasApiQueryCondition(context.condition));
  const relationDefinition = sourceContext
    ? { ...definition, contexts: definition.contexts?.filter((context) => context !== sourceContext) }
    : definition;
  const relationContexts = sourceContext
    ? contextDefinitions.filter((context) => context.id !== sourceContext.id)
    : contextDefinitions;
  const onRelationDefinitionChange = (nextDefinition: QueryDefinition) => {
    onDefinitionChange(sourceContext
      ? { ...nextDefinition, contexts: [...(nextDefinition.contexts ?? []), sourceContext] }
      : nextDefinition);
  };
  const submitContext = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newContextName.trim();
    if (!name) {
      setContextNameError("Enter a name for the context.");
      return;
    }
    if (!onCreateContext(name)) {
      setContextNameError("A context with this name already exists.");
      return;
    }
    setContextDialogOpen(false);
    setNewContextName("");
    setContextNameError("");
  };
  const openContextDialog = () => {
    setContextDialogOpen(true);
    setContextNameError("");
  };

  return (
    <section className="query-builder-card">
      <div className="query-name-row">
        <div className="query-name-field">
          <input
            className="query-name-input"
            type="text"
            value={selectedContextIndex === null ? requestName : contextDefinitions[selectedContextIndex]?.name ?? ""}
            onChange={(event) => selectedContextIndex === null
              ? onRequestNameChange(event.target.value)
              : onContextNameChange(event.target.value)}
            placeholder={selectedContextIndex === null ? "e.g. recent-invoices" : "Context name"}
            aria-label={selectedContextIndex === null ? "Query name" : "Context name"}
            aria-invalid={selectedContextIndex === null && Boolean(requestNameError)}
            aria-describedby={selectedContextIndex === null && requestNameError ? "query-name-error" : undefined}
          />
          {selectedContextIndex === null && requestNameError && <p className="query-name-warning" id="query-name-error" role="alert">{requestNameError}</p>}
        </div>
      </div>
      {contextDialogOpen && <div className="context-name-backdrop">
        <form className="context-name-dialog" onSubmit={submitContext}>
          <span className="section-kicker">NEW CONTEXT</span>
          <h3>Create a context</h3>
          <p>Give this context a name. You can choose its entity and relations afterward.</p>
          <label htmlFor="new-context-name">Context name</label>
          <input
            id="new-context-name"
            autoFocus
            value={newContextName}
            onChange={(event) => {
              setNewContextName(event.target.value);
              setContextNameError("");
            }}
            placeholder="e.g. InvoiceDetails"
            aria-invalid={Boolean(contextNameError)}
            aria-describedby={contextNameError ? "new-context-name-error" : undefined}
          />
          {contextNameError && <p className="context-name-error" id="new-context-name-error" role="alert">{contextNameError}</p>}
          <div className="context-name-actions">
            <button type="button" className="button secondary" onClick={() => {
              setContextDialogOpen(false);
              setNewContextName("");
              setContextNameError("");
            }}>Cancel</button>
            <button type="submit" className="button primary">Create context</button>
          </div>
        </form>
      </div>}
      {editorMode === "oquery" ? (
        <>
        <div className={`query-oquery-workspace ${diagramLayout} split-workspace${entityDiagramPanel.collapsed ? " panel-collapsed" : ""}`} style={entityDiagramPanel.style}>
          <div className="query-oquery-diagram-panel">
            <DiagramView
              tables={diagramTables}
              groups={[{ id: domainId, name: domainId || "Current domain", tables: diagramTables, tone: "custom" }]}
              initialGroup={domainId || "Current domain"}
              selectedTableName={definition.entity}
              loading={metadataStatus === "loading"}
              relationships={diagramRelationships}
              hideActiveGroup
              compactCards
              navigationActions={
                <button
                  type="button"
                  className="diagram-navigation-icon-button"
                  aria-label={`Switch to ${diagramLayout === "horizontal" ? "vertical" : "horizontal"} layout`}
                  title={`Switch to ${diagramLayout === "horizontal" ? "vertical" : "horizontal"} layout`}
                  onClick={() => {
                    const nextLayout = diagramLayout === "horizontal" ? "vertical" : "horizontal";
                    setDiagramLayout(nextLayout);
                    window.localStorage.setItem(OQUERY_DIAGRAM_LAYOUT_STORAGE_KEY, nextLayout);
                  }}
                >
                  <Icon name={diagramLayout === "horizontal" ? "layout-horizontal" : "layout-vertical"} size={15} />
                </button>
              }
            />
          </div>
          <PanelSplitter
            panel={entityDiagramPanel}
            label="entity diagram"
            orientation={diagramLayout === "horizontal" ? "horizontal" : "vertical"}
            collapsible
            horizontalAnchor="top"
            verticalAnchor="right"
          />
          <div className="query-oquery-editor" role="tabpanel" aria-label="OQuery text editor">
            <OQueryEditor
              textOverride={oqueryText}
              onTextChange={onOqueryTextChange}
              oquery
              domain={{ id: domainId, name: domainId, entities: metadata, relations: metadataRelations }}
              functionDefinitions={functionDefinitions}
              operators={filterOperators}
              suggestionFields={suggestionData.fields}
              suggestionEntities={[...new Set([
                ...suggestionData.entities,
                ...contextDefinitions.map((context) => context.name),
              ])]}
              suggestionEntityName={definition.entity}
              suggestionEntitiesMetadata={suggestionData.entitiesMetadata}
              onSelectionChange={onOQuerySelectionChange}
              onExecuteContext={onExecuteOQueryContext}
              onBlur={(event) => {
                if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".saved-query-item")) return;
                onApplyOquery();
              }}
              errorFunctionName={oqueryError.match(/:\s+([A-Za-z_][A-Za-z0-9_]*) requires at least/i)?.[1] ?? ""}
              disabled={oqueryStatus !== "idle"}
            />
          </div>
        </div>
        </>
      ) : <><div className="query-builder-toolbar">
        <div className="query-entity-field">
          <div className="query-entity-label-row">
            <span className="section-kicker">ENTITY</span>
            {selectedContextIndex === null && <button className="field-action field-action-icon query-create-context" type="button" aria-label="Create context" title="Create context" onClick={openContextDialog}>
              <Icon name="plus" size={14} />
            </button>}
          </div>
          <EntityMenu entities={entityOptions} value={definition.entity} disabled={!entityOptions.length} onChange={(selectedEntity) => {
            const contexts = (definition.contexts ?? []).filter((context) =>
              !(context.name === definition.entity && !context.alias?.trim() && !hasApiQueryCondition(context.condition))
              && !(context.name === selectedEntity.name
                && !context.alias?.trim()
                && !hasApiQueryCondition(context.condition)));
            const selectedContext = contextDefinitions.find((context) => context.name === selectedEntity.name);
            if (selectedContext && !contexts.some((context) =>
              selectedContext.id
                ? context.id === selectedContext.id
                : context.name === selectedContext.name)) {
              contexts.push({ ...selectedContext, alias: undefined, condition: null });
            }
            onDefinitionChange({
              entity: selectedEntity.name,
              columns: selectedEntity.fields.map((field) => ({ field: field.name, alias: null })),
              contexts: contexts.length ? contexts : undefined,
              contextCatalog: definition.contextCatalog,
              filters: { logicalOperation: 0, filters: [] },
              sorts: [],
              page: selectedContextIndex === null ? 1 : null,
              pageSize: selectedContextIndex === null ? 50 : null,
            });
          }} />
          {!definition.entity.trim() && <span className="query-entity-warning" id="query-entity-error" role="alert">Select an entity.</span>}
        </div>
        <div className="query-paging-controls">
          <label><span className="section-kicker">PAGE</span>
            <input className="small-input" type="number" min="1" step="1" value={definition.page ?? ""} disabled={(definition.page === null && definition.pageSize === null) || (definition.pageSize !== null && definition.pageSize < 1)} onChange={(event) => {
              const value = event.target.value;
              const page = value ? Number.parseInt(value, 10) : null;
              onDefinitionChange({ ...definition, page: page === null ? null : Math.max(1, page) });
            }} />
          </label>
          <label><span className="section-kicker">PAGE SIZE</span>
            <input className="small-input" type="number" step="1" max="1000" value={definition.pageSize ?? ""} onChange={(event) => onDefinitionChange({ ...definition, pageSize: event.target.value ? Number(event.target.value) : null })} />
          </label>
        </div>
      </div>
      {metadataStatus === "loading" && <p className="query-message">Loading metadata…</p>}
      {metadataStatus === "failed" && <p className="query-message error" role="alert">{metadataError}</p>}
      {(selectedContextIndex === null && contextDefinitions.length > 0)
        || (selectedContextIndex !== null && contextDefinitions.length > 1)
        ? <JoinsBuilder
          definition={relationDefinition}
          contexts={relationContexts}
          metadata={metadataWithContexts}
          operators={filterOperators}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          canAddJoin={relationContexts.length > 0}
          excludeContextId={selectedContextIndex === null ? undefined : contextDefinitions[selectedContextIndex]?.id}
          onDefinitionChange={onRelationDefinitionChange}
        />
        : null}
      {entity && <div className="query-builder-body">
        <ProjectionBuilder
          metadata={metadataWithContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          definition={definition}
          joinedContexts={definition.contexts ?? []}
          entity={entity}
          onDefinitionChange={onDefinitionChange}
          onFieldDragStart={setDraggedProjectionField}
        />
        <FilterBuilder
          metadata={metadataWithContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          operators={filterOperators}
          operatorsStatus={filterOperatorsStatus}
          operatorsError={filterOperatorsError}
          definition={definition}
          joinedContexts={definition.contexts ?? []}
          entity={entity}
          onDefinitionChange={onDefinitionChange}
        />
        <SortBuilder
          metadata={metadataWithContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          definition={definition}
          joinedContexts={definition.contexts ?? []}
          entity={entity}
          onDefinitionChange={onDefinitionChange}
          draggedProjectionField={draggedProjectionField}
        />
      </div>}</>}
    </section>
  );
}
