import { isMap, isScalar, parseDocument, visit } from "yaml";

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
  return keys.sort((left, right) => left.start - right.start);
}
