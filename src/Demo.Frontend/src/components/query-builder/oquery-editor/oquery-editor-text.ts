export function normalizeOqueryEditorText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
