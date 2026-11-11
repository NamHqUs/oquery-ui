const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || "";

export const apiUrls = {
  backend: backendApiUrl,
  dataSource: import.meta.env.VITE_DATA_SOURCE_URL || "",
  database: {
    connections: `${backendApiUrl}/db/connections`,
    provider: `${backendApiUrl}/db/connections/provider`,
    connect: `${backendApiUrl}/db/connect`,
    disconnect: `${backendApiUrl}/db/disconnect`,
    tables: `${backendApiUrl}/db/tables`,
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
    reset: `${backendApiUrl}/metadata/reset`,
    functions: `${backendApiUrl}/metadata/functions`,
    functionByName: (functionName: string) => `${backendApiUrl}/metadata/functions/${encodeURIComponent(functionName)}`,
    operators: `${backendApiUrl}/metadata/operators`,
    operatorById: (operatorId: string) => `${backendApiUrl}/metadata/operators/${encodeURIComponent(operatorId)}`,
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
  },
  queryRequests: {
    list: `${backendApiUrl}/query-request`,
    create: `${backendApiUrl}/query-request`,
    byId: (id: string) => `${backendApiUrl}/query-request/${encodeURIComponent(id)}`,
  },
} as const;
