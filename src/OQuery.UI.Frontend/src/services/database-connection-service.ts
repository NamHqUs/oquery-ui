import { apiUrls } from "../const/api-urls";
import type { DatabaseConnectRequest } from "../components/data-sources/database-slice";
import { requestJson } from "./api-client";
import * as dbSchemaService from "./db-schema-service";

export type DatabaseConnectionOptions = {
  providers: string[];
  profiles: string[];
  directConnectionsEnabled: boolean;
};

export type DatabaseConnectionResult = {
  provider: string;
  profileName: string | null;
};

export async function getConnectionOptions(): Promise<DatabaseConnectionOptions> {
  const payload = await requestJson(apiUrls.database.connections);
  if (!payload || !Array.isArray(payload.providers) || !Array.isArray(payload.profiles)
    || typeof payload.directConnectionsEnabled !== "boolean"
    || payload.providers.some((provider: unknown) => typeof provider !== "string")
    || payload.profiles.some((profile: unknown) => typeof profile !== "string")) {
    throw new Error("Database connection API returned invalid provider or profile data.");
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
  const payload = await requestJson(apiUrls.database.connect, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!payload || typeof payload.provider !== "string"
    || (payload.profileName !== null && typeof payload.profileName !== "string")) {
    throw new Error("Database connection API returned an invalid connection result.");
  }
  dbSchemaService.invalidateSchema();
  return payload;
}

export async function disconnect(): Promise<void> {
  await requestJson(apiUrls.database.disconnect, { method: "POST" });
  dbSchemaService.invalidateSchema();
}
