export type OQueryContextKey = {
  start: number;
  end: number;
  kind: "context" | "table";
};

export function getOQueryContextKeys(text: string): OQueryContextKey[] {
  const searchableText = maskOQueryComments(text);
  const keys: OQueryContextKey[] = [];
  const contextNames = new Set<string>();
  for (const match of searchableText.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/gm))
    keys.push({ start: match.index!, end: match.index! + match[1]!.length, kind: "table" });

  for (const match of searchableText.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/gim)) {
    contextNames.add(match[1]!);
    keys.push({ start: match.index!, end: match.index! + match[1]!.length, kind: "context" });
    const tableStart = match.index! + match[0]!.indexOf(match[2]!, match[1]!.length);
    keys.push({ start: tableStart, end: tableStart + match[2]!.length, kind: "table" });
  }

  for (const name of contextNames) {
    const referencePattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    for (const match of searchableText.matchAll(referencePattern))
      if (!keys.some(key => key.start === match.index! && key.end === match.index! + name.length))
        keys.push({ start: match.index!, end: match.index! + name.length, kind: "context" });
  }

  return keys.sort((left, right) => left.start - right.start);
}

function maskOQueryComments(text: string): string {
  let quote: "'" | "\"" | null = null;
  return text.split("\n").map(line => {
    quote = null;
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (quote) {
        if (character === quote && line[index - 1] !== "\\") quote = null;
      } else if (character === "'" || character === "\"") {
        quote = character;
      } else if (character === "#") {
        return `${line.slice(0, index)}${" ".repeat(line.length - index)}`;
      }
    }
    return line;
  }).join("\n");
}
