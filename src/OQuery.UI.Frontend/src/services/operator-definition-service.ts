import { apiUrls } from "../const/api-urls";
import { requestJson } from "./api-client";

export type OperatorDefinitionData = {
  id: string;
  name: string;
  symbol: string;
  description: string;
  leftOperandType: string;
  rightOperandType: string;
  supportedDataTypes: string[];
  sqlTemplates: Record<string, string>;
  isBuiltin: boolean;
  canDelete: boolean;
};

let operatorsCache: OperatorDefinitionData[] | null = null;
let operatorsRequest: Promise<OperatorDefinitionData[]> | null = null;

function toOperatorDefinitions(payload: unknown): OperatorDefinitionData[] {
  const definitions = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { value?: unknown }).value)
      ? (payload as { value: unknown[] }).value
      : null;
  if (!definitions || definitions.some((operator) =>
    !operator
    || typeof (operator as { id?: unknown }).id !== "string"
    || typeof (operator as { name?: unknown }).name !== "string"
    || typeof (operator as { symbol?: unknown }).symbol !== "string"
    || !Array.isArray((operator as { supportedDataTypes?: unknown }).supportedDataTypes))) {
    throw new Error("Operator metadata API must return operators with data types.");
  }
  return definitions as OperatorDefinitionData[];
}

export function getOperators(): Promise<OperatorDefinitionData[]> {
  if (operatorsCache) return Promise.resolve(operatorsCache);
  if (!operatorsRequest) {
    operatorsRequest = requestJson(apiUrls.metadata.operators).then((payload) => {
      operatorsCache = toOperatorDefinitions(payload);
      return operatorsCache;
    }).finally(() => {
      operatorsRequest = null;
    });
  }
  return operatorsRequest;
}

export async function saveOperator(id: string | null, payload: object): Promise<OperatorDefinitionData> {
  const saved: OperatorDefinitionData | null = await requestJson(
    id ? apiUrls.metadata.operatorById(id) : apiUrls.metadata.operators,
    {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  invalidate();
  if (!saved) throw new Error("Operator definition API did not return the saved definition.");
  return saved;
}

export async function deleteOperator(id: string): Promise<void> {
  await requestJson(apiUrls.metadata.operatorById(id), { method: "DELETE" });
  invalidate();
}

export function invalidate() {
  operatorsCache = null;
}
