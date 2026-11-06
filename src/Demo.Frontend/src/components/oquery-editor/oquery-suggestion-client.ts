import { apiUrls } from "../../const/api-urls";

export type OQuerySuggestionItem = {
  label: string;
  insertText: string;
  detail: string;
  kind: string;
  sortOrder: number;
};

export type OQuerySuggestionResponse = {
  items: OQuerySuggestionItem[];
  replaceStart: number;
  replaceEnd: number;
  documentVersion: number;
};

export async function fetchOQuerySuggestions(
  request: { text: string; line: number; column: number; documentVersion: number },
  signal: AbortSignal,
): Promise<OQuerySuggestionResponse> {
  const response = await fetch(apiUrls.oquery.suggestions, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Suggestion request failed (${response.status}).`);
  }
  return response.json() as Promise<OQuerySuggestionResponse>;
}

export async function validateOQueryText(text: string, signal: AbortSignal) {
  const response = await fetch(apiUrls.dynamicQuery.fromOQuery, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (response.ok) return null;
  const raw = await response.text();
  try {
    const problem = JSON.parse(raw) as { detail?: string; title?: string; errors?: Record<string, string[]> };
    const details = Object.values(problem.errors ?? {}).flat();
    return details[0] ?? problem.detail ?? problem.title ?? "The OQuery text is invalid.";
  } catch {
    return raw || "The OQuery text is invalid.";
  }
}
