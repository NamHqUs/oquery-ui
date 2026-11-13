import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode, type TextareaHTMLAttributes } from "react";
import Icon, { type IconName } from "../icon/icon";
import type { FunctionDefinition } from "../function-definition/types";
import type { DomainRelation, FilterOperatorDefinition, MetadataEntity } from "../query-builder/query-design/query-builder-slice";
import { getOQueryContextKeys } from "../query-builder/query-design/oquery-context-colors";
import { applyFoldedOqueryEdit, getFoldedOquery, getOqueryFolds } from "../query-builder/query-design/oquery-folding";
import { getOQueryCompletions, type OQueryCompletion, type OQuerySuggestionEntity } from "./oquery-completions";
import { processOQueryKeyboard, replaceTextareaSelection } from "./oquery-editor-keyboard";
import { normalizeOqueryEditorText } from "./oquery-editor-text";
import type { OQueryErrorPosition } from "./oquery-validation";
import "../query-builder/query-design/query-design.css";

type OQueryEditorProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value?: string;
  initialText?: string;
  textOverride?: string;
  onTextChange: (text: string) => void;
  domain: {
    id: string;
    name: string;
    description?: string;
    entities: MetadataEntity[];
    relations: DomainRelation[];
  };
  highlight?: (text: string) => ReactNode;
  oquery?: boolean;
  functionDefinitions: FunctionDefinition[];
  operators: FilterOperatorDefinition[];
  suggestionFields?: string[];
  suggestionEntities?: string[];
  suggestionEntityName?: string;
  suggestionEntitiesMetadata?: OQuerySuggestionEntity[];
  errorFunctionName?: string;
  errorPosition?: OQueryErrorPosition | null;
  compact?: boolean;
  showGutter?: boolean;
  showLineNumbers?: boolean;
  showContextRunAlways?: boolean;
  showFoldControls?: boolean;
  onSelectionChange?: (text: string) => void;
  onExecuteSelectedText?: (text: string) => void;
  onExecuteContext?: (contextName: string) => void;
};

export type OQueryEditorHandle = {
  getText: () => string;
  setText: (text: string) => void;
};

function highlightOquery(text: string, functionDefinitions: FunctionDefinition[], errorFunctionName: string): string {
  const keys = getOQueryContextKeys(text);
  let position = 0;
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(highlightOqueryTokens(text.slice(position, key.start), functionDefinitions, errorFunctionName));
    const name = text.slice(key.start, key.end)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
    const className = key.kind === "table"
      ? "query-oquery-table-key"
      : "query-oquery-context-key";
    parts.push(`<span class="${className}">${name}</span>`);
    position = key.end;
  }
  parts.push(highlightOqueryTokens(text.slice(position), functionDefinitions, errorFunctionName));
  return parts.join("");
}

function highlightOqueryTokens(text: string, functionDefinitions: FunctionDefinition[], errorFunctionName: string): string {
  if (text.includes("\n")) {
    return text.split("\n")
      .map((line) => highlightOqueryTokens(line, functionDefinitions, errorFunctionName))
      .join("\n");
  }
  const commentStart = findCommentStart(text);
  if (commentStart >= 0) {
    return `${highlightOqueryTokens(text.slice(0, commentStart), functionDefinitions, errorFunctionName)}<span class="query-oquery-comment">${text.slice(commentStart)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;").replaceAll("'", "&#39;")}</span>`;
  }
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

  const builtinFunctions = new Set(
    functionDefinitions.filter((definition) => definition.isBuiltin).map((definition) => definition.name),
  );
  const customFunctions = new Set(
    functionDefinitions
      .filter((definition) => !definition.isBuiltin && !builtinFunctions.has(definition.name))
      .map((definition) => definition.name),
  );
  const functionNames = [...builtinFunctions, ...customFunctions]
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const highlightedFunctions = functionNames.length
    ? escaped.replace(new RegExp(`\\b(${functionNames.join("|")})(?=\\s*\\()`, "gi"), (match) => {
      const className = errorFunctionName && match.toLocaleLowerCase() === errorFunctionName.toLocaleLowerCase()
        ? "query-oquery-function query-oquery-error-function"
        : "query-oquery-function";
      return `<span class="${className}">${match}</span>`;
    })
    : escaped;

  return highlightedFunctions.replace(
    /\b(where|order|skip|take|join|left|inner|right|full|on|asc|desc|and|or|is|in|between|not|like|contains|null|true|false)\b/gi,
    "<span class=\"query-oquery-protected-key\">$1</span>",
  );
}

function highlightSelectedOccurrences(html: string, selection: string): string {
  if (!selection || selection.includes("\n")) return html;
  const escapedSelection = selection
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
  return html.split(/(<[^>]*>)/g).map((part) =>
    part.startsWith("<")
      ? part
      : part.split(escapedSelection).join(`<mark class="query-oquery-match">${escapedSelection}</mark>`),
  ).join("");
}

function findCommentStart(text: string): number {
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
    } else if (character === "#") {
      return index;
    }
  }
  return -1;
}

function getOqueryCaretPosition(textarea: HTMLTextAreaElement, position: number) {
  const style = window.getComputedStyle(textarea);
  const beforeCaret = textarea.value.slice(0, position);
  const lineStart = beforeCaret.lastIndexOf("\n") + 1;
  const line = beforeCaret.slice(lineStart);
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.6;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const textWidth = context?.measureText(line).width ?? line.length * (Number.parseFloat(style.fontSize) || 13) * .6;
  return {
    left: paddingLeft + textWidth - textarea.scrollLeft,
    top: paddingTop + (beforeCaret.match(/\n/g)?.length ?? 0) * lineHeight + lineHeight - textarea.scrollTop,
  };
}

function getOqueryErrorMarkerStyle(
  textarea: HTMLTextAreaElement,
  position: OQueryErrorPosition,
): CSSProperties {
  const lines = textarea.value.split("\n");
  const lineOffset = lines.slice(0, Math.max(0, position.line - 1)).reduce((total, line) => total + line.length + 1, 0);
  const start = Math.min(textarea.value.length, lineOffset + Math.max(0, position.column - 1));
  const end = Math.min(textarea.value.length, start + position.length);
  const startPosition = getOqueryCaretPosition(textarea, start);
  const endPosition = getOqueryCaretPosition(textarea, end);
  const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20.8;
  return {
    left: startPosition.left,
    top: startPosition.top - lineHeight,
    width: Math.max(4, endPosition.left - startPosition.left),
    height: lineHeight,
  };
}

function getCompletionIcon(kind: OQueryCompletion["kind"]): IconName {
  switch (kind) {
    case "field": return "key";
    case "relation": return "link";
    case "context": return "schema";
    case "function": return "function";
    case "operator": return "operator";
    case "value": return "type";
    case "entity": return "table";
    case "alias": return "type";
    default: return "code";
  }
}

function highlightCompletionLabel(label: string, query: string): ReactNode {
  if (!query) return label;
  const index = label.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return label;
  return <>
    {label.slice(0, index)}
    <mark>{label.slice(index, index + query.length)}</mark>
    {label.slice(index + query.length)}
  </>;
}

function getDoubleClickSelection(textarea: HTMLTextAreaElement): string {
  const { selectionStart, selectionEnd } = textarea;
  let end = selectionEnd;
  while (end > selectionStart && textarea.value[end - 1] === " ") end--;
  if (end !== selectionEnd) textarea.setSelectionRange(selectionStart, end);
  return textarea.value.slice(selectionStart, end);
}

const OqueryTextEditor = forwardRef<OQueryEditorHandle, OQueryEditorProps>(({
  value,
  initialText,
  textOverride,
  disabled,
  onTextChange,
  onBlur,
  domain,
  functionDefinitions,
  operators,
  errorFunctionName = "",
  errorPosition = null,
  compact = false,
  showGutter = true,
  showLineNumbers = true,
  showContextRunAlways = false,
  showFoldControls = true,
  onSelectionChange = () => undefined,
  onExecuteContext,
  suggestionFields = [],
  suggestionEntities = [],
  suggestionEntityName = "",
  suggestionEntitiesMetadata = [],
  ...props
}, ref) => {
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorMarkerRef = useRef<HTMLSpanElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [text, setInternalText] = useState(() =>
    normalizeOqueryEditorText(textOverride ?? initialText ?? value ?? ""));
  const [selectedText, setSelectedText] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [foldMessage, setFoldMessage] = useState("");
  const [completionPosition, setCompletionPosition] = useState<number | null>(null);
  const [completionIndex, setCompletionIndex] = useState(0);
  useLayoutEffect(() => {
    if (textOverride === undefined) return;
    const normalizedText = normalizeOqueryEditorText(textOverride);
    if (normalizedText !== text) {
      setInternalText(normalizedText);
    }
  }, [textOverride, text]);
  useImperativeHandle(ref, () => ({
    getText: () => text,
    setText: (nextText: string) => {
      undoStackRef.current = [];
      redoStackRef.current = [];
      setInternalText(normalizeOqueryEditorText(nextText));
    },
  }), [text]);
  const projection = getFoldedOquery(text, collapsed);
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    const selection = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    textareaRef.current?.setSelectionRange(selection?.start ?? caret, selection?.end ?? caret);
  }, [projection.text]);
  const visibleLines = new Set(projection.visible.map(item => item.line));
  const folds = getOqueryFolds(text);
  const foldsByLine = new Map(folds.map(fold => [fold.start, fold]));
  const hasVisibleFoldControls = showFoldControls
    && projection.visible.some(({ line }) => foldsByLine.has(line));
  const contextAtLine = (line: string) =>
    line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|is\s+[A-Za-z_][A-Za-z0-9_]*\s*:)/i)?.[1]
      ?? null;
  const hasVisibleContextActions = Boolean(onExecuteContext)
    && projection.visible.some(({ line }) => contextAtLine(text.split("\n")[line]!) !== null);
  const hasGutterContent = showLineNumbers || hasVisibleFoldControls || hasVisibleContextActions || showContextRunAlways;
  const compactHeight = Math.max(1, projection.visible.length) * 20.8 + 34;
  const changeVisibleText = (next: string, caret?: number, selectionEnd?: number) => {
    const updated = applyFoldedOqueryEdit(text, collapsed, next);
    if (updated === null) {
      setCollapsed(new Set());
      setFoldMessage("Blocks expanded: retry the edit so hidden OQuery text is not accidentally removed.");
      return;
    }
    let nextCaret = caret;
    if (next.split("\n").length !== projection.text.split("\n").length) {
      if (caret !== undefined) {
        let start = 0;
        while (start < projection.text.length && start < next.length && projection.text[start] === next[start]) start++;
        const row = [...projection.visible].reverse().find(item => item.offset <= start)!;
        nextCaret = caret + row.source - row.offset;
      }
      setCollapsed(new Set());
    }
    setFoldMessage("");
    if (updated !== text) {
      undoStackRef.current.push(text);
      redoStackRef.current = [];
    }
    if (nextCaret !== undefined) {
      pendingCaretRef.current = nextCaret;
      pendingSelectionRef.current = {
        start: nextCaret,
        end: selectionEnd ?? nextCaret,
      };
    }
    setInternalText(updated);
    onTextChange(updated);
  };
  const undo = () => {
    const previous = undoStackRef.current.pop();
    if (previous === undefined) return;
    redoStackRef.current.push(text);
    pendingCaretRef.current = previous.length;
    pendingSelectionRef.current = { start: previous.length, end: previous.length };
    setInternalText(previous);
    onTextChange(previous);
  };
  const redo = () => {
    const next = redoStackRef.current.pop();
    if (next === undefined) return;
    undoStackRef.current.push(text);
    pendingCaretRef.current = next.length;
    pendingSelectionRef.current = { start: next.length, end: next.length };
    setInternalText(next);
    onTextChange(next);
  };
  const completionResult = completionPosition === null
    ? null
    : getOQueryCompletions(projection.text, completionPosition, suggestionFields, operators, suggestionEntities, functionDefinitions, suggestionEntityName, suggestionEntitiesMetadata);
  const completions = completionResult?.items ?? [];
  const completionQuery = completionResult
    ? projection.text.slice(completionResult.replaceStart, completionResult.replaceEnd)
    : "";
  const completionStyle = completionPosition === null || !textareaRef.current
    ? undefined
    : getOqueryCaretPosition(textareaRef.current, completionPosition);
  const errorMarkerStyle = errorPosition && textareaRef.current
    ? getOqueryErrorMarkerStyle(textareaRef.current, errorPosition)
    : undefined;
  const applyCompletion = (completion: OQueryCompletion) => {
    if (!completionResult) return;
    const next = `${projection.text.slice(0, completionResult.replaceStart)}${completion.insertText}${projection.text.slice(completionResult.replaceEnd)}`;
    const caret = completionResult.replaceStart + (completion.cursorOffset ?? completion.insertText.length);
    changeVisibleText(next, caret);
    setCompletionPosition(completion.kind === "entity" ? caret : null);
    setCompletionIndex(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const updateCompletionPosition = (textarea: HTMLTextAreaElement, open = true) => {
    setCompletionPosition(open ? textarea.selectionStart : null);
    setCompletionIndex(0);
  };
  const isCompletionTrigger = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const inputEvent = event.nativeEvent as InputEvent;
    const caret = event.currentTarget.selectionStart;
    const insertedCharacter = inputEvent.data
      ?? event.currentTarget.value.slice(Math.max(0, caret - 1), caret);
    const isCompletionStopCharacter = ",<>()[]{}=!:;+-*/%&|#".includes(insertedCharacter);
    return inputEvent.inputType === "insertText"
      && insertedCharacter.length === 1
      && !/\s/.test(insertedCharacter)
      && !isCompletionStopCharacter;
  };

  return (
    <>
    <div className={`query-oquery-code-editor${showGutter && hasGutterContent ? "" : " no-gutter"}${showLineNumbers ? "" : " no-line-numbers"}${showFoldControls ? "" : " no-fold-controls"}${showContextRunAlways ? " show-context-run-always" : ""}`} style={compact ? { height: `${compactHeight}px` } : undefined}>
      {showGutter && hasGutterContent && <div ref={lineNumbersRef} className="query-oquery-line-numbers">
        {projection.visible.map(({ line }) => {
          const fold = foldsByLine.get(line);
          const contextName = contextAtLine(text.split("\n")[line]!);
          return <div key={line} className="query-oquery-gutter-line">
            {showLineNumbers && <span aria-hidden="true">{line + 1}</span>}
            {showFoldControls && fold && <button type="button" disabled={disabled}
              aria-label={`${collapsed.has(line) ? "Expand" : "Collapse"} ${fold.label} at line ${line + 1}`}
              aria-expanded={!collapsed.has(line)}
              className={`query-oquery-fold-button${collapsed.has(line) ? " collapsed" : ""}`}
              title={`${collapsed.has(line) ? "Expand" : "Collapse"} ${fold.end - fold.start} lines`}
              onClick={() => setCollapsed(previous => {
                const next = new Set(previous);
                if (next.has(line)) next.delete(line); else next.add(line);
                return next;
              })} />}
            {contextName && onExecuteContext && <button
              type="button"
              className="query-oquery-context-run"
              disabled={disabled}
              aria-label={`Run ${contextName} context`}
              title={`Run ${contextName} context`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onExecuteContext(contextName)}
            >
              <Icon name="play" size={14} />
            </button>}
          </div>;
        })}
      </div>}
      <pre
        ref={highlightRef}
        className="query-oquery-highlight"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlightSelectedOccurrences(highlightOquery(text, functionDefinitions, errorFunctionName), selectedText)
          .split("\n").flatMap((text, line) => !visibleLines.has(line) ? [] : [
            collapsed.has(line) && foldsByLine.has(line)
              ? `<span class="query-oquery-collapsed-line">${text}</span>`
              : text,
          ]).join("\n") || " " }}
      />
      {errorMarkerStyle && <span ref={errorMarkerRef} className="query-oquery-error-position" aria-hidden="true" style={errorMarkerStyle} />}
      <textarea
        ref={textareaRef}
        className="query-oquery-textarea"
        aria-label="Query OQuery text"
        value={projection.text}
        onChange={(event) => {
          changeVisibleText(event.target.value, textareaRef.current?.selectionStart);
          updateCompletionPosition(event.currentTarget, isCompletionTrigger(event));
        }}
        onPaste={(event) => {
          event.preventDefault();
          const textarea = event.currentTarget;
          const pastedText = normalizeOqueryEditorText(event.clipboardData.getData("text/plain"));
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const isRowPaste = start === end && pastedText.endsWith("\n");
          const insertionStart = isRowPaste
            ? textarea.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1
            : start;
          const nextCaret = start + pastedText.length;
          const next = `${textarea.value.slice(0, insertionStart)}${pastedText}${textarea.value.slice(isRowPaste ? insertionStart : end)}`;
          if (isRowPaste) {
            changeVisibleText(next, nextCaret);
            return;
          }
          const nativeEditApplied = replaceTextareaSelection(
            textarea,
            pastedText,
            insertionStart,
            isRowPaste ? insertionStart : end,
            nextCaret,
            nextCaret,
          );
          if (!nativeEditApplied) changeVisibleText(next, nextCaret);
        }}
        onSelect={(event) => {
          const textarea = event.currentTarget;
          const selection = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
          setSelectedText(selection);
          onSelectionChange(selection);
        }}
        onDoubleClick={(event) => {
          const selection = getDoubleClickSelection(event.currentTarget);
          setSelectedText(selection);
          onSelectionChange(selection);
          props.onDoubleClick?.(event);
        }}
        onBlur={(event) => {
          const textarea = event.currentTarget;
          const selection = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
          setSelectedText(selection);
          onSelectionChange(selection);
          onBlur?.(event);
          window.setTimeout(() => setCompletionPosition(null), 0);
        }}
        onKeyDown={(event) => processOQueryKeyboard(event, {
          completions,
          completionIndex,
          completionPosition,
          text,
          collapsed,
          projectionText: projection.text,
          updateCompletionPosition,
          setCompletionIndex,
          setCompletionPosition,
          applyCompletion,
          changeVisibleText,
          setFoldMessage,
          pendingCaretRef,
          undo,
          redo,
          onExecuteSelectedText: props.onExecuteSelectedText,
        })}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
          if (errorPosition && errorMarkerRef.current) {
            Object.assign(errorMarkerRef.current.style, getOqueryErrorMarkerStyle(event.currentTarget, errorPosition));
          }
        }}
        spellCheck={false}
        disabled={disabled}
      />
      {completions.length > 0 && !disabled && <div
        className="query-oquery-completions"
        role="listbox"
        aria-label="OQuery suggestions"
        style={completionStyle}
        onMouseDown={(event) => event.preventDefault()}
      >
        {completions.map((completion, index) => <button
          type="button"
          role="option"
          aria-selected={index === completionIndex}
          className={index === completionIndex ? "selected" : ""}
          key={`${completion.kind}-${completion.label}`}
          onClick={() => applyCompletion(completion)}
        >
          <span className={`query-oquery-completion-kind ${completion.kind}`} title={completion.kind}>
            <Icon name={getCompletionIcon(completion.kind)} size={13} />
          </span>
          <span className="query-oquery-completion-label">{highlightCompletionLabel(completion.label, completionQuery)}</span>
        </button>)}
      </div>}
    </div>
    {foldMessage && <p className="query-message" role="status">{foldMessage}</p>}
    </>
  );
});

const OQueryEditor = forwardRef<OQueryEditorHandle, OQueryEditorProps>((props, ref) => {
  if (props.oquery) return <OqueryTextEditor {...props} ref={ref} />;
  const {
    onTextChange, highlight, value, onSelectionChange, onExecuteSelectedText,
    oquery, domain, operators, functionDefinitions, errorFunctionName, compact, showGutter, showFoldControls,
    onDoubleClick, ...textareaProps
  } = props;
  const selectionText = (textarea: HTMLTextAreaElement) => textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  return (
    <div className="oquery-editor">
      {highlight && <pre className="oquery-editor-highlight" aria-hidden="true">{highlight(String(value ?? "")) || " "}</pre>}
      <textarea {...textareaProps} value={value} onChange={(event) => onTextChange(event.target.value)}
        onSelect={(event) => onSelectionChange?.(selectionText(event.currentTarget))}
        onDoubleClick={(event) => {
          onSelectionChange?.(getDoubleClickSelection(event.currentTarget));
          onDoubleClick?.(event);
        }}
        onBlur={(event) => { onSelectionChange?.(selectionText(event.currentTarget)); textareaProps.onBlur?.(event); }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            const selected = selectionText(event.currentTarget);
            if (selected) { event.preventDefault(); onExecuteSelectedText?.(selected); }
          }
          textareaProps.onKeyDown?.(event);
        }} />
    </div>
  );
});

OQueryEditor.displayName = "OQueryEditor";
export default OQueryEditor;
