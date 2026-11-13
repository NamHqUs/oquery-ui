import type { KeyboardEvent } from "react";
import { applyFoldedOqueryEdit } from "../query-builder/query-design/oquery-folding";
import { toggleOqueryComments } from "./oquery-comments";
import type { OQueryCompletion } from "./oquery-completions";

const oqueryListSections = new Set(["Projection", "Sorts", "Contexts"]);

function getOqueryLineContext(value: string, position: number) {
  const beforeCursor = value.slice(0, position);
  const lineStart = beforeCursor.lastIndexOf("\n") + 1;
  const lineEnd = value.indexOf("\n", lineStart);
  const currentLine = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd);
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
    return { value: `${normalizedBeforeCursor}${afterCursor}`, caret: normalizedBeforeCursor.length };
  }
  if (!trimmedLine) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    if (!indentation) return { value: `${beforeCursor}\n${afterCursor}`, caret: beforeCursor.length + 1 };
    const parentIndentation = indentation.slice(0, Math.max(0, indentation.length - 2));
    const normalizedBeforeCursor = `${value.slice(0, lineStart)}${parentIndentation}`;
    return { value: `${normalizedBeforeCursor}${afterCursor}`, caret: normalizedBeforeCursor.length };
  }
  if ((!isListSection && !isListSectionHeader) || (isTopLevelKey && !isListSectionHeader)) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    return { value: `${beforeCursor}\n${indentation}${afterCursor}`, caret: beforeCursor.length + indentation.length + 1 };
  }
  if (isListSectionHeader) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    const inserted = `\n${indentation}  - `;
    return { value: `${beforeCursor}${inserted}${afterCursor}`, caret: beforeCursor.length + inserted.length };
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

function getSelectedLineEdit(value: string, selectionStart: number, selectionEnd: number, operation: "indent" | "outdent" | "delete") {
  const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  if (selectionStart === selectionEnd) {
    const line = value.slice(start, value.indexOf("\n", selectionStart) < 0 ? value.length : value.indexOf("\n", selectionStart));
    if (operation === "indent") return { value: `${value.slice(0, start)}  ${value.slice(start)}`, selectionStart: selectionStart + 2, selectionEnd: selectionEnd + 2 };
    if (operation === "delete") {
      const lineEnd = value.indexOf("\n", selectionStart);
      const end = lineEnd < 0 ? value.length : lineEnd + 1;
      return { value: `${value.slice(0, start)}${value.slice(end)}`, selectionStart: start, selectionEnd: start };
    }
    const removed = line.match(/^ {1,2}/)?.[0].length ?? 0;
    return { value: `${value.slice(0, start)}${value.slice(start + removed)}`, selectionStart: Math.max(start, selectionStart - removed), selectionEnd: Math.max(start, selectionEnd - removed) };
  }
  const selectedEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
  const lineEndIndex = value.indexOf("\n", selectedEnd);
  const end = lineEndIndex < 0 ? value.length : lineEndIndex + 1;
  const selectedLines = value.slice(start, end).split("\n");
  if (operation === "delete") return { value: `${value.slice(0, start)}${value.slice(end)}`, selectionStart: start, selectionEnd: start };
  const updatedLines = selectedLines.map((line) => operation === "indent" ? `  ${line}` : line.replace(/^ {1,2}/, ""));
  const replacement = updatedLines.join("\n");
  return { value: `${value.slice(0, start)}${replacement}${value.slice(end)}`, selectionStart: start, selectionEnd: start + replacement.length };
}

function getLineRange(value: string, position: number) {
  const start = value.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const lineBreak = value.indexOf("\n", position);
  return {
    start,
    end: lineBreak < 0 ? value.length : lineBreak + 1,
  };
}

export function replaceTextareaSelection(textarea: HTMLTextAreaElement, replacement: string, selectionStart: number, selectionEnd: number, nextSelectionStart: number, nextSelectionEnd: number) {
  textarea.setSelectionRange(selectionStart, selectionEnd);
  if (!textarea.ownerDocument.execCommand("insertText", false, replacement)) return false;
  textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
  return true;
}

function copyTextareaText(textarea: HTMLTextAreaElement, text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }
  const helper = textarea.ownerDocument.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  Object.assign(helper.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    opacity: "0",
  });
  textarea.ownerDocument.body.appendChild(helper);
  helper.select();
  const copied = textarea.ownerDocument.execCommand("copy");
  helper.remove();
  return Promise.resolve(copied);
}

export type OQueryKeyboardOptions = {
  completions: OQueryCompletion[];
  completionIndex: number;
  completionPosition: number | null;
  text: string;
  collapsed: Set<number>;
  projectionText: string;
  updateCompletionPosition: (textarea: HTMLTextAreaElement, open?: boolean) => void;
  setCompletionIndex: (update: (index: number) => number) => void;
  setCompletionPosition: (position: number | null) => void;
  applyCompletion: (completion: OQueryCompletion) => void;
  changeVisibleText: (value: string, caret?: number, selectionEnd?: number) => void;
  setFoldMessage: (message: string) => void;
  pendingCaretRef: { current: number | null };
  undo: () => void;
  redo: () => void;
  onExecuteSelectedText?: (text: string) => void;
};

export function processOQueryKeyboard(event: KeyboardEvent<HTMLTextAreaElement>, options: OQueryKeyboardOptions): void {
  const {
    completions, completionIndex, completionPosition, text, collapsed, projectionText,
    updateCompletionPosition, setCompletionIndex, setCompletionPosition,
    applyCompletion, changeVisibleText, setFoldMessage, pendingCaretRef, undo, redo, onExecuteSelectedText,
  } = options;
  const textarea = event.currentTarget;
  if ((event.ctrlKey || event.metaKey) && event.key === " ") {
    event.preventDefault();
    updateCompletionPosition(textarea);
    return;
  }
  const isPrintableCharacter = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !/\s/.test(event.key);
  if (completions.length) {
    if (event.key === "ArrowDown") { event.preventDefault(); setCompletionIndex(index => (index + 1) % completions.length); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setCompletionIndex(index => (index - 1 + completions.length) % completions.length); return; }
    if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); applyCompletion(completions[completionIndex]!); return; }
  }
  if (!isPrintableCharacter) setCompletionPosition(null);
  if (event.key === "Escape" && completionPosition !== null) { event.preventDefault(); setCompletionPosition(null); return; }
  if (event.key === "Tab") {
    event.preventDefault();
    const edit = getSelectedLineEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd, event.shiftKey ? "outdent" : "indent");
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const unchangedAroundEdit = edit.value.slice(0, start) === textarea.value.slice(0, start)
      && edit.value.slice(edit.value.length - (textarea.value.length - end)) === textarea.value.slice(end);
    const nativeEditApplied = unchangedAroundEdit && replaceTextareaSelection(textarea, edit.value.slice(start, edit.value.length - (textarea.value.length - end)), start, end, edit.selectionStart, edit.selectionEnd);
    if (!nativeEditApplied) changeVisibleText(edit.value, edit.selectionStart, edit.selectionEnd);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if ((event.ctrlKey || event.metaKey)
    && (event.key.toLocaleLowerCase() === "c" || event.key.toLocaleLowerCase() === "x")
    && textarea.selectionStart === textarea.selectionEnd) {
    event.preventDefault();
    const line = getLineRange(textarea.value, textarea.selectionStart);
    const lineText = textarea.value.slice(line.start, line.end);
    const copiedText = line.end === textarea.value.length ? `${lineText}\n` : lineText;
    void copyTextareaText(textarea, copiedText).then((copied) => {
      if (!copied) {
        setFoldMessage("Unable to copy the current line: this browser does not support clipboard editing.");
        return;
      }
      if (event.key.toLocaleLowerCase() === "c") return;
      changeVisibleText(
        `${textarea.value.slice(0, line.start)}${textarea.value.slice(line.end)}`,
        line.start,
        line.start,
      );
    });
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "/") {
    event.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const toggled = toggleOqueryComments(projectionText, start, end);
    if (toggled.text === projectionText) return;
    if (applyFoldedOqueryEdit(text, collapsed, toggled.text) === null) { changeVisibleText(toggled.text); return; }
    textarea.setSelectionRange(toggled.start, toggled.end);
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
    if (selected) { event.preventDefault(); onExecuteSelectedText?.(selected); return; }
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const edit = getOqueryEnterEdit(textarea.value, start, end);
  const unchangedAroundEdit = edit.value.slice(0, start) === textarea.value.slice(0, start)
    && edit.value.slice(edit.value.length - (textarea.value.length - end)) === textarea.value.slice(end);
  const nativeEditApplied = unchangedAroundEdit && replaceTextareaSelection(textarea, edit.value.slice(start, edit.value.length - (textarea.value.length - end)), start, end, edit.caret, edit.caret);
  if (!nativeEditApplied) changeVisibleText(edit.value, edit.caret);
}
