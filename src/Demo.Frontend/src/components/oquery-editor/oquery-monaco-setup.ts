import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import type { FunctionDefinition } from "../function-definition/types";
import type { OQueryCompletion, OQueryCompletionResult, OQueryCompletionKind } from "./oquery-completions";
import { getOqueryFoldingRanges, toMonacoCompletionInsert } from "./oquery-monaco-adapters";
import { OQUERY_LANGUAGE_CONFIGURATION, OQUERY_LANGUAGE_ID, getOqueryMonarchLanguage } from "./oquery-monaco-language";

export const OQUERY_THEME_ID = "oquery-dark";

export type OqueryEditorSource = {
  getCompletions: (text: string, offset: number) => OQueryCompletionResult | null;
};

// Monaco language providers are global, so each one dispatches to the editor
// instance that owns the model URI.
const sourcesByUri = new Map<string, OqueryEditorSource>();
let providersRegistered = false;
let environmentConfigured = false;

const completionKinds: Record<OQueryCompletionKind, monaco.languages.CompletionItemKind> = {
  entity: monaco.languages.CompletionItemKind.Class,
  field: monaco.languages.CompletionItemKind.Field,
  relation: monaco.languages.CompletionItemKind.Reference,
  context: monaco.languages.CompletionItemKind.Module,
  alias: monaco.languages.CompletionItemKind.Variable,
  function: monaco.languages.CompletionItemKind.Function,
  keyword: monaco.languages.CompletionItemKind.Keyword,
  operator: monaco.languages.CompletionItemKind.Operator,
  value: monaco.languages.CompletionItemKind.Value,
};

function configureEnvironment() {
  if (environmentConfigured) return;
  environmentConfigured = true;
  (self as typeof self & { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
}

function registerProviders() {
  if (providersRegistered) return;
  providersRegistered = true;
  const language = OQUERY_LANGUAGE_ID;

  monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: [".", " ", "("],
    provideCompletionItems(model, position) {
      const source = sourcesByUri.get(model.uri.toString());
      const result = source?.getCompletions(model.getValue(), model.getOffsetAt(position)) ?? null;
      if (!result) return { suggestions: [] };
      const start = model.getPositionAt(result.replaceStart);
      const end = model.getPositionAt(result.replaceEnd);
      const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
      return {
        suggestions: result.items.map((completion: OQueryCompletion, index) => {
          const insert = toMonacoCompletionInsert(completion);
          return {
            label: completion.label,
            kind: completionKinds[completion.kind],
            insertText: insert.insertText,
            insertTextRules: insert.isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range,
            sortText: String(index).padStart(4, "0"),
            command: completion.kind === "entity" ? { id: "editor.action.triggerSuggest", title: "" } : undefined,
          };
        }),
      };
    },
  });

  monaco.languages.registerFoldingRangeProvider(language, {
    provideFoldingRanges(model) {
      return getOqueryFoldingRanges(model.getValue()).map((range) => ({ start: range.start, end: range.end }));
    },
  });
}

function defineTheme() {
  monaco.editor.defineTheme(OQUERY_THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "687080", fontStyle: "italic" },
      { token: "string", foreground: "fde68a" },
      { token: "number", foreground: "f9a8d4" },
      { token: "keyword", foreground: "c4b5fd" },
      { token: "function", foreground: "86efac" },
      { token: "operator", foreground: "94a3b8" },
    ],
    colors: {
      "editor.background": "#0b1018",
      "editor.lineHighlightBackground": "#141c2a",
      "editorLineNumber.foreground": "#4b5563",
      "editorLineNumber.activeForeground": "#9ca3af",
      "editor.selectionHighlightBackground": "#d7bdff33",
      "editor.wordHighlightBackground": "#d7bdff22",
    },
  });
}

let registeredFunctionKey: string | null = null;

// Re-registering the Monarch tokenizer is cheap, and it lets function names
// from the current metadata drive highlighting without a per-editor language.
export function ensureOqueryLanguage(functionDefinitions: FunctionDefinition[]) {
  configureEnvironment();
  const functionNames = [...new Set(functionDefinitions.map((definition) => definition.name))].sort();
  const key = functionNames.join("\u0000");
  if (key === registeredFunctionKey) return;
  registeredFunctionKey = key;
  if (!monaco.languages.getLanguages().some((language) => language.id === OQUERY_LANGUAGE_ID)) {
    monaco.languages.register({ id: OQUERY_LANGUAGE_ID });
    monaco.languages.setLanguageConfiguration(OQUERY_LANGUAGE_ID, OQUERY_LANGUAGE_CONFIGURATION);
    defineTheme();
    registerProviders();
  }
  monaco.languages.setMonarchTokensProvider(OQUERY_LANGUAGE_ID, getOqueryMonarchLanguage(functionNames) as monaco.languages.IMonarchLanguage);
}

export function createOqueryModel(initialText: string, id: string): monaco.editor.ITextModel {
  const model = monaco.editor.createModel(initialText, OQUERY_LANGUAGE_ID, monaco.Uri.parse(`inmemory://oquery/${id}.oquery`));
  // Text is normalized to LF before syncing; a CRLF model would make every sync diff the whole tail of the document.
  model.setEOL(monaco.editor.EndOfLineSequence.LF);
  return model;
}

export function registerOqueryEditorSource(model: monaco.editor.ITextModel, source: OqueryEditorSource): () => void {
  const uri = model.uri.toString();
  sourcesByUri.set(uri, source);
  return () => {
    if (sourcesByUri.get(uri) === source) sourcesByUri.delete(uri);
  };
}

export { monaco };
