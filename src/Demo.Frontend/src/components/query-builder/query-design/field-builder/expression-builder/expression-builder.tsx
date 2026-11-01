import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  ApiQueryContextDefinition,
  IFieldDefinition,
  MetadataEntity,
} from "../../query-builder-slice";
import { FieldBoxPopupContext } from "../field-box/field-box-popup-context";
import Icon from "../../../../icon/icon";
import { useMessageBox } from "../../../../message-box/message-box";
import type { FunctionDefinition } from "../../../../function-definition/types";
import type { RootState } from "../../../../../store/store";
import NodeEditor from "./expression-node-editor";
import {
  adjustExpressionPathAfterRemoval,
  createExpression,
  formatExpression,
  getExpressionDropTarget,
  getExpressionError,
  getExpressionNode,
  getGroupArgumentOperator,
  isExpressionContainer,
  isExpressionGroup,
  isSameExpressionPath,
  normalizeExpressionTree,
  removeExpressionNodeForMove,
  removeExpressionNode,
  replaceExpressionNode,
  setExpressionOperation,
  updateExpressionNode,
  type ExpressionPath,
  type ExpressionPointerDrag,
} from "./expression-model";
import "./expression-builder.css";

export { formatExpression } from "./expression-model";

type ExpressionBuilderProps = {
  entity: MetadataEntity;
  metadata: MetadataEntity[];
  joinedContexts?: ApiQueryContextDefinition[];
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  initialKind?: "group" | "function";
  initialExpression?: IFieldDefinition;
  onApply: (expression: IFieldDefinition) => void;
  registerCloseGuard?: (guard?: () => Promise<boolean>) => void;
};

export default function ExpressionBuilder({
  entity,
  metadata,
  joinedContexts,
  functionDefinitions,
  functionDefinitionsStatus,
  functionDefinitionsError,
  initialKind,
  initialExpression,
  onApply,
  registerCloseGuard,
}: ExpressionBuilderProps) {
  const expressionDebugUiEnabled = useSelector(
    (state: RootState) => state.queryBuilder.debugUiEnabled,
  );
  const showMessageBox = useMessageBox();
  const [activeFieldBoxPopupId, setActiveFieldBoxPopupId] = useState<symbol | null>(null);
  const popupManager = useMemo(
    () => ({ activeMenuId: activeFieldBoxPopupId, setActiveMenuId: setActiveFieldBoxPopupId }),
    [activeFieldBoxPopupId],
  );
  const [expression, setExpression] = useState<IFieldDefinition>(
    initialExpression ?? createExpression(initialKind === "function" ? "function" : "group", functionDefinitions),
  );
  const initialExpressionRef = useRef(expression);
  const [selectedPath, setSelectedPath] = useState<ExpressionPath>();
  const expressionBuilderRef = useRef<HTMLDivElement>(null);
  const pendingPointerDragRef = useRef<ExpressionPointerDrag>();
  const [pointerDrag, setPointerDrag] = useState<ExpressionPointerDrag>();
  const [dragPreview, setDragPreview] = useState<ExpressionPath>();
  const [dragPosition, setDragPosition] = useState<"before" | "inside" | "after">();
  const [copyFeedback, setCopyFeedback] = useState<{
    json: string;
    status: "copied" | "error";
  }>();
  const modelJson = JSON.stringify(expression, null, 2);
  const copyStatus = copyFeedback?.json === modelJson ? copyFeedback.status : undefined;
  const validationError = getExpressionError(expression);
  const hasUnsavedChanges = JSON.stringify(expression) !== JSON.stringify(initialExpressionRef.current);

  useEffect(() => {
    if (!registerCloseGuard) return;
    if (!hasUnsavedChanges) {
      registerCloseGuard(undefined);
      return () => registerCloseGuard(undefined);
    }
    registerCloseGuard(async () => {
      if (!hasUnsavedChanges) return true;
      const action = await showMessageBox({
        eyebrow: "Unapplied calculation",
        title: "Apply changes before closing?",
        message: "This calculation has changes that have not been applied.",
        actions: [
          { value: "apply", label: "Apply changes", variant: "primary" },
          { value: "discard", label: "Discard changes", variant: "danger" },
          { value: "continue", label: "Keep editing" },
        ],
      });
      if (action === "discard") return true;
      if (action !== "apply") return false;
      if (validationError) {
        await showMessageBox({
          title: "Calculation cannot be applied",
          message: validationError,
          actions: [{ value: "continue", label: "Keep editing", variant: "primary" }],
        });
        return false;
      }
      onApply(expression);
      return false;
    });
    return () => registerCloseGuard(undefined);
  }, [expression, hasUnsavedChanges, onApply, registerCloseGuard, showMessageBox, validationError]);

  const copyModelJson = async () => {
    try {
      await navigator.clipboard.writeText(modelJson);
      setCopyFeedback({ json: modelJson, status: "copied" });
    } catch {
      setCopyFeedback({ json: modelJson, status: "error" });
    }
  };

  const groupNodeOnField = (
    sourcePath: ExpressionPath,
    targetPath: ExpressionPath,
    position: "before" | "after",
  ) => {
    if (!sourcePath.length || !targetPath.length || isSameExpressionPath(sourcePath, targetPath)
      || (sourcePath.length < targetPath.length
        && sourcePath.every((index, pathIndex) => index === targetPath[pathIndex]))) return;
    const sourceNode = getExpressionNode(expression, sourcePath);
    const sourceParent = getExpressionNode(expression, sourcePath.slice(0, -1));
    const sourceIndex = sourcePath[sourcePath.length - 1];
    const targetNode = getExpressionNode(expression, targetPath);
    const targetParent = getExpressionNode(expression, targetPath.slice(0, -1));
    const targetIndex = targetPath[targetPath.length - 1];
    const sourceParentPath = sourcePath.slice(0, -1);
    const targetParentPath = targetPath.slice(0, -1);
    const sameParent = isSameExpressionPath(sourceParentPath, targetParentPath);
    if (!sourceNode || !isExpressionContainer(sourceParent)
      || sourceIndex === undefined || !targetNode || !isExpressionContainer(targetParent)
      || targetIndex === undefined) return;
    const sourceOperation = sourceParent.kind === "group"
      ? getGroupArgumentOperator(sourceNode, sourceIndex)
      : null;
    const targetOperation = targetParent.kind === "group"
      ? getGroupArgumentOperator(targetNode, targetIndex)
      : null;
    const sourceComesFirst = position === "before";
    const sourceRemainingArgument = sourceParent.kind === "group" && sourceParent.arguments.length === 2
      ? sourceParent.arguments.find((_, index) => index !== sourceIndex)
      : undefined;
    const sourceRemainingOperation = sourceParent.kind === "group" && sourceRemainingArgument
      ? getGroupArgumentOperator(
        sourceRemainingArgument,
        sourceParent.arguments.indexOf(sourceRemainingArgument),
      )
      : null;
    let removed = removeExpressionNodeForMove(expression, sourcePath);
    if (!sameParent && sourceRemainingArgument && sourceRemainingOperation) {
      const remainingGroup = getExpressionNode(removed, sourceParentPath);
      if (remainingGroup?.kind === "group" && remainingGroup.arguments.length === 1) {
        removed = replaceExpressionNode(
          removed,
          sourceParentPath,
          setExpressionOperation(remainingGroup.arguments[0]!, sourceRemainingOperation),
        );
      }
    }
    const adjustedTargetPath = sourceParent.kind === "function"
      ? targetPath
      : adjustExpressionPathAfterRemoval(sourcePath, targetPath);
    const adjustedTarget = getExpressionNode(removed, adjustedTargetPath);
    if (!adjustedTarget) return;
    const adjustedTargetOperand = adjustedTarget;
    const sourceOperand = sourceNode;
    const firstOperand = sourceComesFirst ? sourceOperand : adjustedTargetOperand;
    const secondOperand = sourceComesFirst ? adjustedTargetOperand : sourceOperand;
    const firstOperation = sourceComesFirst ? sourceOperation : targetOperation;
    const secondOperation = sourceComesFirst ? targetOperation : sourceOperation;
    const grouped: IFieldDefinition = {
      kind: "group",
      ...(firstOperation ? { oper: firstOperation } : {}),
      arguments: [
        firstOperand,
        setExpressionOperation(secondOperand, secondOperation),
      ],
    };
    const updated = replaceExpressionNode(removed, adjustedTargetPath, grouped);
    setExpression(normalizeExpressionTree(updated) ?? { kind: "field", field: "" });
    setSelectedPath([...adjustedTargetPath, sourceComesFirst ? 0 : 1]);
  };

  const moveNode = (sourcePath: ExpressionPath, targetPath: ExpressionPath) => {
    if (!sourcePath.length || isSameExpressionPath(sourcePath, targetPath)
      || (sourcePath.length < targetPath.length
        && sourcePath.every((index, pathIndex) => index === targetPath[pathIndex]))) return;
    const node = getExpressionNode(expression, sourcePath);
    const sourceParent = getExpressionNode(expression, sourcePath.slice(0, -1));
    if (!node || !isExpressionContainer(sourceParent)) return;
    const sourceIndex = sourcePath[sourcePath.length - 1];
    const remainingSourceArgument = sourceParent.kind === "group" && sourceIndex !== undefined
      ? sourceParent.arguments.find((_, index) => index !== sourceIndex)
      : undefined;
    const remainingSourceOperation = sourceParent.kind === "group" && remainingSourceArgument
      ? getGroupArgumentOperator(
        remainingSourceArgument,
        sourceParent.arguments.indexOf(remainingSourceArgument),
      )
      : null;
    const sourceParentPath = sourcePath.slice(0, -1);
    const sourceContainerPath = sourceParentPath.slice(0, -1);
    const adjustedTargetPath = sourceParent.kind === "function"
      ? targetPath
      : adjustExpressionPathAfterRemoval(sourcePath, targetPath);
    const collapseIntoTarget = sourceParent.kind === "group"
      && sourceParent.arguments.length === 2
      && isSameExpressionPath(sourceContainerPath, adjustedTargetPath);
    let removed = removeExpressionNodeForMove(expression, sourcePath);
    if (sourceParent.kind === "group" && remainingSourceArgument && remainingSourceOperation) {
      const remainingGroup = getExpressionNode(removed, sourceParentPath);
      if (remainingGroup?.kind === "group" && remainingGroup.arguments.length === 1) {
        removed = replaceExpressionNode(
          removed,
          sourceParentPath,
          setExpressionOperation(remainingGroup.arguments[0]!, remainingSourceOperation),
        );
      }
    }
    const target = getExpressionNode(removed, adjustedTargetPath);
    if (!target || !isExpressionGroup(target)) return;
    const lastIndex = target.arguments.length - 1;
    const insertionIndex = collapseIntoTarget
      ? sourceParentPath[sourceParentPath.length - 1] ?? 0
      : lastIndex + 1;
    const operation = insertionIndex === 0
      ? null
      : (sourceParent.kind === "group" && sourceParent.arguments.length === 2
        ? remainingSourceOperation
        : (lastIndex < 0
      ? null
      : getGroupArgumentOperator(target.arguments[lastIndex]!, lastIndex) ?? "+"));
    const moved = setExpressionOperation(node, operation);
    const updated = updateExpressionNode(removed, adjustedTargetPath, (targetNode) =>
      isExpressionGroup(targetNode)
        ? {
          ...targetNode,
          arguments: [
            ...targetNode.arguments.slice(0, insertionIndex),
            moved,
            ...targetNode.arguments.slice(insertionIndex),
          ],
        }
        : targetNode,
    );
    setExpression(normalizeExpressionTree(updated) ?? { kind: "field", field: "" });
    setSelectedPath([...adjustedTargetPath, insertionIndex]);
  };

  const reorderNodeAroundField = (
    sourcePath: ExpressionPath,
    targetPath: ExpressionPath,
    position: "before" | "after",
  ) => {
    if (!sourcePath.length || !targetPath.length || isSameExpressionPath(sourcePath, targetPath)
      || (sourcePath.length < targetPath.length
        && sourcePath.every((index, pathIndex) => index === targetPath[pathIndex]))) return;
    const sourceNode = getExpressionNode(expression, sourcePath);
    const sourceParent = getExpressionNode(expression, sourcePath.slice(0, -1));
    const sourceIndex = sourcePath[sourcePath.length - 1];
    const targetParent = getExpressionNode(expression, targetPath.slice(0, -1));
    if (!sourceNode || sourceParent?.kind !== "group" || sourceIndex === undefined
      || targetParent?.kind !== "group") return;

    const operation = getGroupArgumentOperator(sourceNode, sourceIndex);
    const removed = removeExpressionNodeForMove(expression, sourcePath);
    const adjustedTargetPath = adjustExpressionPathAfterRemoval(sourcePath, targetPath);
    const adjustedTargetIndex = adjustedTargetPath[adjustedTargetPath.length - 1];
    const adjustedParentPath = adjustedTargetPath.slice(0, -1);
    if (adjustedTargetIndex === undefined) return;
    const insertionIndex = adjustedTargetIndex + (position === "after" ? 1 : 0);
    const updated = updateExpressionNode(removed, adjustedParentPath, (parent) => {
      if (parent.kind !== "group") return parent;
      const moved = setExpressionOperation(
        sourceNode,
        insertionIndex === 0 ? null : operation ?? "+",
      );
      return {
        ...parent,
        arguments: [
          ...parent.arguments.slice(0, insertionIndex),
          moved,
          ...parent.arguments.slice(insertionIndex),
        ],
      };
    });
    setExpression(normalizeExpressionTree(updated) ?? { kind: "field", field: "" });
    setSelectedPath([...adjustedParentPath, insertionIndex]);
  };

  const ungroupNode = (path: ExpressionPath) => {
    if (!path.length) return;
    const group = getExpressionNode(expression, path);
    const parentPath = path.slice(0, -1);
    const parent = getExpressionNode(expression, parentPath);
    const index = path[path.length - 1];
    if (group?.kind !== "group" || !isExpressionContainer(parent)
      || index === undefined || group.arguments.length === 0) return;

    const operation = parent.kind === "group"
      ? getGroupArgumentOperator(group, index)
      : group.oper ?? null;
    const ungroupedArguments = group.arguments.map((argument, argumentIndex) =>
      setExpressionOperation(
        argument,
        argumentIndex === 0 ? operation : getGroupArgumentOperator(argument, argumentIndex),
      ),
    );
    const updated = updateExpressionNode(expression, parentPath, (parentNode) =>
      isExpressionContainer(parentNode)
        ? {
          ...parentNode,
          arguments: [
            ...parentNode.arguments.slice(0, index),
            ...ungroupedArguments,
            ...parentNode.arguments.slice(index + 1),
          ],
        }
        : parentNode,
    );
    setExpression(normalizeExpressionTree(updated) ?? { kind: "field", field: "" });
    setSelectedPath([...parentPath, index]);
  };

  const startPointerDrag = (event: ReactPointerEvent<HTMLDivElement>, sourcePath: ExpressionPath) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    pendingPointerDragRef.current = { sourcePath, x: event.clientX, y: event.clientY };
    setDragPreview(undefined);
    setDragPosition(undefined);
  };

  const updatePointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    let activeDrag = pointerDrag;
    if (!activeDrag) {
      const pendingDrag = pendingPointerDragRef.current;
      if (!pendingDrag) return;
      const deltaX = event.clientX - pendingDrag.x;
      const deltaY = event.clientY - pendingDrag.y;
      if (deltaX * deltaX + deltaY * deltaY < 25) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      activeDrag = pendingDrag;
      setPointerDrag(activeDrag);
    }
    event.preventDefault();
    const root = expressionBuilderRef.current;
    const target = root ? getExpressionDropTarget(event.clientX, event.clientY, root) : undefined;
    setPointerDrag({ ...activeDrag, x: event.clientX, y: event.clientY });
    setDragPreview(target?.path);
    setDragPosition(target?.kind === "field" ? target.position : undefined);
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    pendingPointerDragRef.current = undefined;
    if (!pointerDrag) return;
    const root = expressionBuilderRef.current;
    const target = root ? getExpressionDropTarget(event.clientX, event.clientY, root) : undefined;
    if (target?.kind === "field") {
      if (target.position === "inside")
        groupNodeOnField(pointerDrag.sourcePath, target.path, "after");
      else
        reorderNodeAroundField(pointerDrag.sourcePath, target.path, target.position);
    } else if (target?.kind === "group") {
      moveNode(pointerDrag.sourcePath, target.path);
    }
    setPointerDrag(undefined);
    setDragPreview(undefined);
    setDragPosition(undefined);
  };

  const cancelPointerDrag = () => {
    pendingPointerDragRef.current = undefined;
    setPointerDrag(undefined);
    setDragPreview(undefined);
    setDragPosition(undefined);
  };

  useEffect(() => {
    if (selectedPath === undefined) return;

    const deleteSelectedExpression = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))
      ) return;

      const isInsideEditor = target instanceof Node && expressionBuilderRef.current?.contains(target);
      if (!isInsideEditor && document.activeElement !== document.body) return;

      event.preventDefault();
      setExpression((current) => removeExpressionNode(current, selectedPath));
      setSelectedPath(undefined);
    };
    const clearSelectionOutsideEditor = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && expressionBuilderRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".field-box-menu-popup")) return;
      setSelectedPath(undefined);
    };

    document.addEventListener("keydown", deleteSelectedExpression);
    document.addEventListener("pointerdown", clearSelectionOutsideEditor);
    return () => {
      document.removeEventListener("keydown", deleteSelectedExpression);
      document.removeEventListener("pointerdown", clearSelectionOutsideEditor);
    };
  }, [selectedPath]);

  const draggedNode = pointerDrag ? getExpressionNode(expression, pointerDrag.sourcePath) : undefined;

  return (
    <FieldBoxPopupContext.Provider value={popupManager}>
      <div
        ref={expressionBuilderRef}
        className="expression-builder"
        data-debug-ui={expressionDebugUiEnabled}
        onClick={() => setSelectedPath(undefined)}
        onPointerMove={updatePointerDrag}
        onPointerUp={finishPointerDrag}
        onPointerCancel={cancelPointerDrag}
      >
        <NodeEditor
          expression={expression}
          entity={entity}
          metadata={metadata}
          joinedContexts={joinedContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          path={[]}
          onPointerDragStart={startPointerDrag}
          dragPreview={dragPreview}
          dragPosition={dragPosition}
          onChange={setExpression}
          selectionPath={[]}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          onUngroup={ungroupNode}
          root
        />

        {pointerDrag && draggedNode && (
          <div
            className="expression-drag-preview"
            style={{ left: pointerDrag.x + 12, top: pointerDrag.y + 12 }}
            aria-hidden="true"
          >
            {formatExpression(draggedNode)}
          </div>
        )}

        <div className="expression-preview" aria-live="polite">
          <span className="expression-preview-label">PREVIEW</span>
          <code>{formatExpression(expression)}</code>
          <div className="expression-debug-panel">
            <div className="expression-preview-json-heading">
              <span className="expression-preview-label">MODEL JSON</span>
              <button
                type="button"
                className="expression-preview-copy"
                aria-label="Copy JSON model"
                title="Copy JSON model"
                onClick={copyModelJson}
              >
                <Icon name={copyStatus === "copied" ? "check" : "copy"} size={13} />
              </button>
              {copyStatus && (
                <span className={`expression-preview-copy-status${copyStatus === "error" ? " expression-preview-copy-error" : ""}`} role="status">
                  {copyStatus === "copied" ? "Copied" : "Copy failed. Check clipboard permissions."}
                </span>
              )}
            </div>
            <pre className="expression-preview-json"><code>{modelJson}</code></pre>
          </div>
        </div>

        <footer className="expression-builder-footer">
          <div className="expression-builder-actions">
            <button
              type="button"
              className="expression-apply-button"
              disabled={Boolean(validationError)}
              onClick={() => onApply(expression)}
            >
              <Icon name="check" size={14} />
              Apply
            </button>
          </div>
        </footer>
      </div>
    </FieldBoxPopupContext.Provider>
  );
}
