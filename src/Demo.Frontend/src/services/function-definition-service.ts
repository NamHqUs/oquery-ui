import { apiUrls } from "../const/api-urls";
import type { FunctionDefinition } from "../components/function-definition/types";
import { requestJson } from "./api-client";

let definitionsCache: FunctionDefinition[] | null = null;
let definitionsRequest: Promise<FunctionDefinition[]> | null = null;

function toFunctionDefinitions(payload: unknown): FunctionDefinition[] {
  if (!Array.isArray(payload) || payload.some((definition) =>
    !definition
    || typeof definition.name !== "string"
    || !definition.name.trim()
    || !Array.isArray(definition.arguments)
    || definition.arguments.some((argument: unknown) => !argument
      || typeof argument !== "object"
      || typeof (argument as { name?: unknown }).name !== "string"
      || typeof (argument as { dataType?: unknown }).dataType !== "string"))) {
    throw new Error("Function metadata API must return function definitions with names and arguments.");
  }
  return payload as FunctionDefinition[];
}

export function getDefinitions(): Promise<FunctionDefinition[]> {
  if (definitionsCache) return Promise.resolve(definitionsCache);
  if (!definitionsRequest) {
    definitionsRequest = requestJson(apiUrls.metadata.functions).then((payload) => {
      definitionsCache = toFunctionDefinitions(payload);
      return definitionsCache;
    }).finally(() => {
      definitionsRequest = null;
    });
  }
  return definitionsRequest;
}

export async function saveDefinition(name: string | undefined, payload: FunctionDefinition): Promise<FunctionDefinition> {
  const saved: FunctionDefinition | null = await requestJson(
    name ? apiUrls.metadata.functionByName(name) : apiUrls.metadata.functions,
    {
      method: name ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  invalidate();
  if (!saved) throw new Error("Function definition API did not return the saved definition.");
  return saved;
}

export async function deleteDefinition(name: string): Promise<void> {
  await requestJson(apiUrls.metadata.functionByName(name), { method: "DELETE" });
  invalidate();
}

export function invalidate() {
  definitionsCache = null;
}
