const OQUERY_DRAFT_STORAGE_KEY = "OQuery.query-builder.draft";

type OQueryDraft = {
  sourceDomainId: string;
  text: string;
};

// A domain switch remounts the Query Builder, so the unfinished text is handed over through sessionStorage.
export function stashOQueryDraft(sourceDomainId: string, text: string): void {
  if (!text.trim()) {
    clearOQueryDraft();
    return;
  }
  const draft: OQueryDraft = { sourceDomainId, text };
  window.sessionStorage.setItem(OQUERY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function readOQueryDraft(targetDomainId: string): string | null {
  const raw = window.sessionStorage.getItem(OQUERY_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Partial<OQueryDraft>;
    if (typeof draft.sourceDomainId !== "string" || typeof draft.text !== "string") return null;
    return draft.sourceDomainId === targetDomainId ? null : draft.text;
  } catch {
    return null;
  }
}

export function clearOQueryDraft(): void {
  window.sessionStorage.removeItem(OQUERY_DRAFT_STORAGE_KEY);
}
