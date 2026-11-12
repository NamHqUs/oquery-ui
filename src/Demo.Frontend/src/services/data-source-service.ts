import { apiUrls } from "../const/api-urls";

// Loads an external datasource (VITE_DATA_SOURCE_URL by default). Not a database call.
export async function loadDataSource(url?: string) {
  const sourceUrl = url || apiUrls.dataSource;
  if (!sourceUrl) throw new Error("Set VITE_DATA_SOURCE_URL to load a datasource from an API.");

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Datasource request failed (${response.status}).`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload?.rows;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("Datasource API must return an array of objects or an object with a rows array.");
  }

  return { rows, name: Array.isArray(payload) ? undefined : payload.name };
}
