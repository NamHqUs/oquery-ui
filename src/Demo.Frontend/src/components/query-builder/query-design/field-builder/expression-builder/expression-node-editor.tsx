import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type {
  ApiQueryContextDefinition,
  IFieldDefinition,
  MatchOperation,
  MetadataEntity,
} from "../../query-builder-slice";
import FieldBuilder from "../field-builder";
import ExpressionDebugTooltip from "../expression-debug-tooltip/expression-debug-tooltip";
import ExpressionAddNextItem from "./expression-add-next-item";
import Icon from "../../../../icon/icon";
import type { FunctionDefinition } from "../../../../function-definition/types";
import FunctionBuilder from "../function-builder/function-builder";
import {
  getGroupArgumentOperator,
  isSameExpressionPath,
  mathOperatorLabels,
  mathOperators,
  removeExpressionNode,
  withOperation,
  type ExpressionPath,
} from "./expression-model";
import type { IconName } from "../../../../icon/icon";

const mathOperatorIcons: Record<MatchOperation, IconName> = {
  "+": "plus",
  "-": "minus",
  "*": "multiply",
  "/": "divide",
  "%": "modulo",
  "&": "logical-and",
  "|": "logical-or",
};

type NodeEditorProps = {
  expression: IFieldDefinition;
  entity: MetadataEntity;
  metadata: MetadataEntity[];
  joinedContexts?: ApiQueryContextDefinition[];
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  fieldPlaceholder?: string;
  fieldDataType?: string;
  onChange: (expression: IFieldDefinition) => void;
  onCalculationSelect?: () => void;
  onRemove?: () => void;
  debugOperator?: MatchOperation | null;
  path?: ExpressionPath;
  onPointerDragStart?: (event: ReactPointerEvent<HTMLDivElement>, path: ExpressionPath) => void;
  dragPreview?: ExpressionPath;
  dragPosition?: "before" | "inside" | "after";
  root?: boolean;
  suppressOperator?: boolean;
  selectionPath?: ExpressionPath;
  selectedPath?: ExpressionPath;
  onSelect?: (path: ExpressionPath) => void;
  onUngroup?: (path: ExpressionPath) => void;
  canUngroup?: boolean;
};

type ExpressionMathElementProps = Omit<NodeEditorProps, "expression" | "root" | "debugOperator"> & {
  expression: IFieldDefinition;
  operator?: MatchOperation | null;
};

function MathOperatorSelect({
  value,
  onChange,
}: {
  value: MatchOperation;
  onChange: (operator: MatchOperation) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target))
        setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [isOpen]);

  return (
    <div
      className="expression-math-operator-select"
      ref={containerRef}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="expression-math-operator-trigger"
        aria-label={`Expression operator: ${mathOperatorLabels[value]}`}
        title={mathOperatorLabels[value]}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Icon name={mathOperatorIcons[value]} size={16} />
      </button>
      {isOpen && (
        <div className="expression-math-operator-menu operator-menu" role="listbox" aria-label="Expression operators">
          {mathOperators.map((operator) => (
            <button
              key={operator}
              type="button"
              className={`operator-option${operator === value ? " operator-option-selected" : ""}`}
              role="option"
              aria-label={mathOperatorLabels[operator]}
              title={mathOperatorLabels[operator]}
              aria-selected={operator === value}
              onClick={() => {
                onChange(operator);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <Icon name={mathOperatorIcons[operator]} size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpressionMathElement({
  expression,
  operator,
  entity,
  metadata,
  joinedContexts,
  functionDefinitions,
  functionDefinitionsStatus,
  functionDefinitionsError,
  fieldPlaceholder,
  fieldDataType,
  onChange,
  onCalculationSelect,
  onRemove,
  path,
  onPointerDragStart,
  dragPreview,
  dragPosition,
  selectionPath,
  selectedPath,
  onSelect,
  onUngroup,
  canUngroup,
}: ExpressionMathElementProps) {
  const actualOperator = operator === undefined ? expression.oper ?? null : operator;
  const updateOperator = (nextOperator: MatchOperation) =>
    onChange(withOperation(expression, nextOperator));
  const updateOperand = (next: IFieldDefinition) => onChange({ ...next, oper: expression.oper });

  return (
    <div className={`expression-math-element${expression.kind === "group" && actualOperator ? " expression-math-element-group-operand" : ""}`}>
      <div className="expression-math-operation">
        {actualOperator && (
          <MathOperatorSelect
            value={actualOperator}
            onChange={updateOperator}
          />
        )}
      </div>
      <div
        className={`expression-math-field${expression.kind === "group" ? " expression-math-field-group" : " expression-math-field-draggable"}`}
        onPointerDown={path === undefined
          ? undefined
          : (event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const dragEdge = bounds.left + (expression.kind === "group" ? 16 : 0);
            if (event.clientX >= dragEdge && event.clientX <= dragEdge + 8)
              onPointerDragStart?.(event, path);
          }}
      >
        <NodeEditor
          expression={expression}
          entity={entity}
          metadata={metadata}
          joinedContexts={joinedContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          fieldPlaceholder={fieldPlaceholder}
          fieldDataType={fieldDataType}
          onChange={updateOperand}
          onCalculationSelect={onCalculationSelect}
          onRemove={onRemove}
          path={path}
          onPointerDragStart={onPointerDragStart}
          dragPreview={dragPreview}
          dragPosition={dragPosition}
          debugOperator={actualOperator}
          suppressOperator
          selectionPath={selectionPath}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onUngroup={onUngroup}
          canUngroup={canUngroup}
        />
      </div>
    </div>
  );
}

export default function NodeEditor({
  expression,
  entity,
  metadata,
  joinedContexts,
  functionDefinitions,
  functionDefinitionsStatus,
  functionDefinitionsError,
  fieldPlaceholder,
  fieldDataType,
  onChange,
  onCalculationSelect,
  onRemove,
  path,
  onPointerDragStart,
  dragPreview,
  dragPosition,
  debugOperator,
  root = false,
  suppressOperator = false,
  selectionPath,
  selectedPath,
  onSelect,
  onUngroup,
  canUngroup,
}: NodeEditorProps) {
  const isDropPreview = path !== undefined && dragPreview !== undefined && isSameExpressionPath(path, dragPreview);
  const isSelected = selectionPath !== undefined
    && selectedPath !== undefined
    && isSameExpressionPath(selectionPath, selectedPath);
  const startSelectedDrag = (event: ReactPointerEvent<HTMLDivElement>, allowUnselected = false) => {
    if ((!isSelected && !allowUnselected) || !path?.length || !onPointerDragStart) return;
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest("button, input, select, textarea, a, [role='option'], [role='tab'], [contenteditable='true']")) return;
      if (target.closest(".expression-selectable") !== event.currentTarget) return;
    }
    onPointerDragStart(event, path);
  };
  if (!suppressOperator && expression.oper && expression.oper !== "+") {
    return (
      <ExpressionMathElement
        expression={expression}
        operator={expression.oper}
        entity={entity}
        metadata={metadata}
        joinedContexts={joinedContexts}
        functionDefinitions={functionDefinitions}
        functionDefinitionsStatus={functionDefinitionsStatus}
        functionDefinitionsError={functionDefinitionsError}
        onChange={onChange}
        onCalculationSelect={onCalculationSelect}
        onRemove={onRemove}
        path={path}
        onPointerDragStart={onPointerDragStart}
        dragPreview={dragPreview}
        dragPosition={dragPosition}
        selectionPath={selectionPath}
        selectedPath={selectedPath}
        onSelect={onSelect}
        onUngroup={onUngroup}
        canUngroup={canUngroup}
      />
    );
  }
  if (expression.kind === "field") {
    return (
      <div
        className={`expression-field-drop-target expression-item-controls${selectionPath === undefined ? "" : " expression-selectable"}${isSelected ? " expression-selected" : ""}`}
        tabIndex={selectionPath === undefined ? undefined : 0}
        onFocus={(event) => {
          if (
            selectionPath !== undefined
            && (event.target === event.currentTarget
              ? event.currentTarget.matches(":focus-visible")
              : event.target instanceof HTMLElement && event.target.matches(":focus-visible"))
          )
            onSelect?.(selectionPath);
        }}
        onPointerDown={(event) => startSelectedDrag(event, true)}
        data-expression-path={path === undefined ? undefined : JSON.stringify(path)}
      >
        <div className="expression-debug-target expression-debug-field-builder expression-item-controls">
          <div className={`expression-field-box-drop-target${isDropPreview ? " expression-drop-preview" : ""}${isDropPreview && dragPosition ? ` expression-drop-position-${dragPosition}` : ""}`}>
            <FieldBuilder
              entity={entity}
              metadata={metadata}
              joinedContexts={joinedContexts}
              value={expression.field}
              onChange={(field) => onChange({ kind: "field", field })}
              showPath
              ariaLabel="Expression field"
              placeholder={fieldPlaceholder ?? "Select field..."}
              allowValueSelection
              allowFunctionSelection
              initialSection="fields"
              expressionBuilder={{
                functionDefinitions,
                functionDefinitionsStatus,
                functionDefinitionsError,
              }}
              debugModel={expression}
              debugOperator={debugOperator}
              onValueSelect={(value) => onChange({ kind: "value", value })}
              onExpressionApply={onChange}
            />
          </div>
          <div className="expression-actions-bar">
            {onRemove && (
              <button
                type="button"
                className="expression-remove"
                aria-label="Delete"
                title="Delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
              >
                <Icon name="remove" size={13} />
              </button>
            )}
            <ExpressionAddNextItem
              onAddNextItem={onCalculationSelect ?? (() => onChange({
                kind: "group",
                arguments: [
                  expression,
                  { kind: "field", field: "" },
                ],
              }))}
            />
          </div>
          <ExpressionDebugTooltip label="Field builder" model={expression} />
        </div>
      </div>
    );
  }
  if (expression.kind === "group") {
    const groupDebugModel: IFieldDefinition = expression.oper === undefined && debugOperator != null
      ? { ...expression, oper: debugOperator }
      : expression;
    const addNextItem = onCalculationSelect ?? (() => onChange({
      ...expression,
      arguments: [
        ...expression.arguments,
        { kind: "field", field: "" },
      ],
    }));
    return (
      <div
        className={`expression-group-list expression-debug-target expression-debug-group-box expression-item-controls${root ? " expression-group-root" : " expression-group-nested"}${selectionPath === undefined ? "" : " expression-selectable"}${isSelected ? " expression-selected" : ""}${isDropPreview ? " expression-drop-preview" : ""}`}
        tabIndex={selectionPath === undefined ? undefined : root ? -1 : 0}
        onFocus={(event) => {
          if (
            event.target === event.currentTarget
            && event.currentTarget.matches(":focus-visible")
            && selectionPath !== undefined
          )
            onSelect?.(selectionPath);
        }}
        onPointerDown={startSelectedDrag}
        data-expression-path={path === undefined ? undefined : JSON.stringify(path)}
      >
        {expression.arguments.map((argument, index) => {
          const argumentPath = path === undefined ? undefined : [...path, index];
          const updateArgument = (next: IFieldDefinition) => {
            const argumentsList = expression.arguments.map((item, itemIndex) =>
              itemIndex === index ? next : item,
            );
            onChange({ ...expression, arguments: argumentsList });
          };
          const appendMath = () => onChange({
            ...expression,
            arguments: [
              ...expression.arguments.slice(0, index + 1),
              { kind: "field", field: "" },
              ...expression.arguments.slice(index + 1),
            ],
          });

          return (
            <ExpressionMathElement
              key={`expression-item-${index}`}
              expression={argument}
              operator={getGroupArgumentOperator(argument, index)}
              entity={entity}
              metadata={metadata}
              functionDefinitions={functionDefinitions}
              functionDefinitionsStatus={functionDefinitionsStatus}
              functionDefinitionsError={functionDefinitionsError}
              fieldPlaceholder={fieldPlaceholder}
              fieldDataType={fieldDataType}
              path={argumentPath}
              onPointerDragStart={onPointerDragStart}
              dragPreview={dragPreview}
              dragPosition={dragPosition}
              onChange={updateArgument}
              onCalculationSelect={appendMath}
              onRemove={() => onChange(removeExpressionNode(expression, [index]))}
              selectionPath={selectionPath === undefined ? undefined : [...selectionPath, index]}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onUngroup={onUngroup}
              canUngroup
            />
          );
        })}
        {((!root && (canUngroup && onUngroup && expression.arguments.length > 0 || onRemove))
          || (!root && onCalculationSelect)) && (
          <div className="expression-group-actions expression-actions-bar">
            {!root && canUngroup && onUngroup && expression.arguments.length > 0 && (
              <button
                type="button"
                className="expression-ungroup"
                aria-label="Ungroup expression"
                title="Ungroup"
                onClick={(event) => {
                  event.stopPropagation();
                  if (path) onUngroup(path);
                }}
              >
                <Icon name="ungroup" size={14} />
              </button>
            )}
            {!root && onRemove && (
              <button
                type="button"
                className="expression-remove"
                aria-label="Delete"
                title="Delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
              >
                <Icon name="remove" size={13} />
              </button>
            )}
            {!root && <ExpressionAddNextItem onAddNextItem={addNextItem} />}
          </div>
        )}
        <ExpressionDebugTooltip label="Group box" model={groupDebugModel} />
      </div>
    );
  }
  if (expression.kind === "value") {
    const constantValue = typeof expression.value === "string" || typeof expression.value === "number"
      ? expression.value
      : String(expression.value ?? "");
    return (
      <div
        className={`expression-debug-target expression-field-drop-target expression-value-node expression-item-controls${selectionPath === undefined ? "" : " expression-selectable"}${isSelected ? " expression-selected" : ""}`}
        tabIndex={selectionPath === undefined ? undefined : 0}
        onFocus={(event) => {
          if (
            event.target === event.currentTarget
            && event.currentTarget.matches(":focus-visible")
            && selectionPath !== undefined
          )
            onSelect?.(selectionPath);
        }}
        onPointerDown={(event) => startSelectedDrag(event, true)}
        data-expression-kind={expression.kind}
        data-expression-path={path === undefined ? undefined : JSON.stringify(path)}
      >
        <div className="expression-debug-target expression-debug-field-builder expression-item-controls">
          <div className={`expression-field-box-drop-target${isDropPreview ? " expression-drop-preview" : ""}${isDropPreview && dragPosition ? ` expression-drop-position-${dragPosition}` : ""}`}>
            <FieldBuilder
              entity={entity}
              metadata={metadata}
              value={`<${constantValue}>`}
              onChange={(field) => onChange({ kind: "field", field })}
              showPath
              ariaLabel="Expression constant"
              initialConstantValue={constantValue}
              initialSection="value"
              allowValueSelection
              allowFunctionSelection
              expressionBuilder={{
                functionDefinitions,
                functionDefinitionsStatus,
                functionDefinitionsError,
              }}
              debugModel={expression}
              onValueSelect={(value) => onChange({ ...expression, value })}
              onExpressionApply={onChange}
            />
          </div>
          <div className="expression-actions-bar">
            {onRemove && (
              <button
                type="button"
                className="expression-remove"
                aria-label="Delete"
                title="Delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
              >
                <Icon name="remove" size={13} />
              </button>
            )}
            <ExpressionAddNextItem
              onAddNextItem={onCalculationSelect ?? (() => onChange({
                kind: "group",
                arguments: [
                  expression,
                  { kind: "field", field: "" },
                ],
              }))}
            />
          </div>
          <ExpressionDebugTooltip label="Field box" model={expression} />
        </div>
      </div>
    );
  }

  const addNextItem = onCalculationSelect ?? (() => onChange({
    kind: "group",
    arguments: [
      expression,
      { kind: "field", field: "" },
    ],
  }));

  return (
    <FunctionBuilder
      expression={expression}
      functionDefinitions={functionDefinitions}
      onChange={onChange}
      onRemove={onRemove ?? (root ? () => onChange({ kind: "field", field: "" }) : undefined)}
      root={root}
      path={path}
      selectionPath={selectionPath}
      selectedPath={selectedPath}
      onSelect={onSelect}
      onPointerDragStart={onPointerDragStart}
      onAddNextItem={addNextItem}
      renderArgument={(argument, index, onArgumentChange, onArgumentRemove, argumentDefinition) => {
        const appendMathToArgument = () => {
          const currentArgument = expression.arguments[index];
          if (!currentArgument) return;
          if (currentArgument.kind === "group") {
            onChange({
              ...expression,
              arguments: [
                ...expression.arguments.slice(0, index + 1),
                { kind: "field", field: "", oper: "+" },
                ...expression.arguments.slice(index + 1),
              ],
            });
            return;
          }
          const group = { kind: "group" as const, arguments: [currentArgument] };
          onChange({
            ...expression,
            arguments: expression.arguments.map((item, itemIndex) => itemIndex === index
              ? {
                ...group,
                arguments: [
                  ...group.arguments,
                  { kind: "field" as const, field: "" },
                ],
              }
              : item),
          });
        };

        const argumentPath = path === undefined ? undefined : [...path, index];
        const argumentSelectionPath = selectionPath === undefined ? undefined : [...selectionPath, index];
        if (argument.oper === "+") {
          return (
            <ExpressionMathElement
              expression={argument}
              operator="+"
              entity={entity}
              metadata={metadata}
              functionDefinitions={functionDefinitions}
              functionDefinitionsStatus={functionDefinitionsStatus}
              functionDefinitionsError={functionDefinitionsError}
              fieldPlaceholder={fieldPlaceholder}
              fieldDataType={fieldDataType}
              onChange={onArgumentChange}
              onCalculationSelect={appendMathToArgument}
              onRemove={onArgumentRemove}
              path={argumentPath}
              onPointerDragStart={onPointerDragStart}
              dragPreview={dragPreview}
              dragPosition={dragPosition}
              selectionPath={argumentSelectionPath}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onUngroup={onUngroup}
              canUngroup={false}
            />
          );
        }

        return (
          <NodeEditor
            expression={argument}
            entity={entity}
            metadata={metadata}
            functionDefinitions={functionDefinitions}
            functionDefinitionsStatus={functionDefinitionsStatus}
            functionDefinitionsError={functionDefinitionsError}
            fieldPlaceholder={argumentDefinition?.name}
            fieldDataType={argumentDefinition?.dataType}
            onChange={onArgumentChange}
            onRemove={onArgumentRemove}
            onCalculationSelect={appendMathToArgument}
            path={argumentPath}
            onPointerDragStart={onPointerDragStart}
            dragPreview={dragPreview}
            dragPosition={dragPosition}
            selectionPath={argumentSelectionPath}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onUngroup={onUngroup}
            canUngroup={false}
          />
        );
      }}
    />
  );
}
