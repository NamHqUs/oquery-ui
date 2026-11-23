import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";

export type PlaygroundTab = { title: string; content: string };

export type PlaygroundPayload = {
  name: string;
  entity: string;
  domainId: string;
  tabs: PlaygroundTab[];
};

export type SavedPlayground = PlaygroundPayload & { id: string };

// Playgrounds saved before a name existed have no "name" in their JSON, so default it here.
function normalizePlayground(item: Partial<SavedPlayground>): SavedPlayground {
  return { ...item, name: item.name ?? "", tabs: item.tabs ?? [] } as SavedPlayground;
}

export async function fetchPlaygrounds(projectId: string, domainId: string): Promise<SavedPlayground[]> {
  const url = `${apiUrls.playgrounds.list}?projectId=${encodeURIComponent(projectId.trim())}&domainId=${encodeURIComponent(domainId.trim())}`;
  const items = await requestJson<Partial<SavedPlayground>[]>(url);
  return Array.isArray(items) ? items.map(normalizePlayground) : items;
}

export async function deleteSavedPlayground(projectId: string, domainId: string, id: string): Promise<void> {
  const url = `${apiUrls.playgrounds.byId(id)}?projectId=${encodeURIComponent(projectId.trim())}&domainId=${encodeURIComponent(domainId.trim())}`;
  await requestJson(url, { method: "DELETE" });
}
export async function savePlaygroundRequest(projectId: string, playground: PlaygroundPayload, id?: string): Promise<SavedPlayground> {
  const query = `?projectId=${encodeURIComponent(projectId.trim())}`;
  const saved = await requestJson<Partial<SavedPlayground>>(id ? `${apiUrls.playgrounds.byId(id)}${query}` : `${apiUrls.playgrounds.create}${query}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(playground),
  });
  return normalizePlayground(saved);
}
