import type { FunctionDefinition } from "../function-definition/types";
import type { FilterOperatorDefinition } from "./filter-operators";
import {
  getFunctionApplicabilityError,
  isInsideAggregateCall,
  resolveFunctionReceiver,
  type OQuerySuggestionEntity,
} from "./oquery-completions";

export type OQueryErrorPosition = {
  line: number;
  column: number;
  length: number;
};

export function getOqueryErrorPosition(error: string): OQueryErrorPosition | null {
  const location = /Line\s+(\d+),\s+column\s+(\d+)/i.exec(error);
  if (!location) return null;
  const functionName = /:\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:requires|accepts|cannot)/i.exec(error)?.[1];
  return {
    line: Number(location[1]),
    column: Number(location[2]),
    length: functionName?.length ?? 1,
  };
}

export function getOquerySyntaxError(
  text: string,
  functionDefinitions: FunctionDefinition[],
  filterOperators: FilterOperatorDefinition[],
  suggestionEntities: OQuerySuggestionEntity[] = [],
  rootEntityName = "",
): string | null {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() && !line.trimStart().startsWith("#") && !/^\s/.test(line));
  if (!firstLine || !/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:/i.test(firstLine)) {
    return "Line 1, column 1: Invalid OQuery: expected a query header such as \"Users: Id, Name\".";
  }
  return getOqueryFilterSyntaxError(text, filterOperators)
    ?? getOqueryDistinctSyntaxError(text, functionDefinitions)
    ?? getOqueryExpressionSyntaxError(text, functionDefinitions, suggestionEntities, rootEntityName);
}

function getOqueryDistinctSyntaxError(
  text: string,
  functionDefinitions: FunctionDefinition[],
): string | null {
  const aggregateNames = new Set(
    functionDefinitions
      .filter((definition) => definition.isAggregate)
      .map((definition) => definition.name.toLocaleLowerCase()),
  );
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/#.*$/, "");
    const distinct = /\bdistinct\b/i.exec(line);
    if (!distinct) continue;
    const before = line.slice(0, distinct.index).trimEnd();
    const projectionDistinct = /(?:^|:)\s*(?:select)?\s*$/i.test(before);
    const aggregateDistinct = /(?:^|[\s,(:])([A-Za-z_][A-Za-z0-9_.]*)\s*\(\s*$/i.exec(before);
    if (projectionDistinct ||
        (aggregateDistinct && aggregateNames.has(aggregateDistinct[1]!.split(".").pop()!.toLocaleLowerCase())))
      continue;
    return `Line ${index + 1}, column ${distinct.index + 1}: distinct is only valid at the start of a projection or aggregate argument.`;
  }
  return null;
}

function getOqueryFilterSyntaxError(text: string, filterOperators: FilterOperatorDefinition[]): string | null {
  const operatorTokens = filterOperators
    .flatMap((operator) => [operator.symbol, operator.name])
    .filter((token) => token.trim())
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const operatorPattern = operatorTokens.length
    ? new RegExp(`(?:${operatorTokens.join("|")})`, "i")
    : /[=<>!]|\b(?:IS|IN|LIKE|BETWEEN|CONTAINS|NULL)\b/i;

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = /^(\s*)(?:Filter\s*:\s*|where\s+)(.*)$/i.exec(line);
    const expression = match?.[2]?.trim();
    if (!match || !expression || operatorPattern.test(expression)) continue;
    const column = line.indexOf(expression) + 1;
    return `Line ${index + 1}, column ${column}: where expression must include an operator. Try "where UserId = <value>".`;
  }

  return null;
}

function getOqueryExpressionSyntaxError(
  text: string,
  functionDefinitions: FunctionDefinition[],
  suggestionEntities: OQuerySuggestionEntity[],
  rootEntityName: string,
): string | null {
  const openings: Array<{ line: number; column: number }> = [];
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  let line = 1;
  let column = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    column += 1;
    if (character === "\n") {
      line += 1;
      column = 0;
      escaped = false;
      continue;
    }
    if (character === "#" && !quote) {
      const lineEnd = text.indexOf("\n", index);
      index = lineEnd < 0 ? text.length : lineEnd - 1;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (character === "(") {
      openings.push({ line, column });
      continue;
    }
    if (character !== ")") continue;
    if (!openings.pop()) return `Line ${line}, column ${column}: Unexpected closing ")" in expression.`;
  }

  const opening = openings[openings.length - 1];
  if (opening) return `Line ${opening.line}, column ${opening.column}: Function expression is missing a closing ")".`;

  const functionSignatures = new Map(
    functionDefinitions.map((definition) => [
      definition.name.toLocaleLowerCase(),
      {
        name: definition.name,
        definition,
        requiredArguments: definition.arguments.filter((argument) =>
          argument.defaultValue === null || argument.defaultValue === undefined).length,
        totalArguments: definition.arguments.length,
        isAggregate: definition.isAggregate,
      },
    ]),
  );
  let functionQuote: "'" | "\"" | null = null;
  let functionEscaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (functionQuote) {
      if (functionEscaped) functionEscaped = false;
      else if (character === "\\") functionEscaped = true;
      else if (character === functionQuote) functionQuote = null;
      continue;
    }
    if (character === "#") {
      const lineEnd = text.indexOf("\n", index);
      index = lineEnd < 0 ? text.length : lineEnd - 1;
      continue;
    }
    if (character === "'" || character === "\"") {
      functionQuote = character;
      continue;
    }
    if (!/[A-Za-z_]/.test(character)) continue;
    const nameStart = index;
    let nameEnd = index + 1;
    while (nameEnd < text.length && /[A-Za-z0-9_]/.test(text[nameEnd]!)) nameEnd += 1;
    const signature = functionSignatures.get(text.slice(nameStart, nameEnd).toLocaleLowerCase());
    if (!signature) {
      index = nameEnd - 1;
      continue;
    }
    let openingIndex = nameEnd;
    while (openingIndex < text.length && /\s/.test(text[openingIndex]!)) openingIndex += 1;
    if (text[openingIndex] !== "(") {
      index = nameEnd - 1;
      continue;
    }

    let depth = 1;
    let argumentCount = 0;
    let hasArgument = false;
    let argumentQuote: "'" | "\"" | null = null;
    let argumentEscaped = false;
    for (let argumentIndex = openingIndex + 1; argumentIndex < text.length; argumentIndex += 1) {
      const argumentCharacter = text[argumentIndex]!;
      if (argumentQuote) {
        if (argumentEscaped) argumentEscaped = false;
        else if (argumentCharacter === "\\") argumentEscaped = true;
        else if (argumentCharacter === argumentQuote) argumentQuote = null;
        continue;
      }
      if (argumentCharacter === "#") {
        const lineEnd = text.indexOf("\n", argumentIndex);
        argumentIndex = lineEnd < 0 ? text.length : lineEnd - 1;
        continue;
      }
      if (argumentCharacter === "'" || argumentCharacter === "\"") {
        argumentQuote = argumentCharacter;
      } else if (argumentCharacter === "(") {
        depth += 1;
        hasArgument = true;
      } else if (argumentCharacter === ")") {
        depth -= 1;
        if (depth === 0) {
          if (hasArgument) argumentCount += 1;
          break;
        }
      } else if (depth === 1 && argumentCharacter === ",") {
        argumentCount += 1;
      } else if (depth === 1 && !/\s/.test(argumentCharacter)) {
        hasArgument = true;
      }
    }

    const hasImplicitReceiver = text[nameStart - 1] === ".";
    const applyFor = signature.definition.applyFor ?? (signature.isAggregate ? 1 : 2 | 4 | 8 | 16);
    const effectiveArgumentCount = argumentCount
      + (hasImplicitReceiver && (applyFor & 1) === 0 ? 1 : 0);
    const errorLine = text.slice(0, nameStart).split(/\r?\n/).length;
    const lastLineBreak = text.lastIndexOf("\n", nameStart - 1);
    const errorColumn = nameStart - lastLineBreak;
    // Receivers that metadata cannot resolve (for example dynamic contexts) are left to the backend compiler.
    const receiver = resolveFunctionReceiver(text, nameStart, rootEntityName, suggestionEntities);
    if (receiver.kind !== "unresolved") {
      const applicabilityError = getFunctionApplicabilityError(
        signature.definition,
        receiver,
        isInsideAggregateCall(text.slice(0, nameStart), (name) => functionSignatures.get(name.toLocaleLowerCase())?.isAggregate === true),
      );
      if (applicabilityError) return `Line ${errorLine}, column ${errorColumn}: ${applicabilityError}`;
    }
    if (effectiveArgumentCount < signature.requiredArguments) {
      return `Line ${errorLine}, column ${errorColumn}: ${signature.name} requires at least ${signature.requiredArguments} argument(s), but ${effectiveArgumentCount} provided.`;
    }
    if (effectiveArgumentCount > signature.totalArguments) {
      return `Line ${errorLine}, column ${errorColumn}: ${signature.name} accepts at most ${signature.totalArguments} argument(s), but ${effectiveArgumentCount} provided.`;
    }
    index = nameEnd - 1;
  }

  return null;
}
