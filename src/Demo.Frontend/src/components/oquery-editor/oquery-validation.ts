import type { FunctionDefinition } from "../function-definition/types";
import type { FilterOperatorDefinition } from "./query-design/query-builder-slice";

export function getOquerySyntaxError(
  text: string,
  functionDefinitions: FunctionDefinition[],
  filterOperators: FilterOperatorDefinition[],
): string | null {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() && !line.trimStart().startsWith("#") && !/^\s/.test(line));
  if (!firstLine || !/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:/i.test(firstLine)) {
    return "Invalid OQuery: expected a query header such as \"Users: Id, Name\".";
  }
  return getOqueryFilterSyntaxError(text, filterOperators) ?? getOqueryExpressionSyntaxError(text, functionDefinitions);
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

function getOqueryExpressionSyntaxError(text: string, functionDefinitions: FunctionDefinition[]): string | null {
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
      while (index < text.length && text[index] !== "\n") index++;
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
        requiredArguments: definition.arguments.filter((argument) =>
          argument.defaultValue === null || argument.defaultValue === undefined).length,
        totalArguments: definition.arguments.length,
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
    const effectiveArgumentCount = argumentCount + (hasImplicitReceiver ? 1 : 0);
    const errorLine = text.slice(0, nameStart).split(/\r?\n/).length;
    const lastLineBreak = text.lastIndexOf("\n", nameStart - 1);
    const errorColumn = nameStart - lastLineBreak;
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
