import { useState } from "react";
import FieldBox from "./field-box/field-box";
import { ApiQueryContextDefinition, IFieldDefinition, MatchOperation, MetadataEntity } from "../query-builder-slice";
import Icon from "../../../icon/icon";
import ExpressionBuilder from "./expression-builder";
import { FunctionDefinition } from "../../../function-definition/types";
import { FunctionTemplateBuilder } from "./function-builder/function-builder";
import ExpressionDebugTooltip from "./expression-debug-tooltip/expression-debug-tooltip";
import "./field-builder.css";

const FIELD_BOX_HEIGHT = 34;

export type FieldBuilderExpressionOptions = {
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  joinedContexts?: ApiQueryContextDefinition[];
  initialKind?: "group" | "function";
  initialExpression?: IFieldDefinition;
};

type FieldBuilderProps = {
  entity: MetadataEntity;
  metadata: MetadataEntity[];
  joinedContexts?: ApiQueryContextDefinition[];
  value: string;
  onChange: (path: string) => void;
  onRemove?: () => void;
  showPath?: boolean;
  placeholder?: string;
  placeholderIcon?: boolean;
  ariaLabel?: string;
  popupAnchor?: HTMLElement | null;
  excludedPaths?: string[];
  autoFocus?: boolean;
  editMode?: boolean;
  onCancel?: () => void;
  allowValueSelection?: boolean;
  allowCalculationSelection?: boolean;
  allowFunctionSelection?: boolean;
  showFunctionTab?: boolean;
  initialSection?: "fields" | "value" | "calculation";
  initialConstantValue?: string | number;
  onValueSelect?: (value: string | number) => void;
  expressionBuilder?: FieldBuilderExpressionOptions;
  debugModel?: IFieldDefinition;
  debugOperator?: MatchOperation | null;
  onExpressionApply?: (expression: IFieldDefinition) => void;
};

export default function FieldBuilder({
  entity,
  metadata,
  joinedContexts,
  value,
  onChange,
  onRemove,
  showPath = false,
  placeholder = "Select field…",
  placeholderIcon = false,
  ariaLabel = "Field",
  popupAnchor,
  excludedPaths = [],
  autoFocus,
  editMode = false,
  onCancel,
  allowValueSelection = false,
  allowCalculationSelection = false,
  allowFunctionSelection = false,
  showFunctionTab = true,
  initialConstantValue,
  initialSection = initialConstantValue !== undefined ? "value" : "fields",
  onValueSelect,
  expressionBuilder,
  debugModel,
  debugOperator,
  onExpressionApply,
}: FieldBuilderProps) {
  const [isEditing, setIsEditing] = useState(editMode);
  const [hasIncompleteSelection, setHasIncompleteSelection] = useState(false);
  const cancelEdit = () => {
    setIsEditing(false);
    onCancel?.();
  };
  const renderCalculation = onExpressionApply && expressionBuilder
    ? (closeMenu: () => void, registerCloseGuard: (guard?: () => Promise<boolean>) => void) => <ExpressionBuilder
      key="calculation-expression-editor"
      {...expressionBuilder}
      entity={entity}
      metadata={metadata}
      registerCloseGuard={registerCloseGuard}
      onApply={(expression) => {
        setIsEditing(false);
        onExpressionApply(expression);
        closeMenu();
      }}
    />
    : undefined;
  const renderFunction = allowFunctionSelection && onExpressionApply && expressionBuilder
    ? (closeMenu: () => void) => <FunctionTemplateBuilder
      functionDefinitions={expressionBuilder.functionDefinitions}
      functionDefinitionsStatus={expressionBuilder.functionDefinitionsStatus}
      functionDefinitionsError={expressionBuilder.functionDefinitionsError}
      onApply={(expression) => {
        setIsEditing(false);
        onExpressionApply(expression);
        closeMenu();
      }}
    />
    : undefined;
  const removeButton = onRemove && (
    <button
      type="button"
      className="field-builder-remove"
      aria-label={`Remove ${ariaLabel.toLowerCase()}`}
      title={`Remove ${ariaLabel.toLowerCase()}`}
      onClick={onRemove}
    >
      <Icon name="close" size={12} />
    </button>
  );
  const fieldBox = (
    <FieldBox
      entity={entity}
      metadata={metadata}
      joinedContexts={joinedContexts ?? expressionBuilder?.joinedContexts}
      value={value}
      onIncompleteChange={setHasIncompleteSelection}
      clearOnSelect
      autoFocus={autoFocus ?? (Boolean(value) || initialConstantValue !== undefined)}
      showPath={showPath}
      placeholder={initialConstantValue === undefined ? placeholder : String(initialConstantValue)}
      placeholderIcon={placeholderIcon}
      ariaLabel={ariaLabel}
      popupAnchor={popupAnchor}
      excludedPaths={excludedPaths}
      allowValueSelection={allowValueSelection}
      allowCalculationSelection={allowCalculationSelection}
      allowFunctionSelection={allowFunctionSelection && showFunctionTab && Boolean(renderFunction)}
      initialSection={initialSection}
      initialConstantValue={initialConstantValue}
      onEscape={cancelEdit}
      onValueSelect={(constantValue) => {
        setIsEditing(false);
        onValueSelect?.(constantValue);
      }}
      renderCalculation={renderCalculation}
      renderFunction={renderFunction}
      onChange={(path) => {
        setIsEditing(false);
        onChange(path);
      }}
    />
  );
  const fieldBoxDebugModel: IFieldDefinition = debugOperator
    ? { kind: "field", field: value, oper: debugOperator }
    : debugModel ?? { kind: "field", field: value };

  if (!value || editMode || isEditing) {
    return (
      <div
        className={`field-builder-editing${hasIncompleteSelection ? " field-builder-incomplete" : ""}`}
        autoFocus
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEdit();
          }
        }}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Element && nextTarget.closest(".field-box-menu-popup")) return;
          if (!nextTarget || !(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            cancelEdit();
          }
        }
      }
      >
        {debugModel
          ? <div className="expression-debug-target expression-debug-field-box">
            {fieldBox}
            <ExpressionDebugTooltip label="Field box" model={fieldBoxDebugModel} />
          </div>
          : fieldBox}
        {removeButton}
      </div>
    );
  }

  const displayValue = showPath ? value : value.split(".").pop() ?? value;

  return (
    <div className="field-builder-selected" style={{ height: FIELD_BOX_HEIGHT }}>
      <span
        className="field-builder-value"
        aria-label={`Selected ${ariaLabel.toLowerCase()}: ${value}`}
        onClick={() => setIsEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setIsEditing(true);
        }}
      >
        {displayValue}
      </span>
      {removeButton}
    </div>
  );
}
