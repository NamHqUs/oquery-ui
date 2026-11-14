const oqueryListSections = new Set(["Projection", "Sorts", "Contexts"]);

function getOqueryLineContext(value: string, position: number) {
  const beforeCursor = value.slice(0, position);
  const lineStart = beforeCursor.lastIndexOf("\n") + 1;
  const lineEnd = value.indexOf("\n", lineStart);
  const currentLine = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd);
  const lines = value.slice(0, lineStart).split(/\r?\n/);
  const currentIndentation = currentLine.match(/^\s*/)?.[0] ?? "";
  const keyHeaders = lines.flatMap((line) => {
    const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(line);
    return match ? [{ indentation: match[1]!, name: match[2]! }] : [];
  });
  const parentHeader = [...keyHeaders]
    .reverse()
    .find((header) => header.indentation.length < currentIndentation.length)
    ?? keyHeaders[keyHeaders.length - 1];

  return {
    beforeCursor,
    lineStart,
    currentLine,
    section: parentHeader?.name ?? "",
    sectionIndentation: parentHeader?.indentation ?? "",
  };
}

// Returns the full replacement text and caret for Enter inside OQuery sections.
export function getOqueryEnterEdit(value: string, selectionStart: number, selectionEnd: number) {
  const { beforeCursor, lineStart, currentLine, section, sectionIndentation } = getOqueryLineContext(value, selectionStart);
  const afterCursor = value.slice(selectionEnd);
  const isListSection = oqueryListSections.has(section);
  const trimmedLine = currentLine.trim();
  const sectionHeader = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(trimmedLine);
  const isListSectionHeader = sectionHeader ? oqueryListSections.has(sectionHeader[1]!) : false;
  const isTopLevelKey = !/^\s/.test(currentLine)
    && /^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(trimmedLine);
  const isEmptyListItem = /^-\s*$/.test(trimmedLine);

  if (isEmptyListItem) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    const parentIndentation = indentation.slice(0, Math.max(0, indentation.length - 2));
    const normalizedBeforeCursor = `${value.slice(0, lineStart)}${parentIndentation}`;
    return { value: `${normalizedBeforeCursor}${afterCursor}`, caret: normalizedBeforeCursor.length };
  }
  if (!trimmedLine) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    if (!indentation) return { value: `${beforeCursor}\n${afterCursor}`, caret: beforeCursor.length + 1 };
    const parentIndentation = indentation.slice(0, Math.max(0, indentation.length - 2));
    const normalizedBeforeCursor = `${value.slice(0, lineStart)}${parentIndentation}`;
    return { value: `${normalizedBeforeCursor}${afterCursor}`, caret: normalizedBeforeCursor.length };
  }
  if ((!isListSection && !isListSectionHeader) || (isTopLevelKey && !isListSectionHeader)) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    return { value: `${beforeCursor}\n${indentation}${afterCursor}`, caret: beforeCursor.length + indentation.length + 1 };
  }
  if (isListSectionHeader) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    const inserted = `\n${indentation}  - `;
    return { value: `${beforeCursor}${inserted}${afterCursor}`, caret: beforeCursor.length + inserted.length };
  }
  const itemText = trimmedLine.replace(/^-+\s*/, "");
  const listIndentation = `${sectionIndentation}  `;
  const normalizedLine = `${listIndentation}- ${itemText}`;
  const normalizedBeforeCursor = `${value.slice(0, lineStart)}${normalizedLine}`;
  const inserted = `\n${listIndentation}- `;
  return {
    value: `${normalizedBeforeCursor}${inserted}${afterCursor}`,
    caret: normalizedBeforeCursor.length + inserted.length,
  };
}
