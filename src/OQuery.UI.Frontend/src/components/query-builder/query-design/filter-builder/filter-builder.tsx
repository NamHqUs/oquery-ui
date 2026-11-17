import type { CSSProperties, DragEvent } from "react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../../icon/icon";
import { ApiQueryContextDefinition, FilterOperatorDefinition, IFieldDefinition, MetadataEntity, QueryDefinition, QueryFilterGroup, QueryFilterItem, QueryFilterNode } from "../query-builder-slice";
import FieldBuilder from "../field-builder/field-builder";
import { resolveEntity } from "../field-builder/field-box/field-box";
import { formatExpression } from "../field-builder/expression-builder";
import { FunctionDefinition } from "../../../function-definition/types";

const fallbackOperators = [
  [0, "="],
  [1, "<>"],
  [2, "LIKE"],
  [3, "NOT LIKE"],
  [4, ">"],
  [5, "<"],
  [6, ">="],
  [7, "<="],
  [8, "BETWEEN"],
  [9, "NOT BETWEEN"],
  [10, "IN"],
  [11, "NOT IN"],
  [12, "IS NULL"],
  [13, "IS NOT NULL"],
] as const;
const builtinOperatorOrder = [0, 1, 4, 6, 5, 7, 2, 3, 8, 9, 10, 11, 12, 13];
const operatorHints: Record<number, string> = {
  0: "Matches this exact value",
  1: "Does not match this exact value",
  2: "Matches a pattern",
  3: "Does not match a pattern",
  4: "Greater than",
  5: "Less than",
  6: "Greater than or equal to",
  7: "Less than or equal to",
  8: "Within an inclusive range",
  9: "Outside an inclusive range",
  10: "Matches any listed value",
  11: "Matches none of the listed values",
  12: "Has no value",
  13: "Has a value",
};
const allDataTypes = ["string", "number", "datetime", "boolean"];
const fallbackOperatorDataTypes: Record<number, string[]> = {
  0: allDataTypes,
  1: allDataTypes,
  2: ["string"],
  3: ["string"],
  4: ["number", "datetime"],
  5: ["number", "datetime"],
  6: ["number", "datetime"],
  7: ["number", "datetime"],
  8: ["number", "datetime"],
  9: ["number", "datetime"],
  10: allDataTypes,
  11: allDataTypes,
  12: allDataTypes,
  13: allDataTypes,
};
const nullCheckOperations = new Set<number | string>([12, 13]);
const multiValueOperations = new Set<number | string>([8, 9, 10, 11]);
const logicalOperators = [
  [0, "AND"],
  [1, "OR"],
] as const;

type FilterBuilderProps = {
  metadata: MetadataEntity[];
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  operators: FilterOperatorDefinition[];
  operatorsStatus: string;
  operatorsError: string;
  definition: QueryDefinition;
  joinedContexts: ApiQueryContextDefinition[];
  entity: MetadataEntity;
  onDefinitionChange: (definition: QueryDefinition) => void;
};

const isGroup = (filter: QueryFilterNode): filter is QueryFilterGroup => "filters" in filter;

function createFilter(logicalOperator: number): QueryFilterItem {
  return {
    field: "",
    operation: 0,
    value: "",
    parameterized: false,
    logicalOperator,
    enabled: true,
  };
}

function updateGroup(group: QueryFilterGroup, path: FilterPath, update: (group: QueryFilterGroup) => QueryFilterGroup): QueryFilterGroup {
  if (!path.length) return update(group);
  const [index, ...rest] = path;
  const child = group.filters[index];
  if (!child || !isGroup(child)) return group;
  return {
    ...group,
    filters: group.filters.map((filter, filterIndex) => filterIndex === index
      ? updateGroup(child, rest, update)
      : filter),
  };
}

function createGroup(logicalOperation: number): QueryFilterGroup {
  return { logicalOperation, filters: [] };
}

type FilterPath = number[];
type DragPosition = "inside" | "before" | "after";

type DragPreview = {
  path: FilterPath;
  position: DragPosition;
};

const QUERY_FIELD_DRAG_TYPE = "application/x-query-field";

type OperatorOption = readonly [number | string, string];

type OperatorSelectProps = {
  value: number | string;
  onChange: (value: number | string) => void;
  options: readonly OperatorOption[];
  ariaLabel: string;
  className: string;
  groupByMeaning?: boolean;
};

function OperatorSelect({ value, onChange, options, ariaLabel, className, groupByMeaning = false }: OperatorSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 420 });
  const selectedOption = options.find(([optionValue]) => optionValue === value) ?? options[0];
  const renderOptions = (optionList: readonly OperatorOption[]) => optionList.map(([operatorValue, label]) => {
    const hint = typeof operatorValue === "number" ? operatorHints[operatorValue] : undefined;
    return (
      <button
        className={`operator-option${operatorValue === value ? " operator-option-selected" : ""}`}
        type="button"
        role="option"
        aria-selected={operatorValue === value}
        key={operatorValue}
        title={hint}
        onClick={() => {
          onChange(operatorValue);
          setOpen(false);
        }}
      >
        <span className="operator-option-label">{label}</span>
        {hint && <span className="operator-option-hint">{hint}</span>}
      </button>
    );
  });

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node
        && !containerRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)) setOpen(false);
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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;

    const updateMenuPosition = () => {
      if (!triggerRef.current || !menuRef.current) return;
      const bounds = triggerRef.current.getBoundingClientRect();
      const menu = menuRef.current;
      const menuHeight = menu.scrollHeight;
      const menuWidth = menu.getBoundingClientRect().width;
      const spaceBelow = window.innerHeight - bounds.bottom - 8;
      const spaceAbove = bounds.top - 8;
      const openAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      const availableHeight = Math.max(0, openAbove ? spaceAbove : spaceBelow);
      const left = Math.max(4, Math.min(
        bounds.left + (bounds.width - menuWidth) / 2,
        window.innerWidth - menuWidth - 4,
      ));

      setMenuPosition({
        top: openAbove
          ? bounds.top - Math.min(menuHeight, availableHeight) - 4
          : bounds.bottom + 4,
        left,
        maxHeight: availableHeight,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div className={className} ref={containerRef}>
      <button
        ref={triggerRef}
        className="operator-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={selectedOption[1]}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {selectedOption[1]}
      </button>
      {open && (
        createPortal(<div
          ref={menuRef}
          className="operator-menu filter-operator-menu"
          role="listbox"
          aria-label={`${ariaLabel} options`}
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
            transform: "none",
            margin: 0,
          }}
        >
          {groupByMeaning
            ? <>
              {operatorGroups.map(({ label, values }) => {
                const groupedOptions = options.filter(([operatorValue]) =>
                  typeof operatorValue === "number" && values.some((value) => value === operatorValue),
                );
                return groupedOptions.length
                  ? <div className="filter-operator-group" role="group" aria-label={label} key={label}>
                    <span className="filter-operator-group-label">{label}</span>
                    {renderOptions(groupedOptions)}
                  </div>
                  : null;
              })}
              {(() => {
                const customOptions = options.filter(([operatorValue]) => typeof operatorValue === "string");
                return customOptions.length
                  ? <div className="filter-operator-group" role="group" aria-label="Custom operators">
                    <span className="filter-operator-group-label">Custom</span>
                    {renderOptions(customOptions)}
                  </div>
                  : null;
              })()}
            </>
            : renderOptions(options)}
        </div>, document.body)
      )}
    </div>
  );
}

function getDraggedField(event: DragEvent<HTMLElement>): string | undefined {
  const field = event.dataTransfer.getData(QUERY_FIELD_DRAG_TYPE).trim();
  return field || undefined;
}

function getFilterFieldDataType(value: string) {
  const fieldPath = value.replace(/^\[|\]$/g, "");
  const segments = fieldPath.split(".");
  const lastSegment = segments[segments.length - 1] ?? "";
  const aggregateField = fieldPath.match(/^(COUNT\(\)|SUM|MAX|MIN|AVG)\(([^)]*)\)$/i)?.[2]
    ?? lastSegment.match(/^(COUNT\(\)|SUM|MAX|MIN|AVG)\(([^)]*)\)$/i)?.[2];
  if (fieldPath.toUpperCase().startsWith("COUNT()") || aggregateField) return "Number";
  return undefined;
}

function getOperatorOptions(
  operators: FilterOperatorDefinition[],
  fieldDataType: string | undefined,
): OperatorOption[] {
  const supportsFieldDataType = (supportedDataTypes: string[]) =>
    !fieldDataType || supportedDataTypes.some((dataType) =>
      dataType.toLowerCase() === fieldDataType.toLowerCase(),
    );
  const options = operators.length
    ? operators
      .filter((operator) => supportsFieldDataType(operator.supportedDataTypes))
      .map((operator): OperatorOption => {
        const builtinId = operator.isBuiltin && operator.id.startsWith("builtin:")
          ? Number(operator.id.slice("builtin:".length))
          : undefined;
        return [builtinId !== undefined && Number.isInteger(builtinId) ? builtinId : operator.id, operator.symbol];
      })
    : fallbackOperators.filter(([value]) =>
      supportsFieldDataType(fallbackOperatorDataTypes[value] ?? []),
    );

  return options.sort(([leftValue, leftLabel], [rightValue, rightLabel]) => {
    const leftOrder = typeof leftValue === "number" ? builtinOperatorOrder.indexOf(leftValue) : -1;
    const rightOrder = typeof rightValue === "number" ? builtinOperatorOrder.indexOf(rightValue) : -1;
    if (leftOrder >= 0 || rightOrder >= 0) {
      if (leftOrder < 0) return 1;
      if (rightOrder < 0) return -1;
      return leftOrder - rightOrder;
    }
    return leftLabel.localeCompare(rightLabel);
  });
}

const operatorGroups = [
  { label: "Symbols", values: [0, 1, 4, 6, 5, 7] },
  { label: "Words", values: [2, 3, 8, 9, 10, 11, 12, 13] },
] as const;

function getDropPosition(event: DragEvent<HTMLElement>): DragPosition {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
}

function startFilterDrag(event: DragEvent<HTMLElement>, path: FilterPath, nodeType: "filter" | "group") {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-filter-path", JSON.stringify(path));
  event.dataTransfer.setData("application/x-filter-node-type", nodeType);
}

function isGroupDrag(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.getData("application/x-filter-node-type") === "group";
}

function isPathPrefix(prefix: FilterPath, path: FilterPath): boolean {
  return prefix.length < path.length && prefix.every((index, pathIndex) => index === path[pathIndex]);
}

function isSamePath(first: FilterPath, second: FilterPath): boolean {
  return first.length === second.length && first.every((index, pathIndex) => index === second[pathIndex]);
}

function adjustPathAfterRemoval(sourcePath: FilterPath, targetPath: FilterPath): FilterPath {
  const adjustedPath = [...targetPath];
  const sharedDepth = Math.min(sourcePath.length, targetPath.length);
  for (let depth = 0; depth < sharedDepth; depth++) {
    const sourceIndex = sourcePath[depth];
    const targetIndex = targetPath[depth];
    if (sourceIndex === undefined || targetIndex === undefined) break;
    if (depth > 0 && !sourcePath.slice(0, depth).every((index, pathIndex) => index === targetPath[pathIndex])) return adjustedPath;
    if (sourceIndex < targetIndex) {
      adjustedPath[depth]--;
      return adjustedPath;
    }
    if (sourceIndex > targetIndex) return adjustedPath;
  }
  return adjustedPath;
}

function getNode(group: QueryFilterGroup, path: FilterPath): QueryFilterNode | undefined {
  let node: QueryFilterNode = group;
  for (const index of path) {
    if (!isGroup(node) || !node.filters[index]) return undefined;
    node = node.filters[index];
  }
  return node;
}

function removeNode(group: QueryFilterGroup, path: FilterPath): { group: QueryFilterGroup; node?: QueryFilterNode } {
  if (!path.length) return { group };
  const [index, ...rest] = path;
  if (!rest.length) {
    const node = group.filters[index];
    return {
      group: { ...group, filters: group.filters.filter((_, filterIndex) => filterIndex !== index) },
      node,
    };
  }

  const child = group.filters[index];
  if (!child || !isGroup(child)) return { group };
  const result = removeNode(child, rest);
  return {
    group: {
      ...group,
      filters: group.filters.map((filter, filterIndex) => filterIndex === index ? result.group : filter),
    },
    node: result.node,
  };
}

function appendToGroup(group: QueryFilterGroup, path: FilterPath, node: QueryFilterNode): QueryFilterGroup {
  if (!path.length) return { ...group, filters: [...group.filters, node] };
  const [index, ...rest] = path;
  const child = group.filters[index];
  if (!child || !isGroup(child)) return group;
  return {
    ...group,
    filters: group.filters.map((filter, filterIndex) => filterIndex === index
      ? appendToGroup(child, rest, node)
      : filter),
  };
}

function replaceNode(group: QueryFilterGroup, path: FilterPath, node: QueryFilterNode): QueryFilterGroup {
  if (!path.length) return group;
  const [index, ...rest] = path;
  if (!rest.length) {
    return {
      ...group,
      filters: group.filters.map((filter, filterIndex) => filterIndex === index ? node : filter),
    };
  }
  const child = group.filters[index];
  if (!child || !isGroup(child)) return group;
  return {
    ...group,
    filters: group.filters.map((filter, filterIndex) => filterIndex === index
      ? replaceNode(child, rest, node)
      : filter),
  };
}

type FilterGroupEditorProps = {
  group: QueryFilterGroup;
  metadata: MetadataEntity[];
  joinedContexts: ApiQueryContextDefinition[];
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  operators: FilterOperatorDefinition[];
  entity: MetadataEntity;
  onChange: (group: QueryFilterGroup) => void;
  onRemove?: () => void;
  onMoveFilter: (sourcePath: FilterPath, targetPath: FilterPath, position?: DragPosition) => void;
  onDragPreview: (path: FilterPath, position: DragPosition) => void;
  onDragPreviewClear: () => void;
  dragPreview?: DragPreview;
  onGroupFilter: (path: FilterPath) => void;
  onAddFilter: (path: FilterPath) => void;
  onAddField: (path: FilterPath, field: string, position?: DragPosition) => void;
  onUngroupFilter: (path: FilterPath) => void;
  path: FilterPath;
  showLogicalOperator: boolean;
  depth: number;
};

function FilterGroupEditor({ group, metadata, joinedContexts, functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, operators, entity, onChange, onRemove, onMoveFilter, onDragPreview, onDragPreviewClear, dragPreview, onGroupFilter, onAddFilter, onAddField, onUngroupFilter, path, showLogicalOperator, depth }: FilterGroupEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!collapsed || !noteRef.current) return;
    noteRef.current.style.height = "auto";
    noteRef.current.style.height = `${noteRef.current.scrollHeight}px`;
  }, [collapsed, group.note]);

  const updateNode = (index: number, node: QueryFilterNode) => {
    const filters = group.filters.map((filter, filterIndex) => filterIndex === index ? node : filter);
    onChange({ ...group, filters });
  };

  const removeNode = (index: number) => {
    onChange({ ...group, filters: group.filters.filter((_, filterIndex) => filterIndex !== index) });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, position: DragPosition = "inside", targetPath = path) => {
    event.preventDefault();
    event.stopPropagation();
    onDragPreviewClear();
    const field = getDraggedField(event);
    if (field) {
      onAddField(targetPath, field, position);
      return;
    }
    const serializedPath = event.dataTransfer.getData("application/x-filter-path");
    if (!serializedPath) return;
    try {
      const sourcePath = JSON.parse(serializedPath) as unknown;
      if (Array.isArray(sourcePath) && sourcePath.every((index) => Number.isInteger(index))) {
        onMoveFilter(sourcePath, targetPath, position);
      }
    } catch {
      // Ignore malformed drag payloads from outside this builder.
    }
  };
  const isPreview = (position: DragPosition) => dragPreview?.position === position && isSamePath(dragPreview.path, path);

  return (
    <div
      className={`filter-group filter-group-depth-${Math.min(depth, 3)}${collapsed ? " filter-group-collapsed" : ""}${isPreview("inside") ? " filter-drop-preview-inside" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={() => onDragPreview(path, "inside")}
      onDrop={handleDrop}
    >
      {depth > 0 && (
        <span
          className="filter-group-drag-handle"
          draggable
          aria-hidden="true"
          onDragStart={(event) => startFilterDrag(event, path, "group")}
          onDragEnd={onDragPreviewClear}
        />
      )}
      {depth > 0 && (
        <div
          className={`filter-group-edge-drop filter-group-edge-drop-before${isPreview("before") ? " filter-drop-preview" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDragPreview(path, isGroupDrag(event) ? "inside" : "before");
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDragPreview(path, isGroupDrag(event) ? "inside" : "before");
          }}
          onDrop={(event) => handleDrop(event, isGroupDrag(event) ? "inside" : "before")}
        />
      )}
      {depth === 0 && (
        <div
          className={`filter-drop-zone filter-drop-zone-before filter-drop-zone-first${isPreview("before") ? " filter-drop-preview" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            onDragPreview(path, "before");
          }}
          onDrop={(event) => handleDrop(event, "before")}
        />
      )}
      <div
        className={`filter-group-header${isPreview("inside") ? " filter-drop-preview-inside" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          onDragPreview(path, "inside");
        }}
        onDrop={(event) => handleDrop(event, "inside")}
      >
        {collapsed && (
          <textarea
            ref={noteRef}
            className="filter-group-note"
            aria-label="Filter group note"
            placeholder="Add a note..."
            rows={1}
            value={group.note ?? ""}
            onChange={(event) => onChange({ ...group, note: event.target.value })}
          />
        )}
        {depth > 0 && showLogicalOperator && (
          <label className="filter-group-logic">
            <OperatorSelect
              value={group.logicalOperation}
              onChange={(logicalOperation) => onChange({ ...group, logicalOperation })}
              options={logicalOperators}
              ariaLabel="Group logical operator"
              className="group-logical-operator-select"
            />
          </label>
        )}
        {(depth > 0 || onRemove) && (
          <div className="filter-group-actions">
            {onRemove && (
              <>
                <button className="icon-button filter-group-action" type="button" aria-label="Ungroup filters" title="Ungroup filters" onClick={() => onUngroupFilter(path)}><Icon name="ungroup" size={13} /></button>
                <button className="icon-button filter-group-action" type="button" aria-label="Remove filter group" title="Remove filter group" onClick={onRemove}><Icon name="trash" size={13} /></button>
              </>
            )}
            {depth > 0 && (
              <button
                className="icon-button filter-group-collapse"
                type="button"
                aria-label={collapsed ? "Expand filter group" : "Collapse filter group"}
                aria-expanded={!collapsed}
                title={collapsed ? "Expand filter group" : "Collapse filter group"}
                onClick={() => setCollapsed((value) => !value)}
              >
                <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {group.filters.map((filter, index) => isGroup(filter) ? (
        <Fragment key={`group-${index}`}>
          <div
            className={`filter-drop-zone filter-drop-zone-before${isSamePath(dragPreview?.path ?? [], [...path, index]) && dragPreview?.position === "before" ? " filter-drop-preview" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              onDragPreview([...path, index], isGroupDrag(event) ? "inside" : "before");
            }}
            onDrop={(event) => handleDrop(event, isGroupDrag(event) ? "inside" : "before", [...path, index])}
          />
          <FilterGroupEditor
            group={filter}
            metadata={metadata}
            joinedContexts={joinedContexts}
            functionDefinitions={functionDefinitions}
            functionDefinitionsStatus={functionDefinitionsStatus}
            functionDefinitionsError={functionDefinitionsError}
            operators={operators}
            entity={entity}
            depth={depth + 1}
            path={[...path, index]}
            onMoveFilter={onMoveFilter}
            onDragPreview={onDragPreview}
            onDragPreviewClear={onDragPreviewClear}
            dragPreview={dragPreview}
            onGroupFilter={onGroupFilter}
            onAddFilter={onAddFilter}
            onAddField={onAddField}
            onUngroupFilter={onUngroupFilter}
            showLogicalOperator={index !== 0}
            onChange={(nested) => updateNode(index, nested)}
            onRemove={() => removeNode(index)}
          />
          <div
            className={`filter-drop-zone filter-drop-zone-after${isSamePath(dragPreview?.path ?? [], [...path, index]) && dragPreview?.position === "after" ? " filter-drop-preview" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              onDragPreview([...path, index], "after");
            }}
            onDrop={(event) => handleDrop(event, "after", [...path, index])}
          />
        </Fragment>
          ) : (
        <FilterRow
          key={`filter-${index}`}
          filter={filter}
          first={index === 0}
          path={[...path, index]}
          metadata={metadata}
          joinedContexts={joinedContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          operators={operators}
          entity={entity}
          onChange={(next) => updateNode(index, next)}
          onRemove={() => removeNode(index)}
          onGroup={() => onGroupFilter([...path, index])}
          onAdd={() => onAddFilter([...path, index])}
          onAddField={(field, position) => onAddField([...path, index], field, position)}
          onMove={(sourcePath, position) => onMoveFilter(sourcePath, [...path, index], position)}
          onDragPreview={onDragPreview}
          onDragPreviewClear={onDragPreviewClear}
          dragPreview={dragPreview}
        />
          ))}
        </>
      )}
      {depth === 0 && <div
        className={`filter-drop-zone filter-drop-zone-last${isPreview("after") ? " filter-drop-preview" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          onDragPreview(path, "after");
        }}
        onDrop={(event) => handleDrop(event, "after")}
      />}
      {depth > 0 && (
        <div
          className={`filter-group-edge-drop filter-group-edge-drop-after${isPreview("after") ? " filter-drop-preview" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDragPreview(path, "after");
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDragPreview(path, "after");
          }}
          onDrop={(event) => handleDrop(event, "after")}
        />
      )}
    </div>
  );
}

type FilterRowProps = {
  filter: QueryFilterItem;
  first: boolean;
  path: FilterPath;
  metadata: MetadataEntity[];
  joinedContexts: ApiQueryContextDefinition[];
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  operators: FilterOperatorDefinition[];
  entity: MetadataEntity;
  onChange: (filter: QueryFilterItem) => void;
  onRemove: () => void;
  onGroup: () => void;
  onAdd: () => void;
  onAddField: (field: string, position: DragPosition) => void;
  onMove: (sourcePath: FilterPath, position: DragPosition) => void;
  onDragPreview: (path: FilterPath, position: DragPosition) => void;
  onDragPreviewClear: () => void;
  dragPreview?: DragPreview;
};

function FilterRow({ filter, first, path, metadata, joinedContexts, functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, operators, entity, onChange, onRemove, onGroup, onAdd, onAddField, onMove, onDragPreview, onDragPreviewClear, dragPreview }: FilterRowProps) {
  const update = (changes: Partial<QueryFilterItem>) => onChange({ ...filter, ...changes });
  const fieldDataType = filter.fieldExpression?.kind === "group"
    ? "Number"
    : getFilterFieldDataType(filter.field);
  const operatorOptions = getOperatorOptions(operators, fieldDataType);
  const initialExpression: IFieldDefinition | undefined = filter.fieldExpression
    ?? (filter.field ? { kind: "field", field: filter.field } : undefined);
  const isPreview = (position: DragPosition) => dragPreview?.position === position && isSamePath(dragPreview.path, path);
  const previewPosition = useRef<DragPosition>();
  const updatePreview = (event: DragEvent<HTMLDivElement>) => {
    const position = getDropPosition(event);
    previewPosition.current = position;
    onDragPreview(path, position);
  };

  return (
    <div
      className={`filter-row${first ? " filter-row-first" : ""}${filter.enabled ? "" : " filter-row-disabled"}${isPreview("before") ? " filter-drop-preview-before" : ""}${isPreview("after") ? " filter-drop-preview-after" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        updatePreview(event);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        updatePreview(event);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const field = getDraggedField(event);
        if (field) {
          const position = previewPosition.current ?? getDropPosition(event);
          onDragPreviewClear();
          previewPosition.current = undefined;
          onAddField(field, position);
          return;
        }
        const serializedPath = event.dataTransfer.getData("application/x-filter-path");
        if (!serializedPath) return;
        try {
          const sourcePath = JSON.parse(serializedPath) as unknown;
          if (Array.isArray(sourcePath) && sourcePath.every((index) => Number.isInteger(index))) {
            const position = previewPosition.current ?? getDropPosition(event);
            onDragPreviewClear();
            previewPosition.current = undefined;
            onMove(sourcePath, position);
          }
        } catch {
          // Ignore malformed drag payloads from outside this builder.
        }
      }}
    >
      {first ? (
        <div className="logical-operator-spacer" aria-hidden="true" />
      ) : (
        <OperatorSelect
          value={filter.logicalOperator}
          onChange={(logicalOperator) => update({ logicalOperator })}
          options={logicalOperators}
          ariaLabel="Logical operator before condition"
          className="logical-operator-select"
        />
      )}
      <div className="filter-field-drag-target">
        <span
          className="filter-field-drag-handle"
          draggable
          aria-hidden="true"
          onDragStart={(event) => startFilterDrag(event, path, "filter")}
          onDragEnd={() => {
            previewPosition.current = undefined;
            onDragPreviewClear();
          }}
        />
        <FieldBuilder
          entity={entity}
          metadata={metadata}
          joinedContexts={joinedContexts}
          value={filter.field}
          showPath
          ariaLabel="Filter field"
          allowValueSelection
          allowCalculationSelection
          initialSection={filter.fieldExpression && filter.fieldExpression.kind !== "value" ? "calculation" : undefined}
          expressionBuilder={{
            functionDefinitions,
            functionDefinitionsStatus,
            functionDefinitionsError,
            joinedContexts,
            initialExpression,
          }}
          onExpressionApply={(expression) => {
            update({ field: formatExpression(expression), fieldExpression: expression });
          }}
          initialConstantValue={filter.fieldExpression?.kind === "value"
            && (typeof filter.fieldExpression.value === "string" || typeof filter.fieldExpression.value === "number")
            ? filter.fieldExpression.value
            : undefined}
          onValueSelect={(value) => update({ field: `<${value}>`, fieldExpression: { kind: "value", value } })}
          onChange={(field) => {
            const dataType = getFilterFieldDataType(field);
            const options = getOperatorOptions(operators, dataType);
            update({
              field,
              fieldExpression: undefined,
              ...(options.some(([value]) => value === filter.operation)
                ? {}
                : { operation: options[0]?.[0] ?? 0 }),
            });
          }}
          onRemove={() => update({ field: "" })}
        />
      </div>
      <OperatorSelect
        value={filter.operation}
        onChange={(operation) => update({ operation })}
        options={operatorOptions}
        ariaLabel="Filter operation"
        className="filter-operator-select"
        groupByMeaning
      />
      <input
        value={nullCheckOperations.has(filter.operation) ? "" : filter.rightField ? `[${filter.rightField}]` : filter.value}
        placeholder={nullCheckOperations.has(filter.operation)
          ? "No value needed"
          : filter.operation === 8 || filter.operation === 9
            ? "Lower, upper"
            : multiValueOperations.has(filter.operation) ? "Comma-separated values" : "<NULL>"}
        disabled={nullCheckOperations.has(filter.operation)}
        aria-label="Filter value"
        onChange={(event) => update({ value: event.target.value, rightField: undefined })}
      />
      <div className="filter-row-actions">
        <button
          className="filter-toggle"
          type="button"
          aria-label={filter.enabled ? "Disable filter" : "Enable filter"}
          aria-pressed={filter.enabled}
          title={filter.enabled ? "Disable filter" : "Enable filter"}
          onClick={() => update({ enabled: !filter.enabled })}
        >
          {filter.enabled ? "ON" : "OFF"}
        </button>
        <button className="icon-button filter-action" type="button" aria-label="Add filter after this condition" title="Add filter after this condition" onClick={onAdd}><Icon name="plus" size={13} /></button>
        <button className="icon-button filter-action" type="button" aria-label="Create filter group" title="Create filter group" onClick={onGroup}>        <Icon name="group" size={13} /></button>
        <button className="icon-button" type="button" aria-label="Remove filter" onClick={onRemove}><Icon name="trash" size={13} /></button>
      </div>
    </div>
  );
}

export default function FilterBuilder({ metadata, functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, operators, operatorsStatus, operatorsError, definition, joinedContexts, entity, onDefinitionChange }: FilterBuilderProps) {
  const builderRef = useRef<HTMLDivElement>(null);
  const [filterItemWidth, setFilterItemWidth] = useState<number>();
  const [dragPreview, setDragPreview] = useState<DragPreview>();

  useLayoutEffect(() => {
    const rows = builderRef.current?.querySelectorAll<HTMLElement>(".filter-row");
    if (!rows?.length) {
      setFilterItemWidth(undefined);
      return;
    }

    let maxValueOffset = 0;
    rows.forEach((row) => {
      const valueInput = row.querySelector<HTMLInputElement>("input");
      if (!valueInput) return;
      maxValueOffset = Math.max(maxValueOffset, valueInput.getBoundingClientRect().right - row.getBoundingClientRect().left);
    });
    setFilterItemWidth(maxValueOffset ? Math.max(maxValueOffset - 40, 0) : undefined);
  }, [definition]);

  const moveFilter = (sourcePath: FilterPath, targetPath: FilterPath, position: "inside" | "before" | "after" = "inside") => {
    const source = getNode(definition.filters, sourcePath);
    if (!source || isPathPrefix(sourcePath, targetPath) || isSamePath(sourcePath, targetPath)) return;
    const removed = removeNode(definition.filters, sourcePath);
    if (!removed.node) return;
    if (position === "after" && !targetPath.length) {
      onDefinitionChange({
        ...definition,
        filters: {
          ...removed.group,
          filters: [...removed.group.filters, removed.node],
        },
      });
      return;
    }
    if (position === "after") {
      const adjustedTargetPath = adjustPathAfterRemoval(sourcePath, targetPath);
      const parentPath = adjustedTargetPath.slice(0, -1);
      const targetIndex = adjustedTargetPath[adjustedTargetPath.length - 1];
      if (targetIndex === undefined) return;
      const sourceParentPath = sourcePath.slice(0, -1);
      const sameParent = sourceParentPath.length === parentPath.length
        && sourceParentPath.every((index, pathIndex) => index === parentPath[pathIndex]);
      const sourceIndex = sourcePath[sourcePath.length - 1];
      const insertIndex = sameParent && sourceIndex < targetIndex ? targetIndex : targetIndex + 1;
      onDefinitionChange({
        ...definition,
        filters: updateGroup(removed.group, parentPath, (parent) => ({
          ...parent,
          filters: [
            ...parent.filters.slice(0, insertIndex),
            removed.node!,
            ...parent.filters.slice(insertIndex),
          ],
        })),
      });
      return;
    }
    if (position === "before") {
      if (!targetPath.length) {
        onDefinitionChange({
          ...definition,
          filters: {
            ...removed.group,
            filters: [removed.node, ...removed.group.filters],
          },
        });
        return;
      }
      const parentPath = targetPath.slice(0, -1);
      const targetIndex = targetPath[targetPath.length - 1];
      if (targetIndex === undefined) return;
      const sourceParentPath = sourcePath.slice(0, -1);
      const sameParent = sourceParentPath.length === parentPath.length
        && sourceParentPath.every((index, pathIndex) => index === parentPath[pathIndex]);
      const sourceIndex = sourcePath[sourcePath.length - 1];
      const movingDown = sameParent && sourceIndex < targetIndex;
      const adjustedTargetIndex = movingDown ? targetIndex - 1 : targetIndex;
      const adjustedTargetPath = movingDown
        ? [...targetPath.slice(0, -1), targetIndex - 1]
        : targetPath;
      const target = getNode(removed.group, adjustedTargetPath);
      if (!target || !targetPath.length) return;
      onDefinitionChange({
        ...definition,
        filters: updateGroup(removed.group, parentPath, (parent) => ({
          ...parent,
          filters: [
            ...parent.filters.slice(0, adjustedTargetIndex),
            removed.node!,
            ...parent.filters.slice(adjustedTargetIndex),
          ],
        })),
      });
      return;
    }
    if (!targetPath.length) {
      onDefinitionChange({
        ...definition,
        filters: {
          ...removed.group,
          filters: [removed.node, ...removed.group.filters],
        },
      });
      return;
    }
    const adjustedTargetPath = adjustPathAfterRemoval(sourcePath, targetPath);
    onDefinitionChange({ ...definition, filters: appendToGroup(removed.group, adjustedTargetPath, removed.node) });
  };

  const groupFilter = (path: FilterPath) => {
    const filter = getNode(definition.filters, path);
    if (!filter || isGroup(filter)) return;
    const groupedFilter: QueryFilterGroup = {
      ...createGroup(filter.logicalOperator),
      filters: [{ ...filter, logicalOperator: 0 }],
    };
    onDefinitionChange({ ...definition, filters: replaceNode(definition.filters, path, groupedFilter) });
  };

  const addFilterAfter = (path: FilterPath) => {
    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];
    const parent = getNode(definition.filters, parentPath);
    if (!parent || !isGroup(parent)) return;
    const filters = [...parent.filters];
    filters.splice(index + 1, 0, createFilter(parent.filters.length ? parent.logicalOperation : 0));
    const updatedParent = { ...parent, filters };
    const replaceParent = (group: QueryFilterGroup, currentPath: FilterPath): QueryFilterGroup => {
      if (!currentPath.length) return updatedParent;
      const [currentIndex, ...rest] = currentPath;
      const child = group.filters[currentIndex];
      if (!child || !isGroup(child)) return group;
      return { ...group, filters: group.filters.map((node, nodeIndex) => nodeIndex === currentIndex ? replaceParent(child, rest) : node) };
    };
    onDefinitionChange({ ...definition, filters: replaceParent(definition.filters, parentPath) });
  };

  const addFilterField = (targetPath: FilterPath, field: string, position: DragPosition = "inside") => {
    const createFieldFilter = (logicalOperator: number) => ({ ...createFilter(logicalOperator), field });
    if (position === "inside") {
      const target = getNode(definition.filters, targetPath);
      if (!target || !isGroup(target)) return;
      onDefinitionChange({
        ...definition,
        filters: updateGroup(definition.filters, targetPath, (group) => ({
          ...group,
          filters: [...group.filters, createFieldFilter(group.filters.length ? group.logicalOperation : 0)],
        })),
      });
      return;
    }

    if (!targetPath.length) {
      onDefinitionChange({
        ...definition,
        filters: {
          ...definition.filters,
          filters: position === "before"
            ? [createFieldFilter(0), ...definition.filters.filters]
            : [...definition.filters.filters, createFieldFilter(definition.filters.filters.length ? definition.filters.logicalOperation : 0)],
        },
      });
      return;
    }

    const parentPath = targetPath.slice(0, -1);
    const targetIndex = targetPath[targetPath.length - 1];
    const parent = getNode(definition.filters, parentPath);
    if (!parent || !isGroup(parent)) return;
    if (targetIndex === undefined) return;
    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    const filters = [...parent.filters];
    filters.splice(insertIndex, 0, createFieldFilter(parent.filters.length ? parent.logicalOperation : 0));
    onDefinitionChange({
      ...definition,
      filters: updateGroup(definition.filters, parentPath, (group) => ({ ...group, filters })),
    });
  };

  const ungroupFilter = (path: FilterPath) => {
    const nested = getNode(definition.filters, path);
    if (!nested || !isGroup(nested) || !path.length) return;
    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];
    onDefinitionChange({
      ...definition,
      filters: updateGroup(definition.filters, parentPath, (parent) => ({
        ...parent,
        filters: [
          ...parent.filters.slice(0, index),
          ...nested.filters,
          ...parent.filters.slice(index + 1),
        ],
      })),
    });
  };

  const clearFilters = () => {
    if (definition.filters.filters.length) {
      onDefinitionChange({
        ...definition,
        filters: { logicalOperation: 0, filters: [] },
      });
    }
  };
  const addRootFilter = () => {
    const filters = definition.filters.filters;
    onDefinitionChange({
      ...definition,
      filters: {
        ...definition.filters,
        filters: [...filters, createFilter(filters.length ? definition.filters.logicalOperation : 0)],
      },
    });
  };

  return (
    <div
      ref={builderRef}
      className="builder-section filters-section"
      style={filterItemWidth ? { "--filter-item-width": `${filterItemWidth}px` } as CSSProperties : undefined}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setDragPreview(undefined);
        }
      }}
    >
      <div className="section-header">
        <div className="section-heading">
          <div className="projection-title-row">
            <span className="section-kicker">FILTERS</span>
            <button className="field-action field-action-icon" type="button" aria-label="Add condition" title="Add condition" onClick={addRootFilter}>
              <Icon name="plus" size={14} />
            </button>
            {definition.filters.filters.length > 0 && (
              <button
                type="button"
                className="field-action field-action-icon"
                aria-label="Clear filters"
                title="Clear filters"
                onClick={clearFilters}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <p className="filter-description">Drag a selected field here to create a filter.</p>
        </div>
      </div>
      {operatorsStatus === "loading" && <p className="filter-description">Loading filter operators…</p>}
      {operatorsStatus === "failed" && <p className="filter-description error" role="alert">{operatorsError}</p>}
      <FilterGroupEditor
            group={definition.filters}
            metadata={metadata}
            joinedContexts={joinedContexts}
            functionDefinitions={functionDefinitions}
            functionDefinitionsStatus={functionDefinitionsStatus}
            functionDefinitionsError={functionDefinitionsError}
            operators={operators.length ? operators : []}
            entity={entity}
            depth={0}
            path={[]}
            onMoveFilter={moveFilter}
            onDragPreview={(path, position) => setDragPreview({ path, position })}
            onDragPreviewClear={() => setDragPreview(undefined)}
            dragPreview={dragPreview}
            onGroupFilter={groupFilter}
            onAddFilter={addFilterAfter}
            onAddField={addFilterField}
            onUngroupFilter={ungroupFilter}
            showLogicalOperator={false}
            onChange={(filters) => onDefinitionChange({ ...definition, filters })}
          />
    </div>
  );
}
