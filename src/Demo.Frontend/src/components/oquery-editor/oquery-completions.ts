import type { FunctionDefinition } from "../function-definition/types";

export type OQueryCompletionKind =
  | "entity"
  | "field"
  | "relation"
  | "context"
  | "alias"
  | "function"
  | "keyword"
  | "operator"
  | "value";

export type OQueryCompletion = {
  label: string;
  insertText: string;
  detail: string;
  kind: OQueryCompletionKind;
  cursorOffset?: number;
};

export type OQueryCompletionResult = {
  items: OQueryCompletion[];
  replaceStart: number;
  replaceEnd: number;
};

export type OQuerySuggestionEntity = {
  name: string;
  fields: string[];
  fieldDataTypes?: Record<string, string>;
  relations: { name: string; target: string; kind?: "collection" | "lookup" }[];
};

type Candidate = OQueryCompletion & {
  relevance: number;
};

type CompletionContext =
  | "document"
  | "header"
  | "projection"
  | "where"
  | "order"
  | "join"
  | "on"
  | "value"
  | "clause";

const clauseKeywords = [
  ["Select", "Start the projection"] as const,
  ["Where", "Filter rows"] as const,
  ["Order", "Sort results"] as const,
  ["Skip", "Skip rows"] as const,
  ["Take", "Limit rows"] as const,
  ["Join", "Inner join a context"] as const,
  ["Inner Join", "Join a context"] as const,
  ["Left Join", "Join a context"] as const,
  ["Right Join", "Join a context"] as const,
  ["Full Join", "Join a context"] as const,
  ["On", "Join condition"] as const,
];

const expressionKeywords = [
  ["And", "Combine conditions"] as const,
  ["Or", "Combine conditions"] as const,
  ["Is", "Declare a reusable context"] as const,
  ["Asc", "Ascending sort"] as const,
  ["Desc", "Descending sort"] as const,
  ["In", "Match a value in a list"] as const,
  ["Between", "Match a value range"] as const,
  ["Not", "Negate an expression"] as const,
  ["Like", "Text pattern match"] as const,
  ["Distinct", "Remove duplicate result rows or aggregate values"] as const,
  ["Null", "Null value"] as const,
  ["True", "Boolean value"] as const,
  ["False", "Boolean value"] as const,
];

const operators = [
  ["=", "Equals"] as const,
  [">", "Greater than"] as const,
  ["<", "Less than"] as const,
  [">=", "Greater than or equal"] as const,
  ["<=", "Less than or equal"] as const,
  ["!=", "Not equal"] as const,
];

const kindPriority: Record<OQueryCompletionKind, number> = {
  field: 0,
  relation: 1,
  alias: 2,
  context: 3,
  entity: 4,
  function: 5,
  keyword: 6,
  operator: 7,
  value: 8,
};

function unique(items: Candidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.label.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addCandidate(
  candidates: Candidate[],
  label: string,
  detail: string,
  kind: OQueryCompletionKind,
  relevance: number,
  insertText = label,
  cursorOffset?: number,
) {
  candidates.push({ label, insertText, detail, kind, relevance, cursorOffset });
}

function addKeywords(candidates: Candidate[], keywords: readonly (readonly [string, string])[], relevance = 0) {
  keywords.forEach(([label, detail]) => addCandidate(candidates, label, detail, "keyword", relevance, `${label} `));
}

function addFunctionCandidate(candidates: Candidate[], definition: FunctionDefinition, relevance: number) {
  addCandidate(
    candidates,
    definition.name,
    definition.isAggregate ? "Aggregate function" : "Function",
    "function",
    relevance,
    `${definition.name}()`,
    definition.name.length + 1,
  );
}

// A name is an unquoted identifier or a quoted name such as "User Context".
const identifier = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)`;
const headerStartPattern = new RegExp(String.raw`^\s*(?:${identifier}\s+is\s+)?${identifier}\s*:`, "i");
const headerPattern = new RegExp(String.raw`^\s*(?:(${identifier})\s+is\s+)?(${identifier})\s*:(.*)$`, "i");
const joinPattern = new RegExp(String.raw`^\s*(?:(?:inner|left|right|full)\s+)?join\s+(${identifier})(?:\s+(?!on\b)(${identifier}))?`, "i");
const clausePattern = /^\s*(?:where|order|skip|take)\b/i;
const onLinePattern = /^\s*on\b/i;
const selectLinePattern = /^\s*select(?:\s|$)/i;

type ParsedBlock = {
  name: string;
  sourceName: string;
  declared: boolean;
  headerLine: number;
  joins: Map<string, string>;
  outputs: string[];
  aliases: string[];
};

type ScopeNode =
  | { type: "entity"; entity: OQuerySuggestionEntity; collection: boolean }
  | { type: "context"; fields: string[]; collection: boolean }
  | { type: "scalar"; dataType?: string };

type Scope = {
  root: ScopeNode;
  entities: OQuerySuggestionEntity[];
  declared: Map<string, string[]>;
  joins: Map<string, string>;
  aliases: string[];
};

function unquote(name: string) {
  return name.startsWith("\"") ? name.slice(1, -1) : name;
}

function isIncompleteExpression(text: string) {
  return /(?:[+\-*/%&|=<>!]|\b(?:and|or|as|not|like|in|is))\s*$/i.test(text);
}

// A join stays open until its condition is complete. A top-level comma closes it.
function isJoinOpen(trimmed: string, hasOn: boolean) {
  if (/,\s*$/.test(trimmed)) return false;
  return !hasOn || /(?:\b(?:and|or|on)|[=<>!+\-*/%&|(])\s*$/i.test(trimmed);
}

// Splits projection text on top-level commas and line breaks. Commas inside calls are not separators.
function splitProjection(source: string) {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of source) {
    if (character === "(" || character === "[") depth++;
    else if ((character === ")" || character === "]") && depth > 0) depth--;
    if (depth === 0 && (character === "," || (character === "\n" && !isIncompleteExpression(current)))) {
      items.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}

// Returns the column name an item exposes, and whether that name is an explicit alias.
function projectionOutput(item: string): { name: string; explicitAlias: boolean } | null {
  const asAlias = new RegExp(String.raw`^(.*\S)\s+as\s+(${identifier})$`, "i").exec(item);
  if (asAlias) return { name: unquote(asAlias[2]!), explicitAlias: true };
  const spacedAlias = new RegExp(String.raw`^(.*\S)\s+(${identifier})$`).exec(item);
  if (spacedAlias && !isIncompleteExpression(spacedAlias[1]!) && !/[,(]\s*$/.test(spacedAlias[1]!)) {
    return { name: unquote(spacedAlias[2]!), explicitAlias: true };
  }
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(item) ? { name: item, explicitAlias: false } : null;
}

// Splits the document into blocks. Each block starts at a header and owns the lines until the next header.
// The excluded line (the cursor line) is ignored so a half-typed line does not create aliases or joins.
function parseBlocks(lines: string[], excludedLine: number): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let block: ParsedBlock | null = null;
  let projectionLines: string[] = [];
  let projectionEnded = false;
  let openJoin: { hasOn: boolean } | null = null;

  const closeBlock = () => {
    if (!block) return;
    for (const item of splitProjection(projectionLines.join("\n"))) {
      const output = projectionOutput(item);
      if (!output) continue;
      if (!block.outputs.includes(output.name)) block.outputs.push(output.name);
      if (output.explicitAlias && !block.aliases.includes(output.name)) block.aliases.push(output.name);
    }
    blocks.push(block);
  };

  lines.forEach((line, index) => {
    if (index === excludedLine) return;
    const trimmed = line.trim();
    const header = headerPattern.exec(line);
    if (header) {
      closeBlock();
      const declared = header[1] !== undefined;
      block = {
        name: unquote(declared ? header[1]! : header[2]!),
        sourceName: unquote(header[2]!),
        declared,
        headerLine: index,
        joins: new Map(),
        outputs: [],
        aliases: [],
      };
      projectionLines = [header[3]!];
      projectionEnded = false;
      openJoin = null;
      return;
    }
    if (!block || !trimmed) return;

    const join = joinPattern.exec(line);
    if (join) {
      const alias = unquote(join[2] ?? join[1]!);
      block.joins.set(alias, unquote(join[1]!));
      const hasOn = onLinePattern.test(line.slice(join[0].length));
      openJoin = isJoinOpen(trimmed, hasOn) ? { hasOn } : null;
      return;
    }
    if (clausePattern.test(line)) {
      openJoin = null;
      projectionEnded = true;
      return;
    }
    if (selectLinePattern.test(line)) {
      // Select starts the projection; any text after it is the first projection line.
      openJoin = null;
      projectionEnded = false;
      projectionLines = [line.replace(/^\s*select\b/i, "")];
      return;
    }
    if (openJoin || onLinePattern.test(line)) {
      const hasOn = (openJoin?.hasOn ?? false) || onLinePattern.test(line);
      openJoin = isJoinOpen(trimmed, hasOn) ? { hasOn } : null;
      return;
    }
    if (!projectionEnded) projectionLines.push(line);
  });
  closeBlock();
  return blocks;
}

function analyzeScope(
  text: string,
  position: number,
  rootEntityName: string,
  entities: OQuerySuggestionEntity[],
  fallbackFields: string[],
): Scope {
  const cursorLine = text.slice(0, position).split(/\r?\n/).length - 1;
  const blocks = parseBlocks(text.split(/\r?\n/), cursorLine);
  const declared = new Map<string, string[]>();
  for (const block of blocks) {
    if (block.declared) declared.set(block.name, block.outputs);
  }
  const cursorBlock = [...blocks].reverse().find((block) => block.headerLine < cursorLine) ?? null;
  const cursorLineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const currentHeader = headerPattern.exec(text.slice(cursorLineStart, position));
  const sourceName = currentHeader ? unquote(currentHeader[2]!) : cursorBlock?.sourceName ?? rootEntityName;
  const scope: Scope = {
    root: { type: "context", fields: fallbackFields, collection: false },
    entities,
    declared,
    joins: cursorBlock?.joins ?? new Map(),
    aliases: cursorBlock?.aliases ?? [],
  };
  scope.root = sourceNode(scope, sourceName, false)
    ?? { type: "context", fields: fallbackFields, collection: false };
  return scope;
}

// A source is an entity, or a context declared earlier in the document.
function sourceNode(scope: Scope, name: string, collection: boolean): ScopeNode | null {
  const entity = scope.entities.find((candidate) => candidate.name === name);
  if (entity) return { type: "entity", entity, collection };
  const fields = scope.declared.get(name);
  return fields ? { type: "context", fields, collection } : null;
}

function stepNode(scope: Scope, node: ScopeNode, segment: string): ScopeNode | null {
  if (node.type === "entity") {
    const relation = node.entity.relations.find((candidate) => candidate.name === segment);
    if (relation) return sourceNode(scope, relation.target, relation.kind === "collection");
    if (node.entity.fields.includes(segment)) {
      return { type: "scalar", dataType: node.entity.fieldDataTypes?.[segment] };
    }
    return null;
  }
  if (node.type === "context") {
    const prefix = `${segment}.`;
    const nested = node.fields
      .filter((field) => field.startsWith(prefix))
      .map((field) => field.slice(prefix.length));
    if (nested.length > 0) return { type: "context", fields: nested, collection: false };
    if (node.fields.includes(segment)) return { type: "scalar" };
  }
  return null;
}

// Resolution order: join alias, then declared context name, then a field or relation of the block source.
function resolvePath(scope: Scope, segments: string[]): ScopeNode | null {
  const [first, ...rest] = segments;
  if (first === undefined) return null;
  const joinSource = scope.joins.get(first);
  let node: ScopeNode | null;
  if (joinSource !== undefined) {
    node = sourceNode(scope, joinSource, true);
  } else if (scope.declared.has(first)) {
    node = { type: "context", fields: scope.declared.get(first)!, collection: true };
  } else {
    node = stepNode(scope, scope.root, first);
  }
  for (const segment of rest) {
    if (!node) break;
    node = stepNode(scope, node, segment);
  }
  return node;
}

// Members that can be suggested after a dot, or at the root when there is no dot.
function suggestionsFor(node: ScopeNode | null) {
  if (!node) return { fields: [], relations: [] };
  if (node.type === "entity") return { fields: node.entity.fields, relations: node.entity.relations };
  if (node.type === "context") {
    const relations = [...new Set(
      node.fields
        .filter((field) => field.includes("."))
        .map((field) => field.split(".")[0]!),
    )].map((name) => ({ name, target: "", kind: undefined }));
    return { fields: node.fields.filter((field) => !field.includes(".")), relations };
  }
  return { fields: [], relations: [] };
}

function getCompletionContext(lineBeforeCursor: string, text: string, position: number): CompletionContext {
  const trimmed = lineBeforeCursor.trimStart();
  const lower = trimmed.toLocaleLowerCase();
  const hasHeader = headerStartPattern.test(trimmed);
  const isIndented = /^\s/.test(lineBeforeCursor);
  const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const beforeCurrentLine = text.slice(0, lineStart);
  const previousLines = beforeCurrentLine.split(/\r?\n/);
  const lastHeaderIndex = previousLines.reduce(
    (index, line, lineIndex) => headerStartPattern.test(line)
      ? lineIndex
      : index,
    -1,
  );
  const lastSelectIndex = previousLines.reduce(
    (index, line, lineIndex) => selectLinePattern.test(line) ? lineIndex : index,
    -1,
  );
  const lastClauseIndex = previousLines.reduce(
    (index, line, lineIndex) => /^\s*(?:where|order|skip|take|join|(?:inner|left|right|full)\s+join)\b/i.test(line)
      ? lineIndex
      : index,
    -1,
  );
  const isProjectionParagraph = Math.max(lastHeaderIndex, lastSelectIndex) > lastClauseIndex;
  // Projection may start right after a single-line join, or after a multi-line join closed by a comma.
  const previousContentIndex = previousLines.reduce((index, line, lineIndex) => line.trim() ? lineIndex : index, -1);
  const previousContent = previousLines[previousContentIndex] ?? "";
  const isAfterJoin = lastHeaderIndex >= 0
    && previousContentIndex > lastHeaderIndex
    && (/^\s*(?:(?:inner|left|right|full)\s+)?join\b/i.test(previousContent)
      || (/^\s*on\b/i.test(previousContent) && /,\s*$/.test(previousContent)));
  const isContextDeclaration = new RegExp(String.raw`^${identifier}\s+is\s+${identifier}(?:\s*:|\s*$)`, "i").test(trimmed);

  if (!text.trim()) return "document";
  if (/^on(?:\s+|$)/i.test(trimmed) || /\bjoin\s+\S+\s+on(?:\s+|$)/i.test(lower)) return "on";
  if (/\b(?:join|(?:inner|left|right|full)\s+join)(?:\s+|$)/i.test(trimmed)) return "join";
  if (/^where(?:\s+|$)/i.test(trimmed)) {
    return /(?:=|!=|>=|<=|>|<)\s*$/.test(lineBeforeCursor) ? "value" : "where";
  }
  if (/^order(?:\s+|$)/i.test(trimmed)) return "order";
  if (/^select\s/i.test(trimmed)) return "projection";
  if (isContextDeclaration && !/:\s*/.test(trimmed)) return "header";
  if ((isProjectionParagraph || isAfterJoin) && isIndented && !lineBeforeCursor.includes(":")) return "projection";
  // The syntax allows an unindented line to continue a projection, so it stays projection until it is typed as a header.
  if (isProjectionParagraph && !isIndented && !hasHeader && !lineBeforeCursor.includes(":")) return "projection";
  if (!isIndented && !hasHeader && !lineBeforeCursor.includes(":")) return "header";
  if (hasHeader) return "projection";
  if (isIndented && !trimmed.includes(" ")) return "clause";
  return "projection";
}

function getRelationPath(sourceBeforeCursor: string) {
  const activeCalls: ({ receiverPath: string | null } | null)[] = [];
  for (let index = 0; index < sourceBeforeCursor.length; index++) {
    const character = sourceBeforeCursor[index];
    if (character === "\n") {
      activeCalls.length = 0;
      continue;
    }
    if (character === "(") {
      const functionCall = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*$/
        .exec(sourceBeforeCursor.slice(0, index));
      const path = functionCall?.[1];
      activeCalls.push(path
        ? { receiverPath: path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : null }
        : null);
    } else if (character === ")") {
      activeCalls.pop();
    }
  }

  const lineBeforeCursor = sourceBeforeCursor.slice(sourceBeforeCursor.lastIndexOf("\n") + 1);
  const match = /(?:^|[\s,(])([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.([A-Za-z_][A-Za-z0-9_]*)?$/.exec(lineBeforeCursor);
  const dotPath = match?.[1] ?? null;

  const contextSegments: string[] = [];
  for (const call of activeCalls) {
    if (call?.receiverPath) contextSegments.push(...call.receiverPath.split("."));
  }
  if (contextSegments.length > 0) {
    // A dot typed inside a call is relative to the call's collection context.
    return dotPath ? [...contextSegments, dotPath].join(".") : contextSegments.join(".");
  }
  return dotPath;
}

// Parentheses reset at each line break, so an unclosed call on an earlier projection line does not leak forward.
// Grouping parentheses such as "(CountIf(...) * 100.0 / Count(Id))" are not calls, so they never count as aggregate calls.
export function isInsideAggregateCall(sourceBeforeCursor: string, isAggregateName: (name: string) => boolean) {
  const openStack: boolean[] = [];
  let previousSignificant = "";
  for (let index = 0; index < sourceBeforeCursor.length; index += 1) {
    const character = sourceBeforeCursor[index]!;
    if (character === "\n") {
      openStack.length = 0;
      previousSignificant = "";
    } else if (character === "(") {
      const callName = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(sourceBeforeCursor.slice(0, index))?.[1];
      openStack.push(callName !== undefined && isAggregateName(callName));
      previousSignificant = character;
    } else if (character === ")") {
      openStack.pop();
      previousSignificant = character;
    } else if (!/\s/.test(character)) {
      previousSignificant = character;
    }
  }
  return openStack.some(Boolean);
}

// True when the cursor directly follows a dotted path, such as "HireDate." or "HireDate.Da".
function isImmediateDotPosition(lineBeforeCursor: string) {
  return /(?:^|[\s,(])[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\.[A-Za-z_]*$/.test(lineBeforeCursor);
}

function isAggregateDistinctPosition(sourceBeforeCursor: string) {
  const lineBeforeCursor = sourceBeforeCursor.slice(sourceBeforeCursor.lastIndexOf("\n") + 1);
  return /(?:^|[\s,(:])[A-Za-z_][A-Za-z0-9_.]*\s*\(\s*$/i.test(lineBeforeCursor);
}

function isProjectionDistinctPosition(lineBeforeCursor: string) {
  const colonIndex = lineBeforeCursor.lastIndexOf(":");
  const projection = (colonIndex >= 0
    ? lineBeforeCursor.slice(colonIndex + 1)
    : lineBeforeCursor.replace(/^\s*select\b/i, ""))
    .trim();
  return projection.length === 0 || /^d/i.test(projection);
}

function isProjectionAliasPosition(lineBeforeCursor: string) {
  const colonIndex = lineBeforeCursor.indexOf(":");
  const projection = colonIndex >= 0 ? lineBeforeCursor.slice(colonIndex + 1) : lineBeforeCursor;
  const currentItem = projection.slice(projection.lastIndexOf(",") + 1);
  let parenthesisDepth = 0;
  let hasExpression = false;
  let aliasWhitespace = false;

  for (const character of currentItem) {
    if (character === "(") {
      parenthesisDepth++;
      hasExpression = true;
    } else if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    } else if (parenthesisDepth === 0 && "+-*/%&|=<>!".includes(character)) {
      return false;
    } else if (aliasWhitespace && /\S/.test(character)) {
      return true;
    } else if (/\S/.test(character)) {
      hasExpression = true;
    } else if (hasExpression && parenthesisDepth === 0) {
      aliasWhitespace = true;
    }
  }

  return false;
}

export type FunctionReceiver =
  | { kind: "root" }
  | { kind: "collection"; path: string }
  | { kind: "scalar"; path: string; dataType: string }
  | { kind: "expression" }
  | { kind: "unresolved"; path: string };

// Shared by completions and syntax checking so both apply the same function rules.
export function resolveFunctionReceiver(
  text: string,
  position: number,
  rootEntityName: string,
  entities: OQuerySuggestionEntity[],
): FunctionReceiver {
  const sourceBeforePosition = text.slice(0, position);
  const lineBeforePosition = sourceBeforePosition.slice(sourceBeforePosition.lastIndexOf("\n") + 1);
  // A parenthesized group or call result, such as "(CountIf(...) * 100).", is a computed numeric receiver.
  if (/\)\s*\.[A-Za-z_]*$/.test(lineBeforePosition)) return { kind: "expression" };
  if (!isImmediateDotPosition(lineBeforePosition)) return { kind: "root" };

  const path = getRelationPath(sourceBeforePosition);
  if (!path) return { kind: "unresolved", path: "" };
  const node = resolvePath(analyzeScope(text, position, rootEntityName, entities, []), path.split("."));
  if (node?.type === "scalar") {
    return node.dataType ? { kind: "scalar", path, dataType: node.dataType } : { kind: "unresolved", path };
  }
  if (node?.type === "entity" || node?.type === "context") {
    return node.collection ? { kind: "collection", path } : { kind: "unresolved", path };
  }
  return { kind: "unresolved", path };
}


// Returns null when the function may be used at the call site, otherwise the reason it may not.
export function getFunctionApplicabilityError(
  definition: FunctionDefinition,
  receiver: FunctionReceiver,
  insideAggregateCall: boolean,
): string | null {
  const name = definition.name;
  const applyFor = definition.applyFor ?? (definition.isAggregate ? 1 : 2 | 4 | 8 | 16);
  const acceptsCollection = (applyFor & 1) !== 0;
  const dataTypeBit = (dataType: string) => ({
    string: 2,
    number: 4,
    datetime: 8,
    boolean: 16,
  }[dataType.toLocaleLowerCase()] ?? 0);
  switch (receiver.kind) {
    case "root":
      return insideAggregateCall && definition.isAggregate
        ? `${name} cannot be nested inside another aggregate function call.`
        : null;
    case "collection":
      return acceptsCollection
        ? null
        : `${name} cannot be applied to collection ${receiver.path}: it does not accept a dataset receiver.`;
    case "scalar": {
      if ((applyFor & dataTypeBit(receiver.dataType)) === 0)
        return `${name} cannot be applied to ${receiver.path} of type ${receiver.dataType}.`;
      const firstArgumentType = definition.arguments?.[0]?.dataType;
      if (!firstArgumentType) {
        return `${name} cannot be applied to ${receiver.path}: it has no first argument that accepts a field.`;
      }
      return firstArgumentType.toLocaleLowerCase() === receiver.dataType.toLocaleLowerCase()
        ? null
        : `${name} cannot be applied to ${receiver.path} of type ${receiver.dataType}: its first argument is ${firstArgumentType}.`;
    }
    case "expression": {
      if ((applyFor & 4) === 0)
        return `${name} cannot be applied to this expression: it does not accept numeric expressions.`;
      // Computed expressions are numeric, so the function's first argument must accept a Number.
      const firstArgumentType = definition.arguments?.[0]?.dataType;
      if (!firstArgumentType) {
        return `${name} cannot be applied to this expression: it has no first argument that accepts a value.`;
      }
      return firstArgumentType.toLocaleLowerCase() === "number"
        ? null
        : `${name} cannot be applied to this expression: its first argument is ${firstArgumentType}, not Number.`;
    }
    case "unresolved":
      return `${name} cannot be applied to ${receiver.path || "this receiver"}: its receiver is not a known field or collection.`;
  }
}

function isCommentPosition(lineBeforeCursor: string) {
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < lineBeforeCursor.length; index++) {
    const character = lineBeforeCursor[index];
    if (quote) {
      if (character === quote && lineBeforeCursor[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
    } else if (character === "#") {
      return true;
    }
  }
  return false;
}

function scoreCandidate(candidate: Candidate, query: string) {
  const label = candidate.label.toLocaleLowerCase();
  const categoryScore = kindPriority[candidate.kind] * 1000;
  if (!query) return categoryScore + candidate.relevance;
  const normalizedQuery = query.toLocaleLowerCase();
  const exact = label === normalizedQuery;
  const startsWith = label.startsWith(normalizedQuery);
  const wordStart = label.split(/[\s._]/).some((word) => word.startsWith(normalizedQuery));
  const index = label.indexOf(normalizedQuery);
  if (!exact && index < 0) return Number.POSITIVE_INFINITY;
  const matchScore = exact ? 0 : startsWith ? 100 : wordStart ? 200 : 300;
  return matchScore * 100000
    + label.length * 100
    + kindPriority[candidate.kind] * 10
    + candidate.relevance
    + index;
}

export function getOQueryCompletions(
  text: string,
  position: number,
  fields: string[],
  relationFields: string[] = [],
  entities: string[],
  functionDefinitions: FunctionDefinition[],
  rootEntityName = "",
  suggestionEntities: OQuerySuggestionEntity[] = [],
): OQueryCompletionResult {
  const safePosition = Math.max(0, Math.min(position, text.length));
  const lineStart = text.lastIndexOf("\n", safePosition - 1) + 1;
  const lineBeforeCursor = text.slice(lineStart, safePosition);
  const tokenMatch = /[A-Za-z_][A-Za-z0-9_]*$/.exec(lineBeforeCursor);
  const query = tokenMatch?.[0] ?? "";
  const replaceStart = safePosition - query.length;
  if (isCommentPosition(lineBeforeCursor)) {
    return { items: [], replaceStart, replaceEnd: safePosition };
  }
  const context = getCompletionContext(lineBeforeCursor, text, safePosition);
  const relationPath = getRelationPath(text.slice(0, safePosition));
  const isAliasPosition = context === "projection" && isProjectionAliasPosition(lineBeforeCursor);
  const isNewLine = lineStart > 0 && text[lineStart - 1] === "\n";
  const scope = analyzeScope(text, safePosition, rootEntityName, suggestionEntities, fields);
  const dynamic = {
    contexts: [...scope.declared.keys()],
    joinAliases: [...scope.joins.keys()],
    aliases: scope.aliases,
  };
  const candidates: Candidate[] = [];
  const functionReceiver = resolveFunctionReceiver(text, safePosition, rootEntityName, suggestionEntities);
  const isAggregateDistinct = isAggregateDistinctPosition(text.slice(0, safePosition));
  const hasFunctionReceiver = functionReceiver.kind === "scalar" || functionReceiver.kind === "expression";
  const isInsideCall = isInsideAggregateCall(text.slice(0, safePosition), (name) =>
    functionDefinitions.some((definition) => definition.isAggregate && definition.name.toLocaleLowerCase() === name.toLocaleLowerCase()));
  const isApplicable = (definition: FunctionDefinition) =>
    getFunctionApplicabilityError(definition, functionReceiver, isInsideCall) === null;
  const suggestionContext = suggestionsFor(relationPath ? resolvePath(scope, relationPath.split(".")) : scope.root);

  if (context === "document" || context === "header") {
    entities.forEach((entity) => addCandidate(candidates, entity, "Entity", "entity", 0, context === "document" ? `${entity}: ` : entity, context === "document" ? entity.length + 2 : undefined));
    dynamic.contexts.forEach((name) => addCandidate(candidates, name, "Dynamic context", "context", 5));
    if (context === "header") addKeywords(candidates, expressionKeywords.filter(([label]) => label === "Is"), 10);
  } else if (context === "projection" && !/^\s/.test(lineBeforeCursor)) {
    entities.forEach((entity) => addCandidate(candidates, entity, "Entity", "entity", 0));
  }

  if (!hasFunctionReceiver && !isAliasPosition && (context === "projection" || context === "where" || context === "on" || context === "order" || context === "value")) {
    suggestionContext.relations.forEach((relation) => addCandidate(candidates, relation.name, "Relation", "relation", 0));
    suggestionContext.fields.forEach((field) => addCandidate(candidates, field, "Field", "field", 0));
    // A dotted path only offers members of the resolved source, not names in scope at the root.
    if (!relationPath) {
      dynamic.contexts.forEach((name) => addCandidate(candidates, name, "Declared context", "context", 1));
      dynamic.joinAliases.forEach((alias) => addCandidate(candidates, alias, "Join alias", "context", 1));
      if (isNewLine) addKeywords(candidates, clauseKeywords, 2);
      dynamic.aliases.forEach((alias) => addCandidate(candidates, alias, "Alias from this query", "alias", 4));
    }
  }

  if (hasFunctionReceiver) {
    if (context === "projection" || context === "where" || context === "on" || context === "order") {
      functionDefinitions
        .filter(isApplicable)
        .forEach((definition) => addFunctionCandidate(candidates, definition, 0));
      if (context === "projection" && isAggregateDistinct)
        addKeywords(candidates, expressionKeywords.filter(([label]) => label === "Distinct"), 4);
    }
  } else if (context === "projection" || context === "on" ||
    (functionReceiver.kind === "collection" && (context === "where" || context === "order"))) {
    functionDefinitions
      .filter(isApplicable)
      .forEach((definition) => addFunctionCandidate(candidates, definition, 3));
    if (context === "projection" &&
        (isAggregateDistinct || isProjectionDistinctPosition(lineBeforeCursor)))
      addKeywords(candidates, expressionKeywords.filter(([label]) => label === "Distinct"), 4);
  } else if (context === "clause") {
    addKeywords(candidates, clauseKeywords);
  } else if (!relationPath && (context === "where" || context === "on")) {
    addKeywords(candidates, expressionKeywords);
    operators.forEach(([label, detail]) => addCandidate(candidates, label, detail, "operator", 5, `${label} `));
  } else if (!relationPath && context === "order") {
    addKeywords(candidates, expressionKeywords.filter(([label]) => label === "Asc" || label === "Desc"));
  } else if (context === "join") {
    entities.forEach((entity) => addCandidate(candidates, entity, "Join target", "entity", 0));
    dynamic.contexts.forEach((name) => addCandidate(candidates, name, "Dynamic context", "context", 1));
    addCandidate(candidates, "On", "Join condition", "keyword", 2, "On ");
  } else if (context === "value") {
    addCandidate(candidates, "<value>", "Value in angle brackets", "value", 0, "<value>", 1);
    addKeywords(candidates, expressionKeywords.filter(([label]) => ["Null", "True", "False"].includes(label)));
  }

  const items = unique(candidates)
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, query) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => left.score - right.score || left.candidate.label.localeCompare(right.candidate.label))
    .slice(0, 20)
    .map(({ candidate }) => candidate);

  return { items, replaceStart, replaceEnd: safePosition };
}
