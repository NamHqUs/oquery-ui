const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || "";

export const apiUrls = {
  backend: backendApiUrl,
  dataSource: import.meta.env.VITE_DATA_SOURCE_URL || "",
  database: {
    connections: `${backendApiUrl}/db/connections`,
    provider: `${backendApiUrl}/db/connections/provider`,
    connection: `${backendApiUrl}/db/connection`,
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
    functions: `${backendApiUrl}/metadata/functions`,
    functionByName: (functionName: string) => `${backendApiUrl}/metadata/functions/${encodeURIComponent(functionName)}`,
    createDomain: `${backendApiUrl}/metadata/domains`,
    generateDomain: `${backendApiUrl}/metadata/domains/generate`,
    domainById: (domainId: string) => `${backendApiUrl}/metadata/domains/${encodeURIComponent(domainId)}`,
    domainNames: `${backendApiUrl}/metadata/domains/names`,
    domainNamesWithDescriptions: `${backendApiUrl}/metadata/domains/names-with-descriptions`,
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
    events: `${backendApiUrl}/analytics/events`,
    adminSummary: `${backendApiUrl}/analytics/admin/summary`,
    adminPages: `${backendApiUrl}/analytics/admin/pages`,
    adminVisitors: `${backendApiUrl}/analytics/admin/visitors`,
    adminSources: `${backendApiUrl}/analytics/admin/sources`,
  },
  queryRequests: {
    list: `${backendApiUrl}/query-request`,
    create: `${backendApiUrl}/query-request`,
    byId: (id: string) => `${backendApiUrl}/query-request/${encodeURIComponent(id)}`,
  },
} as const;
