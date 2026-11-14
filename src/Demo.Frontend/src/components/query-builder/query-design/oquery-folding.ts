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
