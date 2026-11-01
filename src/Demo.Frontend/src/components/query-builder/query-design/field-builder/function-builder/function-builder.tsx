import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { IFieldDefinition } from "../../query-builder-slice";
import type {
  FunctionArgumentDefinition,
  FunctionDefinition,
} from "../../../../function-definition/types";
import Icon from "../../../../icon/icon";
import ExpressionAddNextItem from "../expression-builder/expression-add-next-item";
import { updateFunction } from "../expression-builder/expression-model";
import { isSameExpressionPath, type ExpressionPath } from "../expression-builder/expression-model";
import "./function-builder.css";

type FunctionBuilderProps = {
  expression: Extract<IFieldDefinition, { kind: "function" }>;
  functionDefinitions: FunctionDefinition[];
  onChange: (expression: IFieldDefinition) => void;
  onRemove?: () => void;
  root?: boolean;
  path?: ExpressionPath;
  selectionPath?: ExpressionPath;
  selectedPath?: ExpressionPath;
  onSelect?: (path: ExpressionPath) => void;
  onPointerDragStart?: (event: ReactPointerEvent<HTMLDivElement>, path: ExpressionPath) => void;
  onAddNextItem?: () => void;
  renderArgument: (
    argument: IFieldDefinition,
    index: number,
    onChange: (expression: IFieldDefinition) => void,
    onRemove: () => void,
    argumentDefinition?: FunctionArgumentDefinition,
  ) => ReactNode;
};

export type FunctionChoice = {
  name: string;
  label: string;
  syntax: string;
};

export function FunctionSelect({
  value,
  choices,
  onChange,
}: {
  value: string;
  choices: FunctionChoice[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedChoice = choices.find((choice) => choice.name === value);
  const filteredChoices = choices.filter((choice) =>
    choice.label.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="expression-function-select" ref={containerRef}>
      <button
        type="button"
        className="operator-trigger"
        aria-label="Function"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={selectedChoice?.syntax}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setOpen((isOpen) => !isOpen);
        }}
      >
        {selectedChoice?.label ?? "Select a function…"}
      </button>
      {open && (
        <div className="expression-function-menu operator-menu" role="group" aria-label="Function options">
          <div
            className="field-box-chooser-tabs"
            role="tablist"
            aria-label="Function selection type"
            style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
          >
            <button type="button" role="tab" aria-selected="true" className="field-box-chooser-tab active">
              Function
            </button>
          </div>
          <div role="tabpanel" aria-label="Function">
            <input
              type="search"
              className="expression-function-search"
              aria-label="Search functions"
              placeholder="Search functions..."
              value={searchTerm}
              autoFocus
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <div className="expression-function-options" role="listbox" aria-label="Functions">
              {filteredChoices.length > 0 ? filteredChoices.map((choice) => (
                <button
                  key={choice.name}
                  type="button"
                  className={`operator-option${choice.name === value ? " operator-option-selected" : ""}`}
                  role="option"
                  aria-selected={choice.name === value}
                  title={choice.syntax}
                  onClick={() => {
                    onChange(choice.name);
                    setSearchTerm("");
                    setOpen(false);
                  }}
                >
                  {choice.label}
                </button>
              )) : (
                <span className="expression-function-no-results" role="status">No functions found.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type FunctionTemplateBuilderProps = {
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  onApply: (expression: Extract<IFieldDefinition, { kind: "function" }>) => void;
};

export function FunctionTemplateBuilder({
  functionDefinitions,
  functionDefinitionsStatus,
  functionDefinitionsError,
  onApply,
}: FunctionTemplateBuilderProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const filteredDefinitions = functionDefinitions.filter((definition) =>
    definition.name.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  return (
    <div className="expression-function-template">
      <input
        type="search"
        className="expression-function-template-search"
        aria-label="Search functions"
        placeholder="Search functions..."
        value={searchTerm}
        autoFocus
        onChange={(event) => setSearchTerm(event.target.value)}
      />
      {functionDefinitions.length === 0 && functionDefinitionsError && (
        <span className="expression-function-template-status" role="alert">{functionDefinitionsError}</span>
      )}
      {functionDefinitions.length === 0 && !functionDefinitionsError && (
        <span className="expression-function-template-status" role="status">
          {functionDefinitionsStatus === "loading" || functionDefinitionsStatus === "pending"
            ? "Loading functions..."
            : "No functions available."}
        </span>
      )}
      {functionDefinitions.length > 0 && (
        <div className="expression-function-template-table">
          <table aria-label="Available functions">
            <thead>
              <tr>
                <th scope="col">Function</th>
                <th scope="col">Parameters</th>
              </tr>
            </thead>
            <tbody>
            {filteredDefinitions.length > 0 ? filteredDefinitions.map((definition) => (
              <tr
                key={definition.name}
                aria-label={`${definition.name} (${definition.arguments.map((argument) => argument.name).join(", ")})`}
                tabIndex={0}
                onClick={() => onApply({
                  kind: "function",
                  function: definition.name,
                  arguments: definition.arguments.map(() => ({ kind: "field", field: "" })),
                })}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onApply({
                    kind: "function",
                    function: definition.name,
                    arguments: definition.arguments.map(() => ({ kind: "field", field: "" })),
                  });
                }}
              >
                <td>{definition.name}</td>
                <td>
                  {definition.arguments.length > 0
                    ? definition.arguments.map((argument) => argument.name).join(", ")
                    : "No parameters"}
                </td>
              </tr>
            )) : (
              <tr>
                <td className="expression-function-template-status" role="status" colSpan={2}>No functions found.</td>
              </tr>
            )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FunctionBuilder({
  expression,
  functionDefinitions,
  onChange,
  onRemove,
  root = false,
  path,
  selectionPath,
  selectedPath,
  onSelect,
  onPointerDragStart,
  onAddNextItem,
  renderArgument,
}: FunctionBuilderProps) {
  const definition = functionDefinitions.find((item) => item.name === expression.function);
  const isSelected = selectionPath !== undefined
    && selectedPath !== undefined
    && isSameExpressionPath(selectionPath, selectedPath);
  const startSelectedDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSelected || !path?.length || !onPointerDragStart) return;
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest("button, input, select, textarea, a, [role='button'], [role='option'], [role='tab'], [contenteditable='true']")) return;
      if (target.closest(".expression-selectable") !== event.currentTarget) return;
    }
    onPointerDragStart(event, path);
  };
  const choices = [
    ...(expression.function && !functionDefinitions.some((item) => item.name === expression.function)
      ? [{ name: expression.function, label: expression.function, syntax: `${expression.function}()` }]
      : []),
    ...functionDefinitions.map((item) => ({
      name: item.name,
      label: item.name,
      syntax: `${item.name}(${item.arguments.map((argument) => argument.name).join(", ")})`,
    })),
  ];

  return (
    <div
      className={`expression-node expression-node-function expression-item-controls${root ? " expression-node-root" : ""}${selectionPath === undefined ? "" : " expression-selectable"}${isSelected ? " expression-selected" : ""}`}
      tabIndex={selectionPath === undefined ? undefined : 0}
      onFocus={(event) => {
      if (
        event.target === event.currentTarget
        && event.currentTarget.matches(":focus-visible")
        && selectionPath !== undefined
      )
          onSelect?.(selectionPath);
      }}
      onPointerDown={startSelectedDrag}
      data-expression-kind={expression.kind}
      data-expression-path={path === undefined ? undefined : JSON.stringify(path)}
    >
      <div className="expression-function-editor">
        <div className="expression-function-label">
          <FunctionSelect
            value={expression.function}
            choices={choices}
            onChange={(name) => onChange(updateFunction(expression, name, functionDefinitions))}
          />
          {(onRemove || onAddNextItem) && (
            <div className="expression-function-actions expression-actions-bar">
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
                  <Icon name="delete" size={13} />
                </button>
              )}
              {onAddNextItem && (
                <ExpressionAddNextItem onAddNextItem={onAddNextItem} />
              )}
            </div>
          )}
        </div>
        {expression.function && (
          <span className="expression-function-punctuation expression-function-parenthesis" aria-hidden="true">(</span>
        )}
        {expression.function && (
          <div className="expression-function-arguments" role="group" aria-label="Function arguments">
            {expression.arguments.map((argument, index) => {
              const argumentDefinition = definition?.arguments[index];
              const argumentLabel = argumentDefinition
                ? `${argumentDefinition.name} (${argumentDefinition.dataType})`
                : `Argument ${index + 1}`;
              return (
                <div
                  className="expression-function-argument"
                  key={`${expression.function}-${index}`}
                  role="group"
                  aria-label={argumentLabel}
                >
                  {renderArgument(
                    argument,
                    index,
                    (next) => onChange({
                      ...expression,
                      arguments: expression.arguments.map((item, itemIndex) => itemIndex === index ? next : item),
                    }),
                    () => onChange({
                      ...expression,
                      arguments: expression.arguments.map((item, itemIndex) =>
                        itemIndex === index ? { kind: "field", field: "" } : item,
                      ),
                    }),
                    argumentDefinition,
                  )}
                </div>
              );
            })}
          </div>
        )}
        {expression.function && (
          <span className="expression-function-punctuation expression-function-parenthesis expression-function-close" aria-hidden="true">)</span>
        )}
      </div>
    </div>
  );
}
