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
  ["Contains", "Text contains match"] as const,
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

function getDynamicCandidates(text: string) {
  const contexts: string[] = [];
  for (const match of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+is\s+[A-Za-z_][A-Za-z0-9_]*\s*:/gim)) {
    if (match[1]) contexts.push(match[1]);
  }

  const aliases: string[] = [];
  for (const match of text.matchAll(/\bas\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi)) {
    if (match[1]) aliases.push(match[1]);
  }

  return { contexts, aliases };
}

function getDynamicContextFields(text: string) {
  const contextFields = new Map<string, string[]>();
  let currentContext = "";
  const addProjection = (contextName: string, projection: string) => {
    const fields = contextFields.get(contextName) ?? [];
    for (const item of projection.split(",")) {
      const trimmedItem = item.trim();
      const expression = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(trimmedItem)?.[0];
      const asAlias = /\bas\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i.exec(trimmedItem)?.[1];
      const whitespaceAlias = /^[A-Za-z_][A-Za-z0-9_.]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(trimmedItem)?.[1];
      const field = asAlias ?? whitespaceAlias ?? expression;
      if (field && !fields.includes(field)) fields.push(field);
    }
    contextFields.set(contextName, fields);
  };

  for (const line of text.split(/\r?\n/)) {
    const contextHeader = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+is\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*(.*)$/i.exec(line);
    if (contextHeader) {
      currentContext = contextHeader[1]!;
      addProjection(currentContext, contextHeader[2]!);
      continue;
    }
    if (/^\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:/.test(line)
      || /^\s*(?:where|order|skip|take|join|(?:inner|left|right|full)\s+join)\b/i.test(line)) {
      currentContext = "";
      continue;
    }
    if (currentContext && line.trim()) addProjection(currentContext, line);
  }

  return contextFields;
}

function getCompletionContext(lineBeforeCursor: string, text: string, position: number): CompletionContext {
  const trimmed = lineBeforeCursor.trimStart();
  const lower = trimmed.toLocaleLowerCase();
  const hasHeader = /^[A-Za-z_][A-Za-z0-9_]*(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:/.test(trimmed);
  const isIndented = /^\s/.test(lineBeforeCursor);
  const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const beforeCurrentLine = text.slice(0, lineStart);
  const previousLines = beforeCurrentLine.split(/\r?\n/);
  const lastHeaderIndex = previousLines.reduce(
    (index, line, lineIndex) => /^\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:/.test(line)
      ? lineIndex
      : index,
    -1,
  );
  const lastClauseIndex = previousLines.reduce(
    (index, line, lineIndex) => /^\s*(?:where|order|skip|take|join|(?:inner|left|right|full)\s+join)\b/i.test(line)
      ? lineIndex
      : index,
    -1,
  );
  const isProjectionParagraph = lastHeaderIndex > lastClauseIndex;
  const isContextDeclaration = /^[A-Za-z_][A-Za-z0-9_]*\s+is\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*:|\s*$)/i.test(trimmed);

  if (!text.trim()) return "document";
  if (/^on(?:\s+|$)/i.test(trimmed) || /\bjoin\s+\S+\s+on(?:\s+|$)/i.test(lower)) return "on";
  if (/\b(?:join|(?:inner|left|right|full)\s+join)(?:\s+|$)/i.test(trimmed)) return "join";
  if (/^where(?:\s+|$)/i.test(trimmed)) {
    return /(?:=|!=|>=|<=|>|<)\s*$/.test(lineBeforeCursor) ? "value" : "where";
  }
  if (/^order(?:\s+|$)/i.test(trimmed)) return "order";
  if (isContextDeclaration && !/:\s*/.test(trimmed)) return "header";
  if (isProjectionParagraph && isIndented && !lineBeforeCursor.includes(":")) return "projection";
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
function isInsideFunctionCall(sourceBeforeCursor: string) {
  let depth = 0;
  for (const character of sourceBeforeCursor) {
    if (character === "\n") depth = 0;
    else if (character === "(") depth++;
    else if (character === ")") depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

// True when the cursor directly follows a dotted path, such as "HireDate." or "HireDate.Da".
function isImmediateDotPosition(lineBeforeCursor: string) {
  return /(?:^|[\s,(])[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\.[A-Za-z_]*$/.test(lineBeforeCursor);
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

function isCollectionPath(
  rootEntityName: string,
  relationPath: string | null,
  entities: OQuerySuggestionEntity[],
) {
  if (!relationPath) return false;
  let entity = entities.find((candidate) => candidate.name === rootEntityName);
  if (!entity) return false;

  const segments = relationPath.split(".");
  for (const [index, relationName] of segments.entries()) {
    const relation = entity.relations.find((candidate) => candidate.name === relationName);
    if (!relation) return false;
    if (index === segments.length - 1) return relation.kind === "collection";
    entity = entities.find((candidate) => candidate.name === relation.target);
    if (!entity) return false;
  }
  return false;
}

function getSuggestionContext(
  rootEntityName: string,
  relationPath: string | null,
  entities: OQuerySuggestionEntity[],
  fallbackFields: string[],
  dynamicContextFields: Map<string, string[]>,
) {
  if (relationPath) {
    const segments = relationPath.split(".");
    const declaredFields = dynamicContextFields.get(segments[0]!);
    if (declaredFields) {
      let fields = declaredFields;
      for (const segment of segments.slice(1)) {
        const prefix = `${segment}.`;
        fields = fields
          .filter((field) => field.startsWith(prefix))
          .map((field) => field.slice(prefix.length));
      }
      const relations = [...new Set(
        fields
          .filter((field) => field.includes("."))
          .map((field) => field.split(".")[0]!),
      )].map((name) => ({ name, target: "", kind: undefined }));
      return {
        fields: fields.filter((field) => !field.includes(".")),
        relations,
      };
    }
  }

  let entity = entities.find((candidate) => candidate.name === rootEntityName);
  if (!entity) {
    return {
      fields: fallbackFields,
      relations: [],
    };
  }
  if (!relationPath) return { fields: entity.fields, relations: entity.relations };

  for (const relationName of relationPath.split(".")) {
    const relation = entity.relations.find((candidate) => candidate.name === relationName);
    if (!relation) return { fields: [], relations: [] };
    entity = entities.find((candidate) => candidate.name === relation.target);
    if (!entity) return { fields: [], relations: [] };
  }

  return { fields: entity.fields, relations: entity.relations };
}


// Returns the data type of a scalar field path such as "HireDate" or "Manager.HireDate".
function getScalarFieldDataType(
  rootEntityName: string,
  relationPath: string,
  entities: OQuerySuggestionEntity[],
) {
  const segments = relationPath.split(".");
  const fieldName = segments.pop()!;
  let entity = entities.find((candidate) => candidate.name === rootEntityName);
  for (const relationName of segments) {
    const relation = entity?.relations.find((candidate) => candidate.name === relationName);
    entity = relation ? entities.find((candidate) => candidate.name === relation.target) : undefined;
  }
  if (!entity || entity.relations.some((relation) => relation.name === fieldName)) return null;
  return entity.fieldDataTypes?.[fieldName] ?? null;
}

// A function is a field-receiver candidate when its first argument accepts the field's data type.
function acceptsReceiverDataType(definition: FunctionDefinition, dataType: string) {
  const firstArgumentType = definition.arguments?.[0]?.dataType;
  return !definition.isAggregate
    && firstArgumentType !== undefined
    && firstArgumentType.toLocaleLowerCase() === dataType.toLocaleLowerCase();
}

function getActiveEntityName(text: string, position: number, fallback: string) {
  const lines = text.slice(0, position).split(/\r?\n/).reverse();
  for (const line of lines) {
    const contextHeader = /^\s*[A-Za-z_][A-Za-z0-9_]*\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
    if (contextHeader?.[1]) return contextHeader[1];
    const queryHeader = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
    if (queryHeader?.[1]) return queryHeader[1];
  }
  return fallback;
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
  const dynamic = getDynamicCandidates(text);
  const dynamicContextFields = getDynamicContextFields(text);
  const candidates: Candidate[] = [];
  const activeEntityName = getActiveEntityName(text, safePosition, rootEntityName);
  const receiverDataType = isImmediateDotPosition(lineBeforeCursor) && relationPath
    ? getScalarFieldDataType(activeEntityName, relationPath, suggestionEntities)
    : null;
  const suggestionContext = getSuggestionContext(activeEntityName, relationPath, suggestionEntities, fields, dynamicContextFields);
  const collectionPath = isCollectionPath(activeEntityName, relationPath, suggestionEntities);

  if (context === "document" || context === "header") {
    entities.forEach((entity) => addCandidate(candidates, entity, "Entity", "entity", 0, context === "document" ? `${entity}: ` : entity, context === "document" ? entity.length + 2 : undefined));
    dynamic.contexts.forEach((name) => addCandidate(candidates, name, "Dynamic context", "context", 5));
    if (context === "header") addKeywords(candidates, expressionKeywords.filter(([label]) => label === "Is"), 10);
  }

  if (!receiverDataType && !isAliasPosition && (context === "projection" || context === "where" || context === "on" || context === "order" || context === "value")) {
    suggestionContext.relations.forEach((relation) => addCandidate(candidates, relation.name, "Relation", "relation", 0));
    dynamic.contexts.forEach((name) => addCandidate(candidates, name, "Declared context", "context", 1));
    suggestionContext.fields.forEach((field) => addCandidate(candidates, field, "Field", "field", 0));
    if (isNewLine) addKeywords(candidates, clauseKeywords, 2);
    dynamic.aliases.forEach((alias) => addCandidate(candidates, alias, "Alias from this query", "alias", 4));
  }

  if (receiverDataType) {
    if (context === "projection" || context === "where" || context === "on" || context === "order") {
      functionDefinitions
        .filter((definition) => acceptsReceiverDataType(definition, receiverDataType))
        .forEach((definition) => addFunctionCandidate(candidates, definition, 0));
    }
  } else if (context === "projection" || context === "on") {
    if (isImmediateDotPosition(lineBeforeCursor)) {
      // After a dot only functions whose first argument is a collection (aggregates) fit a collection receiver.
      // Any other receiver, such as a lookup relation, has no matching function.
      if (collectionPath) {
        functionDefinitions
          .filter((definition) => definition.isAggregate)
          .forEach((definition) => addFunctionCandidate(candidates, definition, 3));
      }
    } else if (!isInsideFunctionCall(text.slice(0, safePosition))) {
      // In the root context, collection-first-argument (aggregate) functions are offered alongside the others.
      functionDefinitions.forEach((definition) => addFunctionCandidate(candidates, definition, 3));
    } else {
      // Inside an argument list aggregates stay hidden, because nested aggregates are not valid SQL.
      functionDefinitions
        .filter((definition) => !definition.isAggregate)
        .forEach((definition) => addFunctionCandidate(candidates, definition, 3));
    }
  } else if (context === "clause") {
    addKeywords(candidates, clauseKeywords);
  } else if (context === "where" || context === "on") {
    addKeywords(candidates, expressionKeywords);
    operators.forEach(([label, detail]) => addCandidate(candidates, label, detail, "operator", 5, `${label} `));
  } else if (context === "order") {
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
