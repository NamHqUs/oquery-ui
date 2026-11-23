// Remembers the last project and domain the user worked in, so leaving the playground (for example to
// Custom functions) and coming back restores the same selection instead of showing the project chooser.
const LAST_PLAYGROUND_SELECTION_KEY = "oquery.playground.last-selection";

type PlaygroundSelection = { projectId: string; domainId: string };

export function playgroundPath(projectId: string, domainId = "") {
  const segments = [projectId, domainId].filter(Boolean).map(encodeURIComponent).join("/");
  return `/playground/${segments}`;
}

export function rememberPlaygroundSelection(projectId: string, domainId: string) {
  if (!projectId) return;
  window.sessionStorage.setItem(LAST_PLAYGROUND_SELECTION_KEY, JSON.stringify({ projectId, domainId }));
}

export function rememberedPlaygroundSelection(): PlaygroundSelection | null {
  const stored = window.sessionStorage.getItem(LAST_PLAYGROUND_SELECTION_KEY);
  if (!stored) return null;
  const selection = JSON.parse(stored) as Partial<PlaygroundSelection>;
  if (!selection.projectId) return null;
  return { projectId: selection.projectId, domainId: selection.domainId ?? "" };
}

export function rememberedPlaygroundPath(): string | null {
  const selection = rememberedPlaygroundSelection();
  return selection ? playgroundPath(selection.projectId, selection.domainId) : null;
}
