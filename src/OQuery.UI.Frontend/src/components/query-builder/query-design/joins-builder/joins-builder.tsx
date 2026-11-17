import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../../../icon/icon";
import type { FunctionDefinition } from "../../../function-definition/types";
import FieldBuilder from "../field-builder/field-builder";
import type {
  ApiQueryContextDefinition,
  FilterOperatorDefinition,
  IFieldDefinition,
  MetadataEntity,
  QueryDefinition,
} from "../query-builder-slice";
import { formatExpression } from "../field-builder/expression-builder";
import "./joins-builder.css";

type JoinConditionItem = {
  left?: IFieldDefinition | string;
  right?: IFieldDefinition | string | number | boolean | null;
  operation?: number | string;
  logicalOperator?: number;
  parameterized?: boolean;
};

type JoinCondition = {
  logicalOperation?: number;
  filters?: JoinConditionItem[];
};

type JoinsBuilderProps = {
  definition: QueryDefinition;
  contexts: ApiQueryContextDefinition[];
  metadata: MetadataEntity[];
  operators: FilterOperatorDefinition[];
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  canAddJoin: boolean;
  excludeContextId?: string;
  onDefinitionChange: (definition: QueryDefinition) => void;
};

const joinTypes = [
  [0, "Inner"],
  [1, "Left"],
  [2, "Right"],
  [3, "Full"],
] as const;

const defaultJoinOperator = 0;

const defaultOperators = [
  [0, "="], [1, "<>"], [4, ">"], [5, "<"], [6, ">="], [7, "<="],
] as const;

function JoinDropdown({
  value,
  options,
  ariaLabel,
  showChevron = true,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
  showChevron?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

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
      const top = window.innerHeight - triggerBounds.bottom < menuHeight + 4
        && triggerBounds.top >= menuHeight + 4
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
    <div className="join-dropdown" ref={containerRef}>
      <button
        type="button"
        className="join-dropdown-trigger"
        ref={triggerRef}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {selectedOption?.label}
        {showChevron && <Icon name="chevron-down" size={14} />}
      </button>
      {open && createPortal(
        <div
          className="operator-menu join-dropdown-menu"
          ref={menuRef}
          role="listbox"
          aria-label={`${ariaLabel} options`}
          style={{
            position: "fixed",
            top: menuPosition?.top ?? 0,
            left: menuPosition?.left ?? 0,
            transform: "none",
            zIndex: 1000,
            visibility: menuPosition ? "visible" : "hidden",
          }}
        >
          {options.map((option) => (
            <button
              type="button"
              className={`operator-option${option.value === value ? " operator-option-selected" : ""}`}
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asFieldExpression(value: unknown): IFieldDefinition | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  const oper = typeof value.oper === "string" && ["+", "-", "*", "/", "%", "&", "|"].includes(value.oper)
    ? value.oper as IFieldDefinition["oper"]
    : undefined;
  if (value.kind === "field" && typeof value.field === "string")
    return { kind: "field", field: value.field, ...(oper ? { oper } : {}) };
  if (value.kind === "value" && "value" in value)
    return { kind: "value", value: value.value, ...(oper ? { oper } : {}) };
  if (value.kind === "group" && Array.isArray(value.arguments)) {
    const arguments_ = value.arguments.map(asFieldExpression);
    if (arguments_.every((argument) => argument !== undefined))
      return { kind: "group", arguments: arguments_.filter((argument): argument is IFieldDefinition => argument !== undefined), ...(oper ? { oper } : {}) };
  }
  if (value.kind === "function" && typeof value.function === "string" && Array.isArray(value.arguments)) {
    const arguments_ = value.arguments.map(asFieldExpression);
    if (arguments_.every((argument) => argument !== undefined))
      return { kind: "function", function: value.function, arguments: arguments_.filter((argument): argument is IFieldDefinition => argument !== undefined), ...(oper ? { oper } : {}) };
  }
  return undefined;
}

function expressionText(expression: IFieldDefinition | string | undefined): string {
  return typeof expression === "string"
    ? expression
    : expression
      ? formatExpression(expression)
      : "";
}

function normalizeJoinOperator(operator: number | string): number | string {
  if (typeof operator !== "string" || !operator.startsWith("builtin:")) return operator;
  const value = Number(operator.slice("builtin:".length));
  return Number.isInteger(value) ? value : operator;
}

function joinCondition(context: ApiQueryContextDefinition): JoinConditionItem {
  if (!isRecord(context.condition) || !Array.isArray(context.condition.filters)) return {};
  const first = context.condition.filters[0];
  if (!isRecord(first)) return {};
  return {
    ...(asFieldExpression(first.left) ? { left: asFieldExpression(first.left) } : {}),
    ...(asFieldExpression(first.right) ? { right: asFieldExpression(first.right) } : {}),
    ...(typeof first.operation === "number" || typeof first.operation === "string"
      ? { operation: normalizeJoinOperator(first.operation) }
      : {}),
  };
}

function createCondition(left: IFieldDefinition | undefined, operation: number | string, right: IFieldDefinition | undefined): JoinCondition {
  return {
    logicalOperation: 0,
    filters: [{
      left: left ?? { kind: "field", field: "" },
      operation,
      right: right ?? { kind: "field", field: "" },
      logicalOperator: 0,
      parameterized: false,
    }],
  };
}

export default function JoinsBuilder({
  definition,
  contexts,
  metadata,
  operators,
  functionDefinitions,
  functionDefinitionsStatus,
  functionDefinitionsError,
  canAddJoin,
  excludeContextId,
  onDefinitionChange,
}: JoinsBuilderProps) {
  const joins = definition.contexts ?? [];
  const availableContexts = contexts.filter((context) => context.id !== excludeContextId);
  const createUniqueAlias = (name: string) => {
    const aliases = new Set(joins.map((join) => (join.alias ?? join.name).trim().toLowerCase()));
    let alias = name;
    let suffix = 2;
    while (aliases.has(alias.toLowerCase())) {
      alias = `${name}${suffix}`;
      suffix += 1;
    }
    return alias;
  };
  const updateJoin = (index: number, update: Partial<ApiQueryContextDefinition>) => {
    onDefinitionChange({
      ...definition,
      contexts: joins.map((join, joinIndex) => joinIndex === index ? { ...join, ...update } : join),
    });
  };
  const addJoin = () => {
    const available = availableContexts[0];
    if (!available) return;
    onDefinitionChange({
      ...definition,
      contexts: [...joins, {
        ...available,
        alias: createUniqueAlias(available.name),
        joinType: 1,
        condition: createCondition(undefined, defaultJoinOperator, undefined),
      }],
    });
  };

  if (!joins.length && !canAddJoin) return null;

  return (
    <section className="builder-section joins-section">
      <div className="section-header">
        <div className="section-heading">
          <span className="section-kicker">RELATIONS</span>
          {canAddJoin && <button className="field-action field-action-icon" type="button" aria-label="Add relation" title="Add relation" onClick={addJoin} disabled={!availableContexts.length}>
            <Icon name="plus" size={14} />
          </button>}
        </div>
      </div>
      {!!joins.length && <div className="joins-table">
        <div className="joins-table-header" aria-hidden="true">
          <span>JOIN</span><span>REF CONTEXT</span><span>ALIAS</span><span>FROM FIELD</span><span /><span>TO CONTEXT FIELD</span><span />
        </div>
        {joins.map((join, index) => {
        const condition = joinCondition(join);
        const left = asFieldExpression(condition.left);
        const right = asFieldExpression(condition.right);
        const leftText = expressionText(left ?? (typeof condition.left === "string" ? condition.left : undefined));
        const rightText = expressionText(right ?? (typeof condition.right === "string" ? condition.right : undefined));
        const operation = condition.operation ?? defaultJoinOperator;
        const entityFor = (context: ApiQueryContextDefinition) =>
          metadata.find((item) => item.name === context.name)
          ?? metadata.find((item) => item.name === context.query.entity);
        const leftEntity = metadata.find((item) => item.name === definition.entity)
          ?? { name: definition.entity || "MainQuery", fields: [] };
        const rightEntity = entityFor(join)
          ?? { name: join.query.entity || join.name, fields: [] };
        const availableOperators = operators.length
          ? operators.map((item) => [
            item.isBuiltin ? normalizeJoinOperator(item.id) : item.id,
            item.symbol,
          ] as const)
          : defaultOperators;

        return (
          <div className="join-row" key={`${join.id ?? join.name}-${index}`}>
            <div className="join-control">
              <JoinDropdown
                ariaLabel="Join type"
                value={String(join.joinType ?? 1)}
                showChevron={false}
                options={joinTypes.map(([value, label]) => ({ value: String(value), label }))}
                onChange={(value) => updateJoin(index, { joinType: Number(value) })}
              />
            </div>
            <div className="join-control">
              <JoinDropdown
                ariaLabel="Reference context"
                value={join.id ?? join.name}
                showChevron={false}
                options={contexts.filter((context) => context.id !== excludeContextId).map((context) => ({
                  value: context.id ?? context.name,
                  label: context.name,
                }))}
                onChange={(value) => {
                const selected = contexts.find((context) => (context.id ?? context.name) === value);
                if (selected) updateJoin(index, { ...selected, alias: join.alias ?? join.name, joinType: join.joinType ?? 1, condition: join.condition });
              }}
              />
            </div>
            <label className="join-control">
              <input aria-label="Relation alias" value={join.alias ?? join.name} onChange={(event) => updateJoin(index, { alias: event.target.value })} placeholder="Alias" />
            </label>
            <div className="join-condition-field">
              <FieldBuilder
                entity={leftEntity}
                metadata={metadata}
                value={leftText}
                showPath
                ariaLabel="Join left field"
                placeholder="Select field..."
                allowValueSelection
                allowCalculationSelection
                allowFunctionSelection
                showFunctionTab={false}
                expressionBuilder={{ functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, initialExpression: left }}
                onChange={(field) => updateJoin(index, { condition: createCondition({ kind: "field", field }, operation, right) as ApiQueryContextDefinition["condition"] })}
                onExpressionApply={(expression) => updateJoin(index, { condition: createCondition(expression, operation, right) as ApiQueryContextDefinition["condition"] })}
                onValueSelect={(value) => updateJoin(index, { condition: createCondition({ kind: "value", value }, operation, right) as ApiQueryContextDefinition["condition"] })}
              />
            </div>
            <label className="join-control join-operation-control">
              <JoinDropdown
                ariaLabel="Join condition operator"
                value={String(operation)}
                showChevron={false}
                options={availableOperators.map(([value, label]) => ({ value: String(value), label }))}
                onChange={(value) => {
                const nextOperation = Number.isNaN(Number(value)) ? value : Number(value);
                updateJoin(index, { condition: createCondition(left, nextOperation, right) as ApiQueryContextDefinition["condition"] });
              }}
              />
            </label>
            <div className="join-condition-field">
              <FieldBuilder
                entity={rightEntity}
                metadata={metadata}
                value={rightText}
                showPath
                ariaLabel="Join right field"
                placeholder="Select field..."
                allowValueSelection
                allowCalculationSelection
                allowFunctionSelection
                showFunctionTab={false}
                expressionBuilder={{ functionDefinitions, functionDefinitionsStatus, functionDefinitionsError, initialExpression: right }}
                onChange={(field) => updateJoin(index, { condition: createCondition(left, operation, { kind: "field", field }) as ApiQueryContextDefinition["condition"] })}
                onExpressionApply={(expression) => updateJoin(index, { condition: createCondition(left, operation, expression) as ApiQueryContextDefinition["condition"] })}
                onValueSelect={(value) => updateJoin(index, { condition: createCondition(left, operation, { kind: "value", value }) as ApiQueryContextDefinition["condition"] })}
              />
            </div>
            <button type="button" className="field-action field-action-clear join-remove" aria-label={`Remove relation to ${join.name}`} title={`Remove relation to ${join.name}`} onClick={() => onDefinitionChange({
              ...definition,
              contexts: joins.filter((_, joinIndex) => joinIndex !== index),
            })}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        );
        })}
      </div>}
    </section>
  );
}
