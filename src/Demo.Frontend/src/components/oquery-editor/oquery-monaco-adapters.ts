import { getOqueryFolds } from "../query-builder/query-design/oquery-folding.ts";
import type { OQueryCompletion } from "./oquery-completions";
import type { OQueryErrorPosition } from "./oquery-validation";

export type OqueryTextEdit = { start: number; end: number; text: string };

export type OqueryContextLens = { lineNumber: number; contextName: string };

const snippetEscape = (value: string) => value.replace(/[\\$}]/g, "\\$&");

// Completion inserts are plain text unless the completion asks for a caret
// position inside the inserted text, which is expressed as the $0 snippet stop.
export function toMonacoCompletionInsert(completion: OQueryCompletion): { insertText: string; isSnippet: boolean } {
  if (completion.cursorOffset === undefined) return { insertText: completion.insertText, isSnippet: false };
  const offset = Math.min(Math.max(completion.cursorOffset, 0), completion.insertText.length);
  const before = completion.insertText.slice(0, offset);
  const after = completion.insertText.slice(offset);
  return { insertText: `${snippetEscape(before)}$0${snippetEscape(after)}`, isSnippet: true };
}

// Monaco line numbers are 1-based; OQuery fold lines are 0-based.
export function getOqueryFoldingRanges(text: string): { start: number; end: number }[] {
  return getOqueryFolds(text).map((fold) => ({ start: fold.start + 1, end: fold.end + 1 }));
}

export function contextNameAtLine(line: string): string | null {
  return line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|is\s+[A-Za-z_][A-Za-z0-9_]*\s*:)/i)?.[1] ?? null;
}

export function getOqueryContextLenses(text: string): OqueryContextLens[] {
  return text.split("\n").flatMap((line, index) => {
    const contextName = contextNameAtLine(line);
    return contextName ? [{ lineNumber: index + 1, contextName }] : [];
  });
}

export function getOqueryErrorRange(position: OQueryErrorPosition) {
  return {
    startLineNumber: position.line,
    startColumn: position.column,
    endLineNumber: position.line,
    endColumn: position.column + Math.max(1, position.length),
  };
}

// Replaces only the changed middle section so Monaco's undo stack records a
// small edit rather than a full-document replacement.
export function getMinimalTextEdit(before: string, after: string): OqueryTextEdit | null {
  if (before === after) return null;
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;
  return {
    start: prefix,
    end: before.length - suffix,
    text: after.slice(prefix, after.length - suffix),
  };
}
