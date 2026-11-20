const OQUERY_DRAFT_STORAGE_KEY = "OQuery.query-builder.draft";

type OQueryDraft = {
  sourceScope: string;
  text: string;
};

// A scope switch remounts the Query Builder, so the unfinished text is handed over through sessionStorage.
// A scope is `${projectId}/${domainId}`.
export function stashOQueryDraft(sourceScope: string, text: string): void {
  if (!text.trim()) {
    clearOQueryDraft();
    return;
  }
  const draft: OQueryDraft = { sourceScope, text };
  window.sessionStorage.setItem(OQUERY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function readOQueryDraft(targetScope: string): string | null {
  const raw = window.sessionStorage.getItem(OQUERY_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Partial<OQueryDraft>;
    if (typeof draft.sourceScope !== "string" || typeof draft.text !== "string") return null;
    return draft.sourceScope === targetScope ? null : draft.text;
  } catch {
    return null;
  }
}

export function clearOQueryDraft(): void {
  window.sessionStorage.removeItem(OQUERY_DRAFT_STORAGE_KEY);
}
