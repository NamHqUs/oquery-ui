import { formatApiError } from "../components/query-builder/query-design/api-error";

// Shared transport for all services. Services own the URL, validation and caching;
// this module only performs the request and maps HTTP failures to readable errors.
async function send(url: string, options?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Could not reach the API: ${error instanceof Error ? error.message : "network error"}`);
  }
  if (!response.ok) {
    throw new Error(formatApiError(await response.text(), `Request failed (${response.status}).`));
  }
  return response;
}

export async function requestJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await send(url, options);
  if (response.status === 204) return null as T;
  try {
    return await response.json() as T;
  } catch {
    throw new Error("API returned invalid JSON.");
  }
}

export async function requestText(url: string, options?: RequestInit): Promise<string> {
  return (await send(url, options)).text();
}
