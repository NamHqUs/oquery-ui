export function getOQueryContextKeys(text: string): { start: number; end: number }[] {
  const keys: { start: number; end: number }[] = [];
  const contextNames = new Set<string>();
  for (const match of text.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/gm))
    keys.push({ start: match.index!, end: match.index! + match[1]!.length });

  for (const match of text.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+[A-Za-z_][A-Za-z0-9_]*\s*:/gim)) {
    contextNames.add(match[1]!);
    keys.push({ start: match.index!, end: match.index! + match[1]!.length });
  }

  for (const name of contextNames) {
    const referencePattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\.)`, "g");
    for (const match of text.matchAll(referencePattern))
      keys.push({ start: match.index!, end: match.index! + name.length });
  }

  return keys.sort((left, right) => left.start - right.start);
}
