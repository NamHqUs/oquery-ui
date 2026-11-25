import type { ProjectImportBundle } from "../../services/project-service";

// The File System Access API is Chromium-only and is missing from some TypeScript DOM libs, so the parts used here are declared.
type FolderEntry = { kind: "file" | "directory"; name: string };
type FileHandleLike = { getFile(): Promise<File> };
export type FolderHandle = {
  readonly name: string;
  values(): AsyncIterable<FolderEntry>;
  getFileHandle(name: string): Promise<FileHandleLike>;
  getDirectoryHandle(name: string): Promise<FolderHandle>;
};
type PickerWindow = Window & { showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<FolderHandle> };

export function isFolderPickerSupported(): boolean {
  return typeof (window as PickerWindow).showDirectoryPicker === "function";
}

/** Returns null when the user cancels the picker. */
export async function pickProjectFolder(): Promise<FolderHandle | null> {
  try {
    return await (window as PickerWindow).showDirectoryPicker!({ mode: "read" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

function isNotFound(error: unknown) {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not a JSON object.`);
  return value as Record<string, unknown>;
}

async function optionalDirectory(folder: FolderHandle, name: string): Promise<FolderHandle | null> {
  try {
    return await folder.getDirectoryHandle(name);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function readJsonFile(folder: FolderHandle, name: string): Promise<unknown> {
  const file = await (await folder.getFileHandle(name)).getFile();
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`${name} is not valid JSON.`);
  }
}

// Reads every *.json file in a folder as a JSON object, labelled by its path for error messages.
async function readJsonObjects(folder: FolderHandle | null, folderName: string): Promise<Array<{ name: string; value: Record<string, unknown> }>> {
  if (!folder) return [];
  const names: string[] = [];
  for await (const entry of folder.values()) {
    if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) names.push(entry.name);
  }
  const values: Array<{ name: string; value: Record<string, unknown> }> = [];
  for (const name of names.sort()) {
    values.push({ name, value: asObject(await readJsonFile(folder, name), `${folderName}/${name}`) });
  }
  return values;
}

/** Reads a project folder as the server stores it: project.json, domains/*.json, queries/*.json and {domainId}/playground/*.json. */
export async function readProjectFolder(folder: FolderHandle): Promise<ProjectImportBundle> {
  let project: Record<string, unknown>;
  try {
    project = asObject(await readJsonFile(folder, "project.json"), "project.json");
  } catch (error) {
    if (isNotFound(error)) throw new Error("The selected folder has no project.json. Select a project folder, not its parent.");
    throw error;
  }

  const domains = await readJsonObjects(await optionalDirectory(folder, "domains"), "domains");
  if (domains.length === 0) throw new Error("The selected project has no domains.");
  for (const { name, value } of domains) {
    if (Object.keys(value).some((key) => key.toLowerCase() === "fulldomain")) {
      throw new Error(`domains/${name} uses the legacy format. Open the project once in this version, then load it again.`);
    }
  }

  const queries = await readJsonObjects(await optionalDirectory(folder, "queries"), "queries");

  const playgrounds: Record<string, unknown>[] = [];
  for (const { value: domain } of domains) {
    const domainId = typeof domain.Id === "string" ? domain.Id : "";
    const domainFolder = domainId ? await optionalDirectory(folder, domainId) : null;
    const playgroundFolder = domainFolder ? await optionalDirectory(domainFolder, "playground") : null;
    for (const { value } of await readJsonObjects(playgroundFolder, `${domainId}/playground`)) playgrounds.push(value);
  }

  return {
    project,
    domains: domains.map(({ value }) => value),
    queries: queries.map(({ value }) => value),
    playgrounds,
  };
}
