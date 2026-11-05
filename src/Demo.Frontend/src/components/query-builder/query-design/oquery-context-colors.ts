export function getOQueryContextKeys(text: string): { start: number; end: number }[] {
  const searchableText = maskOQueryComments(text);
  const keys: { start: number; end: number }[] = [];
  const contextNames = new Set<string>();
  for (const match of searchableText.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/gm))
    keys.push({ start: match.index!, end: match.index! + match[1]!.length });

  for (const match of searchableText.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+[A-Za-z_][A-Za-z0-9_]*\s*:/gim)) {
    contextNames.add(match[1]!);
    keys.push({ start: match.index!, end: match.index! + match[1]!.length });
  }

  for (const name of contextNames) {
    const referencePattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\.)`, "g");
    for (const match of searchableText.matchAll(referencePattern))
      keys.push({ start: match.index!, end: match.index! + name.length });
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
