import { apiUrls } from "../const/api-urls";
import type { DatabaseConnectRequest } from "../components/data-sources/database-slice";
import { requestJson } from "./api-client";
import * as dbSchemaService from "./db-schema-service";

export type DatabaseConnectionOptions = {
  providers: string[];
};

export type DatabaseConnectionResult = {
  provider: string;
};

export async function getConnectionOptions(): Promise<DatabaseConnectionOptions> {
  const payload = await requestJson(apiUrls.database.connections);
  if (!payload || !Array.isArray(payload.providers)
    || payload.providers.some((provider: unknown) => typeof provider !== "string")) {
    throw new Error("Database connection API returned invalid provider data.");
  }
  return payload;
}

export async function getProvider(): Promise<string | null> {
  const payload = await requestJson(apiUrls.database.provider);
  if (payload !== null && typeof payload !== "string") {
    throw new Error("Database provider API returned an invalid provider.");
  }
  return payload;
}

export async function connect(request: DatabaseConnectRequest): Promise<DatabaseConnectionResult> {
  const payload = await requestJson(apiUrls.database.connection, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!payload || typeof payload.provider !== "string") {
    throw new Error("Database connection API returned an invalid connection result.");
  }
  dbSchemaService.invalidateSchema();
  return payload;
}

export async function disconnect(): Promise<void> {
  await requestJson(apiUrls.database.disconnect, { method: "POST" });
  dbSchemaService.invalidateSchema();
}
