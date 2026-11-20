import { apiUrls } from "../const/api-urls";
import { allScalarApplyFor, type FunctionApplyFor, type FunctionDefinition, type FunctionDefinitionPayload } from "../components/function-definition/types";
import { requestJson } from "./api-client";

let definitionsCache = new Map<string, FunctionDefinition[]>();
let definitionsRequests = new Map<string, Promise<FunctionDefinition[]>>();

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
  const definitions = payload as Array<FunctionDefinition & { applyFor?: unknown }>;
  if (definitions.some((definition) =>
    definition.applyFor !== undefined &&
    (typeof definition.applyFor !== "number" ||
      definition.applyFor === 0 ||
      (definition.applyFor & ~31) !== 0))) {
    throw new Error("Function metadata API returned an unsupported receiver applicability.");
  }
  return definitions.map((definition) => ({
    ...definition,
    // Older metadata has no receiver applicability; retain its previous behavior while
    // ensuring every definition used by the editor has an explicit value.
    applyFor: definition.applyFor === undefined
      ? definition.isAggregate ? 1 : allScalarApplyFor
      : definition.applyFor as FunctionApplyFor,
  }));
}

export function getDefinitions(projectId: string): Promise<FunctionDefinition[]> {
  const key = projectId.trim();
  const cached = definitionsCache.get(key);
  if (cached) return Promise.resolve(cached);
  let request = definitionsRequests.get(key);
  if (!request) {
    request = requestJson(apiUrls.metadata.functions(key)).then((payload) => {
      const definitions = toFunctionDefinitions(payload);
      definitionsCache.set(key, definitions);
      return definitions;
    }).finally(() => {
      definitionsRequests.delete(key);
    });
    definitionsRequests.set(key, request);
  }
  return request;
}

export async function saveDefinition(projectId: string, name: string | undefined, payload: FunctionDefinitionPayload): Promise<FunctionDefinition> {
  const saved: FunctionDefinition | null = await requestJson(
    name ? apiUrls.metadata.functionByName(projectId, name) : apiUrls.metadata.functions(projectId),
    {
      method: name ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  invalidate(projectId);
  if (!saved) throw new Error("Function definition API did not return the saved definition.");
  return saved;
}

export async function deleteDefinition(projectId: string, name: string): Promise<void> {
  await requestJson(apiUrls.metadata.functionByName(projectId, name), { method: "DELETE" });
  invalidate(projectId);
}

export function invalidate(projectId?: string) {
  if (projectId) definitionsCache.delete(projectId.trim());
  else definitionsCache.clear();
}
