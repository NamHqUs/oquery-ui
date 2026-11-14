export const OQUERY_LANGUAGE_ID = "oquery";

export const OQUERY_KEYWORDS = [
  "where", "order", "skip", "take", "join", "left", "inner", "right", "full", "on",
  "asc", "desc", "and", "or", "is", "in", "between", "not", "like", "contains",
  "null", "true", "false",
];

export const OQUERY_LANGUAGE_CONFIGURATION = {
  comments: { lineComment: "#" },
  brackets: [["(", ")"], ["[", "]"], ["{", "}"]] as [string, string][],
  autoClosingPairs: [
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "\"", close: "\"", notIn: ["string"] },
    { open: "'", close: "'", notIn: ["string"] },
  ],
  surroundingPairs: [
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "\"", close: "\"" },
    { open: "'", close: "'" },
  ],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest names first so that a shorter function name never shadows a longer one.
export function getOqueryMonarchLanguage(functionNames: string[]) {
  const names = [...new Set(functionNames)]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);
  const functionRule: [RegExp, string][] = names.length
    ? [[new RegExp(`\\b(${names.join("|")})(?=\\s*\\()`, "i"), "function"]]
    : [];
  return {
    ignoreCase: true,
    keywords: OQUERY_KEYWORDS,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/"(?:[^"\\]|\\.)*"?/, "string"],
        [/'(?:[^'\\]|\\.)*'?/, "string"],
        [/\b\d+(?:\.\d+)?\b/, "number"],
        ...functionRule,
        [/[A-Za-z_]\w*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        [/[()[\]{}]/, "@brackets"],
        [/[<>=!]+|[+\-*/%&|]/, "operator"],
      ],
    },
  };
}
