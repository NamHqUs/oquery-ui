import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import Icon, { type IconName } from "../icon/icon";
import type { FunctionDefinition } from "../function-definition/types";
import { getOQueryContextKeys } from "../query-builder/query-design/oquery-context-colors";
import { applyFoldedOqueryEdit, getFoldedOquery, getOqueryFolds } from "../query-builder/query-design/oquery-folding";
import { toggleOqueryComments } from "./oquery-comments";
import { getOQueryCompletions, type OQueryCompletion, type OQuerySuggestionEntity } from "./oquery-completions";
import { normalizeOqueryEditorText } from "./oquery-editor-text";
import "../query-builder/query-design/query-design.css";

type OQueryEditorProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value?: string;
  initialText?: string;
  textOverride?: string;
  onTextChange: (text: string) => void;
  highlight?: (text: string) => ReactNode;
  oquery?: boolean;
  functionDefinitions?: FunctionDefinition[];
  suggestionFields?: string[];
  suggestionEntities?: string[];
  suggestionEntityName?: string;
  suggestionEntitiesMetadata?: OQuerySuggestionEntity[];
  errorFunctionName?: string;
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

const oqueryListSections = new Set(["Projection", "Sorts", "Contexts"]);

function getOqueryLineContext(value: string, position: number) {
  const beforeCursor = value.slice(0, position);
  const lineStart = beforeCursor.lastIndexOf("\n") + 1;
  const currentLine = beforeCursor.slice(lineStart);
  const lines = value.slice(0, lineStart).split(/\r?\n/);
  const currentIndentation = currentLine.match(/^\s*/)?.[0] ?? "";
  const keyHeaders = lines.flatMap((line) => {
    const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(line);
    return match ? [{ indentation: match[1]!, name: match[2]! }] : [];
  });
  const parentHeader = [...keyHeaders]
    .reverse()
    .find((header) => header.indentation.length < currentIndentation.length)
    ?? keyHeaders[keyHeaders.length - 1];

  return {
    beforeCursor,
    lineStart,
    currentLine,
    section: parentHeader?.name ?? "",
    sectionIndentation: parentHeader?.indentation ?? "",
  };
}

function getOqueryEnterEdit(value: string, selectionStart: number, selectionEnd: number) {
  const { beforeCursor, lineStart, currentLine, section, sectionIndentation } = getOqueryLineContext(value, selectionStart);
  const afterCursor = value.slice(selectionEnd);
  const isListSection = oqueryListSections.has(section);
  const trimmedLine = currentLine.trim();
  const sectionHeader = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(trimmedLine);
  const isListSectionHeader = sectionHeader ? oqueryListSections.has(sectionHeader[1]!) : false;
  const isTopLevelKey = !/^\s/.test(currentLine)
    && /^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(trimmedLine);
  const isEmptyListItem = /^-\s*$/.test(trimmedLine);

  if (isEmptyListItem) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    const parentIndentation = indentation.slice(0, Math.max(0, indentation.length - 2));
    const normalizedBeforeCursor = `${value.slice(0, lineStart)}${parentIndentation}`;
    return {
      value: `${normalizedBeforeCursor}${afterCursor}`,
      caret: normalizedBeforeCursor.length,
    };
  }

  if (!trimmedLine) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    if (!indentation) {
      const inserted = "\n";
      return {
        value: `${beforeCursor}${inserted}${afterCursor}`,
        caret: beforeCursor.length + inserted.length,
      };
    }
    const parentIndentation = indentation.slice(0, Math.max(0, indentation.length - 2));
    const normalizedBeforeCursor = `${value.slice(0, lineStart)}${parentIndentation}`;
    return {
      value: `${normalizedBeforeCursor}${afterCursor}`,
      caret: normalizedBeforeCursor.length,
    };
  }

  if ((!isListSection && !isListSectionHeader) || (isTopLevelKey && !isListSectionHeader)) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    return {
      value: `${beforeCursor}\n${indentation}${afterCursor}`,
      caret: beforeCursor.length + indentation.length + 1,
    };
  }

  if (isListSectionHeader) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    const inserted = `\n${indentation}  - `;
    return {
      value: `${beforeCursor}${inserted}${afterCursor}`,
      caret: beforeCursor.length + inserted.length,
    };
  }

  const itemText = trimmedLine.replace(/^-+\s*/, "");
  const listIndentation = `${sectionIndentation}  `;
  const normalizedLine = `${listIndentation}- ${itemText}`;
  const normalizedBeforeCursor = `${value.slice(0, lineStart)}${normalizedLine}`;
  const inserted = `\n${listIndentation}- `;
  return {
    value: `${normalizedBeforeCursor}${inserted}${afterCursor}`,
    caret: normalizedBeforeCursor.length + inserted.length,
  };
}

function getSelectedLineEdit(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  operation: "indent" | "outdent" | "delete",
) {
  const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  if (selectionStart === selectionEnd) {
    const line = value.slice(start, value.indexOf("\n", selectionStart) < 0
      ? value.length
      : value.indexOf("\n", selectionStart));
    if (operation === "indent") {
      return {
        value: `${value.slice(0, start)}  ${value.slice(start)}`,
        selectionStart: selectionStart + 2,
        selectionEnd: selectionEnd + 2,
      };
    }
    if (operation === "delete") {
      const lineEnd = value.indexOf("\n", selectionStart);
      const end = lineEnd < 0 ? value.length : lineEnd + 1;
      return {
        value: `${value.slice(0, start)}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start,
      };
    }

    const removed = line.match(/^ {1,2}/)?.[0].length ?? 0;
    return {
      value: `${value.slice(0, start)}${value.slice(start + removed)}`,
      selectionStart: Math.max(start, selectionStart - removed),
      selectionEnd: Math.max(start, selectionEnd - removed),
    };
  }

  const selectedEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
    ? selectionEnd - 1
    : selectionEnd;
  const lineEndIndex = value.indexOf("\n", selectedEnd);
  const end = lineEndIndex < 0 ? value.length : lineEndIndex + 1;
  const selectedLines = value.slice(start, end).split("\n");

  if (operation === "delete") {
    return {
      value: `${value.slice(0, start)}${value.slice(end)}`,
      selectionStart: start,
      selectionEnd: start,
    };
  }

  const updatedLines = selectedLines.map((line) => operation === "indent"
    ? `  ${line}`
    : line.replace(/^ {1,2}/, ""));
  const replacement = updatedLines.join("\n");
  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart: start,
    selectionEnd: start + replacement.length,
  };
}
const OqueryTextEditor = forwardRef<OQueryEditorHandle, OQueryEditorProps>(({
  value,
  initialText,
  textOverride,
  disabled,
  onTextChange,
  onBlur,
  functionDefinitions = [],
  errorFunctionName = "",
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
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const [text, setInternalText] = useState(() =>
    normalizeOqueryEditorText(textOverride ?? initialText ?? value ?? ""));
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [foldMessage, setFoldMessage] = useState("");
  const [completionPosition, setCompletionPosition] = useState<number | null>(null);
  const [completionIndex, setCompletionIndex] = useState(0);
  useLayoutEffect(() => {
    if (textOverride === undefined) return;
    const normalizedText = normalizeOqueryEditorText(textOverride);
    if (normalizedText !== text) setInternalText(normalizedText);
  }, [textOverride, text]);
  useImperativeHandle(ref, () => ({
    getText: () => text,
    setText: (nextText: string) => setInternalText(normalizeOqueryEditorText(nextText)),
  }), [text]);
  const projection = getFoldedOquery(text, collapsed);
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    textareaRef.current?.setSelectionRange(caret, caret);
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
  const hasGutterContent = showLineNumbers || hasVisibleFoldControls || hasVisibleContextActions;
  const compactHeight = Math.max(1, projection.visible.length) * 20.8 + 34;
  const changeVisibleText = (next: string, caret?: number) => {
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
    if (nextCaret !== undefined)
      pendingCaretRef.current = nextCaret;
    setInternalText(updated);
    onTextChange(updated);
  };
  const completionResult = completionPosition === null
    ? null
    : getOQueryCompletions(projection.text, completionPosition, suggestionFields, [], suggestionEntities, functionDefinitions, suggestionEntityName, suggestionEntitiesMetadata);
  const completions = completionResult?.items ?? [];
  const completionQuery = completionResult
    ? projection.text.slice(completionResult.replaceStart, completionResult.replaceEnd)
    : "";
  const completionStyle = completionPosition === null || !textareaRef.current
    ? undefined
    : getOqueryCaretPosition(textareaRef.current, completionPosition);
  const applyCompletion = (completion: OQueryCompletion) => {
    if (!completionResult) return;
    const next = `${projection.text.slice(0, completionResult.replaceStart)}${completion.insertText}${projection.text.slice(completionResult.replaceEnd)}`;
    const caret = completionResult.replaceStart + (completion.cursorOffset ?? completion.insertText.length);
    changeVisibleText(next, caret);
    setCompletionPosition(completion.kind === "entity" ? caret : null);
    setCompletionIndex(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const insertFunction = (name: string) => {
    if (!name) return;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? projection.text.length;
    const end = textarea?.selectionEnd ?? start;
    const insertText = `${name}()`;
    changeVisibleText(`${projection.text.slice(0, start)}${insertText}${projection.text.slice(end)}`, start + name.length + 1);
    setCompletionPosition(null);
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
    <div className={`query-oquery-code-editor${showGutter && hasGutterContent ? "" : " no-gutter"}${showLineNumbers ? "" : " no-line-numbers"}${hasVisibleFoldControls ? "" : " no-fold-controls"}${showContextRunAlways ? " show-context-run-always" : ""}`} style={compact ? { height: `${compactHeight}px` } : undefined}>
      {showFoldControls && <div className="query-oquery-fold-actions" role="toolbar" aria-label="OQuery folding">
        <button type="button" disabled={disabled || !folds.length}
          aria-label="Collapse all OQuery sections" title="Collapse all OQuery sections"
          onClick={() => setCollapsed(new Set(folds.map(fold => fold.start)))}>
          <Icon name="chevron-down" size={13} />
        </button>
        <button type="button" disabled={disabled || !collapsed.size}
          aria-label="Expand all OQuery sections" title="Expand all OQuery sections"
          onClick={() => setCollapsed(new Set())}>
          <Icon name="chevron-right" size={13} />
        </button>
      </div>}
      {functionDefinitions.length > 0 && <label className="query-oquery-function-picker">
        <span>Insert function</span>
        <select
          aria-label="Insert function"
          value=""
          disabled={disabled}
          onChange={(event) => insertFunction(event.target.value)}
        >
          <option value="">Function...</option>
          {functionDefinitions.map((definition) => <option key={definition.name} value={definition.name}>
            {definition.name}{definition.isAggregate ? " · aggregate" : ""}
          </option>)}
        </select>
      </label>}
      {showGutter && <div ref={lineNumbersRef} className="query-oquery-line-numbers">
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
        dangerouslySetInnerHTML={{ __html: highlightOquery(text, functionDefinitions, errorFunctionName)
          .split("\n").flatMap((text, line) => !visibleLines.has(line) ? [] : [
            collapsed.has(line) && foldsByLine.has(line)
              ? `<span class="query-oquery-collapsed-line">${text}</span>`
              : text,
          ]).join("\n") || " " }}
      />
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
          const next = `${textarea.value.slice(0, start)}${pastedText}${textarea.value.slice(end)}`;
          changeVisibleText(next, start + pastedText.length);
        }}
        onSelect={(event) => {
          const textarea = event.currentTarget;
          onSelectionChange(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd));
        }}
        onBlur={(event) => {
          const textarea = event.currentTarget;
          onSelectionChange(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd));
          onBlur?.(event);
          window.setTimeout(() => setCompletionPosition(null), 0);
        }}
        onKeyDown={(event) => {
          const textarea = event.currentTarget;
          if ((event.ctrlKey || event.metaKey) && event.key === " ") {
            event.preventDefault();
            updateCompletionPosition(textarea);
            return;
          }
          const isPrintableCharacter = event.key.length === 1
            && !event.ctrlKey && !event.metaKey && !event.altKey
            && !/\s/.test(event.key);
          if (completions.length) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCompletionIndex(index => (index + 1) % completions.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCompletionIndex(index => (index - 1 + completions.length) % completions.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              applyCompletion(completions[completionIndex]!);
              return;
            }
          }
          if (!isPrintableCharacter) setCompletionPosition(null);
          if (event.key === "Escape" && completionPosition !== null) {
            event.preventDefault();
            setCompletionPosition(null);
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
            event.preventDefault();
            const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
            const lineEnd = textarea.value.indexOf("\n", textarea.selectionStart);
            const lineSelectionEnd = lineEnd < 0 ? textarea.value.length : lineEnd + 1;
            textarea.setSelectionRange(lineStart, lineSelectionEnd);
            if (!document.execCommand("cut")) {
              const edit = getSelectedLineEdit(
                textarea.value,
                lineStart,
                lineSelectionEnd,
                "delete",
              );
              changeVisibleText(edit.value, edit.selectionStart);
            }
            return;
          }
          if (event.key === "Tab") {
            event.preventDefault();
            const edit = getSelectedLineEdit(
              textarea.value,
              textarea.selectionStart,
              textarea.selectionEnd,
              event.shiftKey ? "outdent" : "indent",
            );
            changeVisibleText(edit.value, edit.selectionStart);
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "/") {
            event.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const toggled = toggleOqueryComments(projection.text, start, end);
            if (toggled.text === projection.text) return;
            if (applyFoldedOqueryEdit(text, collapsed, toggled.text) === null) {
              changeVisibleText(toggled.text);
              return;
            }
            textarea.setSelectionRange(toggled.start, toggled.end);
            // A native edit keeps the comment toggle in the textarea's undo history.
            if (!textarea.ownerDocument.execCommand("insertText", false, toggled.replacement)) {
              textarea.setSelectionRange(start, end);
              setFoldMessage("Unable to toggle comments: this browser does not support undoable textarea edits.");
              return;
            }
            pendingCaretRef.current = null;
            const caret = Math.min(start, toggled.start + toggled.replacement.length);
            textarea.setSelectionRange(caret, caret);
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
            if (selected) {
              event.preventDefault();
              props.onExecuteSelectedText?.(selected);
              return;
            }
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const edit = event.key === "Enter"
            ? getOqueryEnterEdit(textarea.value, start, end)
            : { value: `${textarea.value.slice(0, start)}  ${textarea.value.slice(end)}`, caret: start + 2 };
          changeVisibleText(edit.value, edit.caret);
        }}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
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
    oquery, functionDefinitions, errorFunctionName, compact, showGutter, showFoldControls, ...textareaProps
  } = props;
  const selectionText = (textarea: HTMLTextAreaElement) => textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  return (
    <div className="oquery-editor">
      {highlight && <pre className="oquery-editor-highlight" aria-hidden="true">{highlight(String(value ?? "")) || " "}</pre>}
      <textarea {...textareaProps} value={value} onChange={(event) => onTextChange(event.target.value)}
        onSelect={(event) => onSelectionChange?.(selectionText(event.currentTarget))}
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
