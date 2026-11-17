import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiQueryContextDefinition, IFieldDefinition, MetadataEntity, QueryDefinition } from "../query-builder-slice";
import FieldBuilder, { FieldBuilderExpressionOptions } from "../field-builder/field-builder";
import Icon from "../../../icon/icon";
import { formatExpression } from "../field-builder/expression-builder";

const QUERY_FIELD_DRAG_TYPE = "application/x-query-field";

type SortBuilderProps = {
  metadata: MetadataEntity[];
  functionDefinitions: FieldBuilderExpressionOptions["functionDefinitions"];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  definition: QueryDefinition;
  joinedContexts: ApiQueryContextDefinition[];
  entity: MetadataEntity;
  onDefinitionChange: (definition: QueryDefinition) => void;
  draggedProjectionField: string | null;
};

function SortDirectionMenu({
  value,
  field,
  onChange,
}: {
  value: string;
  field: string;
  onChange: (direction: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = value === "desc" ? "Descending" : "Ascending";

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const triggerBounds = trigger.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const spaceBelow = window.innerHeight - triggerBounds.bottom;
      const top = spaceBelow < menuHeight + 4 && triggerBounds.top >= menuHeight + 4
        ? triggerBounds.top - menuHeight - 4
        : triggerBounds.bottom + 4;

      setMenuPosition({ top, left: triggerBounds.left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

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
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="sort-direction-select" ref={containerRef}>
      <button
        type="button"
        className="operator-trigger"
        ref={triggerRef}
        aria-label={`Sort direction for ${field}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {label}
      </button>
      {open && (
        createPortal(
          <div
            className="operator-menu"
            ref={menuRef}
            role="listbox"
            aria-label={`Sort direction options for ${field}`}
            style={{
              position: "fixed",
              top: menuPosition?.top ?? 0,
              left: menuPosition?.left ?? 0,
              transform: "none",
              zIndex: 1000,
              visibility: menuPosition ? "visible" : "hidden",
            }}
          >
            {[
              ["asc", "Ascending"],
              ["desc", "Descending"],
            ].map(([direction, directionLabel]) => (
              <button
                type="button"
                className={`operator-option${direction === value ? " operator-option-selected" : ""}`}
                role="option"
                aria-selected={direction === value}
                key={direction}
                onClick={() => {
                  onChange(direction);
                  setOpen(false);
                }}
              >
                {directionLabel}
              </button>
            ))}
          </div>,
          document.body,
        )
      )}
    </div>
  );
}

export default function SortBuilder({ metadata, functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, definition, joinedContexts, entity, onDefinitionChange, draggedProjectionField }: SortBuilderProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [addingSortField, setAddingSortField] = useState(false);
  const addSortButtonRef = useRef<HTMLButtonElement>(null);

  const addSort = (field: string) => {
    const projection = definition.columns.find((column) => column.field === field);
    const sortField = projection?.expression ? projection.alias || field : field;
    if (definition.sorts.some((sort) => sort.field === sortField)) return;
    onDefinitionChange({
      ...definition,
      sorts: [...definition.sorts, { field: sortField, direction: "asc" }],
    });
  };
  const addSortExpression = (expression: IFieldDefinition) => {
    const field = formatExpression(expression);
    if (definition.sorts.some((sort) => sort.field === field)) return;
    onDefinitionChange({
      ...definition,
      sorts: [...definition.sorts, { field, expression, direction: "asc" }],
    });
  };

  const updateSort = (field: string, direction: string) => {
    onDefinitionChange({
      ...definition,
      sorts: definition.sorts.map((sort) => sort.field === field ? { ...sort, direction } : sort),
    });
  };

  const replaceSort = (field: string, replacement: string) => {
    if (definition.sorts.some((sort) => sort.field === replacement)) return;
    onDefinitionChange({
      ...definition,
      sorts: definition.sorts.map((sort) => sort.field === field
        ? { field: replacement, direction: sort.direction }
        : sort),
    });
  };

  const removeSort = (field: string) => {
    onDefinitionChange({
      ...definition,
      sorts: definition.sorts.filter((sort) => sort.field !== field),
    });
  };

  const clearSorts = () => {
    if (definition.sorts.length) onDefinitionChange({ ...definition, sorts: [] });
  };

  const getProjectField = (event: DragEvent<HTMLElement>) => {
    const field = (
      event.dataTransfer.getData(QUERY_FIELD_DRAG_TYPE)
      || event.dataTransfer.getData("text/plain")
    ).trim();
    return definition.columns.some((column) => column.field === field) ? field : undefined;
  };

  const isProjectFieldDrag = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes(QUERY_FIELD_DRAG_TYPE);

  return (
    <div className="builder-section sorts-section">
      <div className="section-header">
        <div className="section-heading">
          <div className="projection-title-row">
            <span className="section-kicker">SORTS</span>
            <button ref={addSortButtonRef} type="button" className="field-action field-action-icon" aria-label="Add sort" title="Add sort" onClick={() => setAddingSortField(true)}>
              <Icon name="plus" size={14} />
            </button>
            {definition.sorts.length > 0 && (
              <button
                type="button"
                className="field-action field-action-icon"
                aria-label="Clear sorts"
                title="Clear sorts"
                onClick={clearSorts}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <p className="filter-description">Select fields to sort the query results and choose the direction for each field.</p>
        </div>
      </div>
      <div
        className={`sort-list${isDropTarget ? " sort-list-drop-target" : ""}`}
        onDragOver={(event) => {
          if (draggedProjectionField || isProjectFieldDrag(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setIsDropTarget(true);
          }
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsDropTarget(false);
        }}
        onDrop={(event) => {
          const field = draggedProjectionField ?? getProjectField(event);
          if (!field) return;
          event.preventDefault();
          addSort(field);
          setIsDropTarget(false);
        }}
      >
        {definition.sorts.map((sort) => {
          const columnExpression = definition.columns.find((column) =>
            column.alias === sort.field || column.field === sort.field)?.expression;
          const calculationExpression: IFieldDefinition | undefined = sort.expression ?? columnExpression;
          const calculatedProjection = Boolean(calculationExpression);
          return (
          <div className="field-card selected" key={sort.field}>
            <button type="button" className="field-card-remove" onClick={() => removeSort(sort.field)} aria-label={`Remove sort for ${sort.field}`} title={`Remove sort for ${sort.field}`}>
              <Icon name="close" size={12} />
            </button>
            <div className="field-card-details">
              <div className="field-card-primary">
                {editingField === sort.field
                  ? <FieldBuilder
                    entity={entity}
                    metadata={metadata}
                    joinedContexts={joinedContexts}
                    value={calculatedProjection ? "" : sort.field}
                    autoFocus
                    editMode
                    placeholder={calculatedProjection ? sort.field : undefined}
                    ariaLabel="Sort field"
                    allowCalculationSelection
                    initialSection={calculatedProjection ? "calculation" : undefined}
                    expressionBuilder={{
                      functionDefinitions,
                      functionDefinitionsStatus,
                      functionDefinitionsError,
                      joinedContexts,
                      initialExpression: calculationExpression,
                    }}
                    onExpressionApply={(expression) => {
                      onDefinitionChange({
                        ...definition,
                        sorts: definition.sorts.map((item) => item.field === sort.field
                          ? { ...item, expression }
                          : item),
                      });
                      setEditingField(null);
                    }}
                    excludedPaths={definition.sorts.filter((item) => item.field !== sort.field).map((item) => item.field)}
                    onChange={(replacement) => {
                      replaceSort(sort.field, replacement);
                      setEditingField(null);
                    }}
                    onCancel={() => setEditingField(null)}
                  />
                  : <span
                    className="field-name editable"
                    onClick={() => setEditingField(sort.field)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setEditingField(sort.field);
                    }}
                  >{sort.field}</span>}
                <span className="field-alias-separator" aria-hidden="true">|</span>
                <SortDirectionMenu
                  value={sort.direction}
                  field={sort.field}
                  onChange={(direction) => updateSort(sort.field, direction)}
                />
              </div>
            </div>
          </div>
          );
        })}
      </div>
      {addingSortField && <div className="sort-add-picker" aria-hidden="true">
          <FieldBuilder
            entity={entity}
            metadata={metadata}
            joinedContexts={joinedContexts}
            value=""
            autoFocus
            popupAnchor={addSortButtonRef.current}
            placeholder="Select field..."
            ariaLabel="Add sort field"
            allowCalculationSelection
            excludedPaths={definition.sorts.map((sort) => sort.field)}
            expressionBuilder={{ functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, joinedContexts }}
            onChange={(field) => {
              addSort(field);
              setAddingSortField(false);
            }}
            onExpressionApply={(expression) => {
              addSortExpression(expression);
              setAddingSortField(false);
            }}
            onCancel={() => setAddingSortField(false)}
          />
      </div>}
    </div>
  );
}
