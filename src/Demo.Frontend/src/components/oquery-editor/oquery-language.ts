import type * as Monaco from "monaco-editor";
import type { FunctionDefinition } from "../function-definition/types";

export type OQueryFieldDocumentation = {
  name: string;
  documentation: string;
};

const clauses = "where|order|skip|take|inner\\s+join|left\\s+join|right\\s+join|full\\s+join|on";
const keywords = `${clauses}|asc|desc|and|or|is|in|between|not|like|contains|null|true|false`;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namesPattern(names: string[]) {
  const values = names.filter(Boolean).sort((left, right) => right.length - left.length).map(escapeRegex);
  return values.length ? `\\b(?:${values.join("|")})\\b` : "(?!)";
}

export function configureOQueryLanguage(
  monaco: typeof Monaco,
  entities: string[],
  fields: OQueryFieldDocumentation[],
  functions: FunctionDefinition[],
) {
  if (!monaco.languages.getLanguages().some((language) => language.id === "oquery")) {
    monaco.languages.register({ id: "oquery" });
  }

  monaco.languages.setLanguageConfiguration("oquery", {
    comments: { lineComment: "#" },
    brackets: [["(", ")"]],
    autoClosingPairs: [{ open: "(", close: ")" }],
    indentationRules: {
      increaseIndentPattern: /^\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:\s*$/,
      decreaseIndentPattern: new RegExp(`^\\s*(?:${clauses})\\b`, "i"),
    },
    onEnterRules: [{
      beforeText: /^\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:\s*$/,
      action: { indentAction: monaco.languages.IndentAction.Indent },
    }, {
      beforeText: new RegExp(`^\\s*(?:${clauses})\\b`, "i"),
      action: { indentAction: monaco.languages.IndentAction.Indent },
    }],
  });

  monaco.languages.setMonarchTokensProvider("oquery", {
    ignoreCase: true,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [new RegExp(`\\b(?:${keywords})\\b`, "i"), "keyword"],
        [/\b(?:where|order|skip|take|on)\b/i, "keyword"],
        [/\b(?:inner|left|right|full)\s+join\b/i, "keyword"],
        [/[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/, "keyword"],
        [new RegExp(namesPattern(entities), "i"), "type.identifier"],
        [new RegExp(namesPattern(fields.map((field) => field.name)), "i"), "variable"],
        [new RegExp(`${namesPattern(functions.map((definition) => definition.name))}\\s*(?=\\()`, "i"), "keyword"],
        [/\bas\b/i, { token: "keyword", next: "@alias" }],
        [/<[^>\r\n]+>/, "string.value"],
        [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/, "string"],
        [/[<>]=?|!=|=/, "operator"],
        [/\b\d+(?:\.\d+)?\b/, "number"],
        [/[A-Za-z_][A-Za-z0-9_]*/, "identifier"],
        [/[,:()[\]]/, "delimiter"],
      ],
      alias: [
        [/\s+/, "white"],
        [/[A-Za-z_][A-Za-z0-9_]*/, "variable", "@pop"],
        [/./, "", "@pop"],
      ],
    },
  });
}

export function formatOQueryText(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let formattedIndent = 0;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (/^#/.test(trimmed)) return `${" ".repeat(formattedIndent)}${trimmed}`;
    if (/^(?:Where|Order|Skip|Take|Inner Join|Left Join|Right Join|Full Join|On)\b/i.test(trimmed)) {
      formattedIndent = 2;
      return `  ${trimmed}`;
    }
    formattedIndent = 0;
    return trimmed;
  }).join("\n");
}

export function getOQueryIndentation(text: string, lineNumber: number) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const current = lines[lineNumber - 1]?.trim() ?? "";
  if (/^(?:Where|Order|Skip|Take|Inner Join|Left Join|Right Join|Full Join|On)\b/i.test(current)) return "  ";
  for (let index = lineNumber - 2; index >= 0; index--) {
    const previous = lines[index]?.trim() ?? "";
    if (!previous) continue;
    return /^\s*(?:Where|Order|Skip|Take|Inner Join|Left Join|Right Join|Full Join|On)\b/i.test(lines[index] ?? "")
      || /^[A-Za-z_][A-Za-z0-9_]*(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:\s*/.test(lines[index] ?? "")
      ? "  "
      : (lines[index]?.match(/^\s*/)?.[0] ?? "");
  }
  return "";
}

export function registerOQueryFormattingProviders(monaco: typeof Monaco) {
  const formatting = monaco.languages.registerDocumentFormattingEditProvider("oquery", {
    provideDocumentFormattingEdits(model) {
      const current = model.getValue();
      const formatted = formatOQueryText(current);
      return formatted === current ? [] : [{
        range: model.getFullModelRange(),
        text: formatted,
      }];
    },
  });
  const onType = monaco.languages.registerOnTypeFormattingEditProvider("oquery", {
    autoFormatTriggerCharacters: ["\n"],
    provideOnTypeFormattingEdits(model, position) {
      const indentation = getOQueryIndentation(model.getValue(), position.lineNumber);
      const line = model.getLineContent(position.lineNumber);
      const replacement = line.replace(/^\s*/, indentation);
      if (replacement === line) return [];
      return [{
        range: new monaco.Range(position.lineNumber, 1, position.lineNumber, line.length + 1),
        text: replacement,
      }];
    },
  });
  return { dispose: () => { formatting.dispose(); onType.dispose(); } };
}

export function registerOQueryHoverProvider(
  monaco: typeof Monaco,
  fields: OQueryFieldDocumentation[],
  functions: FunctionDefinition[],
  entities: string[],
) {
  return monaco.languages.registerHoverProvider("oquery", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const field = fields.find((item) => item.name.localeCompare(word.word, undefined, { sensitivity: "accent" }) === 0);
      const functionDefinition = functions.find((item) => item.name.localeCompare(word.word, undefined, { sensitivity: "accent" }) === 0);
      const entity = entities.find((item) => item.localeCompare(word.word, undefined, { sensitivity: "accent" }) === 0);
      if (!field && !functionDefinition && !entity) return null;
      const documentation = field?.documentation
        ?? (functionDefinition
          ? `${functionDefinition.description || "OQuery function"}\n\nResult: ${functionDefinition.resultType}\nArguments: ${functionDefinition.arguments.map((argument) => `${argument.name}: ${argument.dataType}`).join(", ") || "none"}`
          : `Metadata entity: ${entity}`);
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: `**${word.word}**` }, { value: documentation }],
      };
    },
  });
}
