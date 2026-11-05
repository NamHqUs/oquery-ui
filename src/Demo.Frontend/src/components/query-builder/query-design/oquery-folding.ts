export type OqueryFold = { start: number; end: number; label: string };

export function getOqueryFolds(value: string): OqueryFold[] {
  const lines = value.split("\n");
  const folds: OqueryFold[] = [];
  for (let start = 0; start < lines.length; start++) {
    const line = lines[start]!;
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.match(/^\s*/)![0].length;
    let end = start;
    for (let next = start + 1; next < lines.length; next++) {
      const child = lines[next]!;
      if (!child.trim()) continue;
      if (child.match(/^\s*/)![0].length <= indent) break;
      end = next;
    }
    if (end > start) folds.push({ start, end, label: line.trim() });
  }
  return folds;
}

export function getFoldedOquery(value: string, collapsed: Set<number>) {
  const lines = value.split("\n");
  const folds = new Map(getOqueryFolds(value).map(fold => [fold.start, fold]));
  const visible: { line: number; offset: number; source: number }[] = [];
  let source = 0;
  let offset = 0;
  let hiddenUntil = -1;
  for (let line = 0; line < lines.length; line++) {
    if (line > hiddenUntil) {
      visible.push({ line, offset, source });
      offset += lines[line]!.length + 1;
      if (collapsed.has(line)) hiddenUntil = folds.get(line)?.end ?? line;
    }
    source += lines[line]!.length + 1;
  }
  return { text: visible.map(item => lines[item.line]).join("\n"), visible };
}

export function applyFoldedOqueryEdit(value: string, collapsed: Set<number>, next: string): string | null {
  if (collapsed.size === 0) return next;
  const projection = getFoldedOquery(value, collapsed);
  const previous = projection.text;
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = previous.length;
  let nextEnd = next.length;
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  const sourceOffset = (offset: number) => {
    const row = [...projection.visible].reverse().find(item => item.offset <= offset)!;
    return row.source + offset - row.offset;
  };
  const sourceStart = sourceOffset(start);
  const sourceEnd = sourceOffset(end);
  if (sourceEnd - sourceStart !== end - start) return null;
  return value.slice(0, sourceStart) + next.slice(start, nextEnd) + value.slice(sourceEnd);
}
