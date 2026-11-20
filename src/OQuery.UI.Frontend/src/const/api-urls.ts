type OQueryRuntimeConfig = { apiBasePath?: string };

// The embedded host injects window.__OQUERY_CONFIG__; the Vite dev server falls back to VITE_BACKEND_API_URL.
const runtimeConfig = (window as Window & { __OQUERY_CONFIG__?: OQueryRuntimeConfig }).__OQUERY_CONFIG__;
const backendApiUrl = runtimeConfig?.apiBasePath ?? import.meta.env.VITE_BACKEND_API_URL ?? "";

export const apiUrls = {
  backend: backendApiUrl,
  dataSource: import.meta.env.VITE_DATA_SOURCE_URL || "",
  database: {
    connections: `${backendApiUrl}/db/connections`,
    provider: `${backendApiUrl}/db/connections/provider`,
    connection: `${backendApiUrl}/db/connection`,
    testConnection: `${backendApiUrl}/db/connection/test`,
    disconnect: `${backendApiUrl}/db/disconnect`,
    schema: `${backendApiUrl}/db/schema`,
    tableData: (tableName: string, schema?: string, limit?: number) => {
      const query = new URLSearchParams();
      if (schema) query.set("schema", schema);
      if (limit) query.set("limit", String(limit));
      const queryString = query.toString();
      return `${backendApiUrl}/db/data/${encodeURIComponent(tableName)}${queryString ? `?${queryString}` : ""}`;
    },
  },
  metadata: {
    projects: `${backendApiUrl}/metadata/projects`,
    createFromDatabase: `${backendApiUrl}/metadata/projects/from-database`,
    projectById: (projectId: string) => `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}`,
    fullDomain: (projectId: string) => `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/full-domain`,
    generateFullDomain: (projectId: string) => `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/full-domain/generate`,
    domainNames: (projectId: string) => `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/domains/names`,
    domains: (projectId: string) => `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/domains`,
    domainById: (projectId: string, domainId: string) =>
      `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}`,
    domainResolved: (projectId: string, domainId: string) =>
      `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}/resolved`,
    functions: (projectId: string) => `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/functions`,
    functionByName: (projectId: string, functionName: string) =>
      `${backendApiUrl}/metadata/projects/${encodeURIComponent(projectId)}/functions/${encodeURIComponent(functionName)}`,
  },
  dynamicQuery: {
    execute: `${backendApiUrl}/dynamic-query/query`,
    executeText: `${backendApiUrl}/dynamic-query/query/from-text`,
    executeContextText: (context: string) => `${backendApiUrl}/dynamic-query/query/from-text/${encodeURIComponent(context)}`,
    toString: `${backendApiUrl}/dynamic-query/query/to-string`,
    toOQuery: `${backendApiUrl}/dynamic-query/query/to-oquery`,
    fromOQuery: `${backendApiUrl}/dynamic-query/query/from-oquery`,
    toStringText: `${backendApiUrl}/dynamic-query/query/to-string-from-text`,
    toStringContextText: (context: string) => `${backendApiUrl}/dynamic-query/query/to-string-from-text/${encodeURIComponent(context)}`,
  },
  analytics: {
    adminSummary: `${backendApiUrl}/analytics/admin/summary`,
    adminUrls: `${backendApiUrl}/analytics/admin/urls`,
    adminPages: `${backendApiUrl}/analytics/admin/pages`,
  },
  queryRequests: {
    list: `${backendApiUrl}/query-request`,
    create: `${backendApiUrl}/query-request`,
    byId: (id: string) => `${backendApiUrl}/query-request/${encodeURIComponent(id)}`,
  },
} as const;
