import { isMap, isScalar, isSeq, parseDocument, visit } from "yaml";

export function getYamlContextKeys(text: string): { start: number; end: number }[] {
  const keys: { start: number; end: number }[] = [];
  const document = parseDocument(text);
  const contextNames = new Set<string>();
  visit(document, {
    Pair(_key, pair) {
      if (!isScalar(pair.key) || pair.key.value !== "Contexts" || !isMap(pair.value)) return;
      for (const context of pair.value.items) {
        if (!isScalar(context.key) || !context.key.range) continue;
        contextNames.add(String(context.key.value));
        keys.push({
          start: context.key.range[0],
          end: context.key.range[1],
        });
      }
    },
  });
  visit(document, {
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === "RefContext" &&
        isScalar(pair.value) && typeof pair.value.value === "string" &&
        contextNames.has(pair.value.value) && pair.value.range) {
        keys.push({ start: pair.value.range[0], end: pair.value.range[1] });
      }
    },
  });
  if (contextNames.size) {
    const names = [...contextNames].sort((left, right) => right.length - left.length)
      .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const contextReferencePattern = new RegExp(`(?:^|[^A-Za-z0-9_])(${names.join("|")})(?=\\.)`, "g");
    visit(document, {
      Pair(_key, pair) {
        if (!isScalar(pair.key) || pair.key.value !== "Projection" || !isSeq(pair.value)) return;
        for (const item of pair.value.items) {
          if (!isScalar(item) || typeof item.value !== "string" || !item.range) continue;
          const raw = text.slice(item.range[0], item.range[1]);
          for (const match of raw.matchAll(contextReferencePattern)) {
            const name = match[1]!;
            const matchStart = match.index! + match[0].length - name.length;
            keys.push({ start: item.range[0] + matchStart, end: item.range[0] + matchStart + name.length });
          }
        }
      },
    });
  }
  return keys.sort((left, right) => left.start - right.start);
}
