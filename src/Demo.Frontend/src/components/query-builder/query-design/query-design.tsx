import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiQueryContextDefinition, FilterOperatorDefinition, hasApiQueryCondition, MetadataEntity, QueryDefinition } from "./query-builder-slice";
import { FunctionDefinition } from "../../function-definition/types";
import Icon from "../../icon/icon";
import ProjectionBuilder from "./projection-builder/projection-builder";
import SortBuilder from "./sort-builder/sort-builder";
import FilterBuilder from "./filter-builder/filter-builder";
import JoinsBuilder from "./joins-builder/joins-builder";
import "./query-design.css";

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
};

export default function QueryDesign({
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
}: QueryDesignProps) {
  const [draggedProjectionField, setDraggedProjectionField] = useState<string | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
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

  return (
    <section className="query-builder-card">
      {contextDefinitions.length > 0 && <nav className="query-context-bar" aria-label="Query contexts">
        <button
          type="button"
          className={`query-context-tab${selectedContextIndex === null ? " selected" : ""}`}
          aria-pressed={selectedContextIndex === null}
          onClick={() => onSelectContext(null)}
        >
          <Icon name="query" size={14} /> Main Query
        </button>
        {contextDefinitions.map((context, index) => {
          const contextError = context.query.entity.trim() ? null : "Select an entity.";
          return <div className="query-context-tab-wrap" key={`${context.id ?? context.name}-${index}`}>
            <button
              type="button"
              className={`query-context-tab${selectedContextIndex === index ? " selected" : ""}`}
              aria-pressed={selectedContextIndex === index}
              aria-label={contextError ? `${context.name}: ${contextError}` : undefined}
              title={contextError ? `${context.name}: ${contextError}` : undefined}
              onClick={() => onSelectContext(index)}
            >
              <Icon name="table" size={14} /> {context.name}
              {contextError && <span className="query-context-error-indicator" aria-hidden="true">!</span>}
            </button>
            <button type="button" className="query-context-delete" aria-label={`Delete ${context.name} context`} title={`Delete ${context.name} context`} onClick={() => onDeleteContext(index)}>
              <Icon name="close" size={12} />
            </button>
          </div>;
        })}
      </nav>}
      <div className="query-name-row">
        <div className="query-name-field">
          <div className="query-name-label-row">
            <span className="section-kicker">{selectedContextIndex === null ? "QUERY NAME" : "CONTEXT NAME"}</span>
          </div>
          <input
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
      <div className="query-builder-toolbar">
        <div className="query-entity-field">
          <div className="query-entity-label-row">
            <span className="section-kicker">ENTITY</span>
            {selectedContextIndex === null && <button className="field-action field-action-icon query-create-context" type="button" aria-label="Create context" title="Create context" onClick={() => {
              setContextDialogOpen(true);
              setContextNameError("");
            }}>
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
      </div>}
    </section>
  );
}
