export function toggleOqueryComments(text: string, selectionStart: number, selectionEnd: number) {
  const lineStart = selectionStart === 0 ? 0 : text.lastIndexOf("\n", selectionStart - 1) + 1;
  const selectedEnd = selectionEnd > selectionStart && text[selectionEnd - 1] === "\n"
    ? selectionEnd - 1
    : selectionEnd;
  const lineEnd = text.indexOf("\n", selectedEnd);
  const end = lineEnd < 0 ? text.length : lineEnd;
  const lines = text.slice(lineStart, end).split("\n");
  const contentLines = lines.filter((line) => line.trim());
  const uncomment = contentLines.length > 0
    && contentLines.every((line) => /^\s*#(?:\s|$)/.test(line));
  const replacement = lines.map((line) => {
    if (!line.trim()) return line;
    const indentation = line.match(/^\s*/)?.[0] ?? "";
    const content = line.slice(indentation.length);
    return uncomment
      ? `${indentation}${content.replace(/^#\s?/, "")}`
      : `${indentation}# ${content}`;
  }).join("\n");
  return {
    text: `${text.slice(0, lineStart)}${replacement}${text.slice(end)}`,
    start: lineStart,
    end,
    replacement,
  };
}
