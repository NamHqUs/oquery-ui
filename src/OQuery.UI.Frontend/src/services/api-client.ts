import { formatApiError } from "./api-error";

// Shared transport for all services. Services own the URL, validation and caching;
// this module only performs the request and maps HTTP failures to readable errors.
// The section is identified by the server-issued cookie, which the browser sends with same-origin requests.
// The page path (no query string) is sent so the server can attribute each API call to the frontend page.
export const ANALYTICS_CONSENT_KEY = "oquery.analytics.consent";

export function readAnalyticsConsent(): "granted" | null {
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "granted" ? "granted" : null;
  } catch {
    return null;
  }
}

async function send(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  headers.set("X-Client-Page", window.location.pathname);
  if (readAnalyticsConsent() === "granted") headers.set("X-Analytics-Consent", "granted");
  else headers.delete("X-Analytics-Consent");
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
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
