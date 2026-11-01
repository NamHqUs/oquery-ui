import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { apiUrls } from "../../const/api-urls";

const MAX_TABLE_DATA_ROWS = 10;

export type DatabaseConnectRequest =
  | { profile: string }
  | { provider: string; connectionString: string };

type DatabaseConnectionOptionsDto = {
  providers: string[];
  profiles: string[];
  directConnectionsEnabled: boolean;
};

type DatabaseConnectionResponseDto = {
  provider: string;
  profileName: string | null;
};

async function getJson(url, init = {}, allowNoContent = false) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`Could not reach the database API: ${error.message}`);
  }

  if (!response.ok) {
    let detail = `Database request failed (${response.status}).`;
    try {
      const problem = await response.json();
      if (typeof problem?.detail === "string") detail = problem.detail;
    } catch {
      // Keep the HTTP status message when the server does not return a problem document.
    }
    throw new Error(detail);
  }

  if (allowNoContent && response.status === 204) return null;

  try {
    return await response.json();
  } catch {
    throw new Error("Database API returned invalid JSON.");
  }
}

export const fetchDatabaseConnections = createAsyncThunk(
  "database/fetchConnections",
  async (_, { rejectWithValue }) => {
    let payload: DatabaseConnectionOptionsDto;
    try {
      payload = await getJson(apiUrls.database.connections);
    } catch (error) {
      return rejectWithValue(error.message);
    }
    if (!payload || !Array.isArray(payload.providers) || !Array.isArray(payload.profiles)
      || typeof payload.directConnectionsEnabled !== "boolean"
      || payload.providers.some((provider) => typeof provider !== "string")
      || payload.profiles.some((profile) => typeof profile !== "string")) {
      return rejectWithValue("Database connection API returned invalid provider or profile data.");
    }
    return payload;
  },
  {
    condition: (_, { getState }) => {
      const { connectionOptionsStatus } = getState().database;
      return connectionOptionsStatus !== "loading" && connectionOptionsStatus !== "succeeded";
    },
  },
);

export const fetchDbProvider = createAsyncThunk(
  "database/fetchProvider",
  async (_, { rejectWithValue }) => {
    let payload: unknown;
    try {
      payload = await getJson(apiUrls.database.provider, {}, true);
    } catch (error) {
      return rejectWithValue(error.message);
    }
    if (payload !== null && typeof payload !== "string") {
      return rejectWithValue("Database provider API returned an invalid provider.");
    }
    return payload;
  },
);

export const connectDatabase = createAsyncThunk(
  "database/connect",
  async (request: DatabaseConnectRequest, { rejectWithValue }) => {
    let payload: DatabaseConnectionResponseDto;
    try {
      const response = await fetch(apiUrls.database.connect, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        let detail = `Database connection failed (${response.status}).`;
        try {
          const problem = await response.json();
          if (typeof problem.detail === "string") detail = problem.detail;
        } catch {
          // Keep the HTTP status message when the server does not return a problem document.
        }
        throw new Error(detail);
      }
      payload = await response.json();
    } catch (error) {
      return rejectWithValue(error.message || "Could not connect to the database.");
    }
    if (!payload || typeof payload.provider !== "string"
      || (payload.profileName !== null && typeof payload.profileName !== "string")) {
      return rejectWithValue("Database connection API returned an invalid connection result.");
    }
    return payload;
  },
);

export const disconnectDatabase = createAsyncThunk(
  "database/disconnect",
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch(apiUrls.database.disconnect, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Database disconnect failed (${response.status}).`);
      return true;
    } catch (error) {
      return rejectWithValue(error.message || "Could not disconnect from the database.");
    }
  },
);

export const fetchDbTables = createAsyncThunk(
  "database/fetchTables",
  async (_, { rejectWithValue }) => {
    let payload;
    try {
      payload = await getJson(apiUrls.database.tables);
    } catch (error) {
      return rejectWithValue(error.message);
    }
    if (!Array.isArray(payload) || payload.some((table) => typeof table !== "string")) {
      return rejectWithValue("Database tables API must return an array of table names.");
    }
    return payload;
  },
  {
    condition: (_, { getState }) => {
      const { tableStatus, connectionStatus } = getState().database;
      return connectionStatus !== "failed" && connectionStatus !== "loading"
        && tableStatus !== "loading" && tableStatus !== "succeeded";
    },
  },
);

export const fetchDbSchema = createAsyncThunk(
  "database/fetchSchema",
  async (_, { rejectWithValue }) => {
    let payload;
    try {
      payload = await getJson(apiUrls.database.schema);
    } catch (error) {
      return rejectWithValue(error.message);
    }
    if (!payload || !Array.isArray(payload.tables) || !Array.isArray(payload.relationships)
      || payload.tables.some((table) => typeof table.schema !== "string"
        || typeof table.name !== "string"
        || !Array.isArray(table.columns)
        || table.columns.some((column) => typeof column.name !== "string"
          || typeof column.dataType !== "string"
          || typeof column.isPrimaryKey !== "boolean"
          || typeof column.isNullable !== "boolean"))
      || payload.relationships.some((relation) => typeof relation.name !== "string"
        || typeof relation.sourceSchema !== "string"
        || typeof relation.sourceTable !== "string"
        || !Array.isArray(relation.sourceColumns)
        || typeof relation.targetSchema !== "string"
        || typeof relation.targetTable !== "string"
        || !Array.isArray(relation.targetColumns)
        || typeof relation.isUnique !== "boolean")) {
      return rejectWithValue("Database schema API returned invalid table or relationship metadata.");
    }
    return payload;
  },
  {
    condition: (_, { getState }) => {
      const { schemaStatus, connectionStatus } = getState().database;
      return connectionStatus !== "failed" && connectionStatus !== "loading"
        && schemaStatus !== "loading" && schemaStatus !== "succeeded";
    },
  },
);

function tableDataKey(tableName, schema = "") {
  return schema ? `${schema}.${tableName}` : tableName;
}

export const fetchDbTableData = createAsyncThunk(
  "database/fetchTableData",
  async (request, { rejectWithValue }) => {
    const { tableName, schema = "", limit = MAX_TABLE_DATA_ROWS } = typeof request === "string" ? { tableName: request } : request;
    const rowLimit = Math.min(limit, MAX_TABLE_DATA_ROWS);
    let payload;
    try {
      payload = await getJson(apiUrls.database.tableData(tableName, schema, rowLimit));
    } catch (error) {
      return rejectWithValue(error.message);
    }
    if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.columns)
      || payload.columns.some((column) => typeof column !== "string")
      || !Array.isArray(payload.rows)
      || payload.rows.some((row) => !Array.isArray(row) || row.some((value) => typeof value !== "string"))) {
      return rejectWithValue("Database table API must return a table name, column names, and rows of string values.");
    }
    return {
      key: tableDataKey(tableName, schema),
      name: payload.name,
      columns: payload.columns,
      rows: payload.rows.slice(0, MAX_TABLE_DATA_ROWS),
      limit: rowLimit,
    };
  },
  {
    condition: (request, { getState }) => {
      const { tableName, schema = "", limit = MAX_TABLE_DATA_ROWS, refresh = false } = typeof request === "string" ? { tableName: request } : request;
      const { connectionStatus, dataByTable } = getState().database;
      const { status, limit: existingLimit } = dataByTable[tableDataKey(tableName, schema)] || {};
      const requestedLimit = Math.min(limit, MAX_TABLE_DATA_ROWS);
      return connectionStatus === "succeeded" && status !== "loading"
        && (refresh || status !== "succeeded" || existingLimit !== requestedLimit);
    },
  },
);

const databaseSlice = createSlice({
  name: "database",
  initialState: {
    connectionProfiles: [] as string[],
    providers: [] as string[],
    directConnectionsEnabled: false,
    connectionOptionsStatus: "idle",
    connectionOptionsError: "",
    providerCheckStatus: "idle",
    connectionStatus: "idle",
    connectionError: "",
    connectingProvider: "",
    connectingProfileName: "",
    connectedProvider: "",
    connectedProfileName: "",
    tables: [],
    selectedTable: "",
    selectedSchema: "",
    previewTable: null as { name: string; schema: string } | null,
    viewMode: "diagram",
    tableStatus: "idle",
    tableError: "",
    schemaStatus: "idle",
    schemaError: "",
    schema: { tables: [], relationships: [] },
    dataByTable: {},
    debugUiEnabled: true,
  },
  reducers: {
    setDatabaseDebugUiEnabled(state, action: PayloadAction<boolean>) {
      state.debugUiEnabled = action.payload;
    },
    selectDbTable(state, action) {
      if (typeof action.payload === "string") {
        state.selectedTable = action.payload;
        state.selectedSchema = "";
      } else {
        state.selectedTable = action.payload.name;
        state.selectedSchema = action.payload.schema || "";
      }
    },
    setPreviewDbTable(state, action) {
      state.previewTable = {
        name: action.payload.name,
        schema: action.payload.schema || "",
      };
    },
    setDatabaseViewMode(state, action) {
      state.viewMode = action.payload;
    },
    setColumnFilter(state, action) {
      const { tableName, column, value } = action.payload;
      const tableData = state.dataByTable[tableDataKey(tableName, action.payload.schema || "")];
      if (tableData) tableData.filters[column] = value;
    },
    setTableSort(state, action) {
      const { tableName, column } = action.payload;
      const tableData = state.dataByTable[tableDataKey(tableName, action.payload.schema || "")];
      if (!tableData) return;
      if (tableData.sort?.column === column) {
        tableData.sort.direction = tableData.sort.direction === "asc" ? "desc" : "asc";
      } else {
        tableData.sort = { column, direction: "asc" };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatabaseConnections.pending, (state) => {
        state.connectionOptionsStatus = "loading";
        state.connectionOptionsError = "";
      })
      .addCase(fetchDatabaseConnections.fulfilled, (state, action) => {
        state.providers = action.payload.providers;
        state.connectionProfiles = action.payload.profiles;
        state.directConnectionsEnabled = action.payload.directConnectionsEnabled;
        state.connectionOptionsStatus = "succeeded";
      })
      .addCase(fetchDatabaseConnections.rejected, (state, action) => {
        state.connectionOptionsStatus = "failed";
        state.connectionOptionsError = action.payload || action.error.message || "Unable to load connection options.";
      })
      .addCase(fetchDbProvider.pending, (state) => {
        state.providerCheckStatus = "loading";
      })
      .addCase(fetchDbProvider.fulfilled, (state, action) => {
        state.providerCheckStatus = "succeeded";
        state.connectedProvider = action.payload ?? "";
        state.connectedProfileName = "";
        state.connectionStatus = action.payload === null ? "idle" : "succeeded";
        state.connectionError = "";
        if (action.payload === null) {
          state.tables = [];
          state.selectedTable = "";
          state.selectedSchema = "";
          state.previewTable = null;
          state.tableStatus = "idle";
          state.tableError = "";
          state.schemaStatus = "idle";
          state.schemaError = "";
          state.schema = { tables: [], relationships: [] };
          state.dataByTable = {};
        }
      })
      .addCase(fetchDbProvider.rejected, (state, action) => {
        state.providerCheckStatus = "failed";
        state.connectionError = action.payload || action.error.message || "Unable to check database connection status.";
      })
      .addCase(connectDatabase.pending, (state, action) => {
        state.providerCheckStatus = "idle";
        state.connectionStatus = "loading";
        state.connectionError = "";
        state.connectingProvider = "provider" in action.meta.arg ? action.meta.arg.provider : "";
        state.connectingProfileName = "profile" in action.meta.arg ? action.meta.arg.profile : "";
      })
      .addCase(connectDatabase.fulfilled, (state, action) => {
        state.connectedProvider = action.payload.provider;
        state.connectedProfileName = action.payload.profileName || "";
        state.connectionStatus = "succeeded";
        state.providerCheckStatus = "succeeded";
        state.connectionError = "";
        state.connectingProvider = "";
        state.connectingProfileName = "";
        state.tables = [];
        state.selectedTable = "";
        state.selectedSchema = "";
        state.previewTable = null;
        state.tableStatus = "idle";
        state.tableError = "";
        state.schemaStatus = "idle";
        state.schemaError = "";
        state.schema = { tables: [], relationships: [] };
        state.dataByTable = {};
      })
      .addCase(connectDatabase.rejected, (state, action) => {
        state.connectionStatus = "failed";
        state.connectionError = action.payload || action.error.message || "Unable to connect to the database.";
        state.connectingProvider = "";
        state.connectingProfileName = "";
      })
      .addCase(disconnectDatabase.fulfilled, (state) => {
        state.connectedProvider = "";
        state.connectedProfileName = "";
        state.connectionStatus = "idle";
        state.connectingProvider = "";
        state.connectingProfileName = "";
        state.tables = [];
        state.selectedTable = "";
        state.selectedSchema = "";
        state.previewTable = null;
        state.tableStatus = "idle";
        state.tableError = "";
        state.schemaStatus = "idle";
        state.schemaError = "";
        state.schema = { tables: [], relationships: [] };
        state.dataByTable = {};
      })
      .addCase(disconnectDatabase.rejected, (state, action) => {
        state.connectionError = action.payload || action.error.message || "Unable to disconnect from the database.";
      })
      .addCase(fetchDbTables.pending, (state) => {
        state.tableStatus = "loading";
        state.tableError = "";
        if (state.connectionStatus === "idle") {
          state.connectionStatus = "loading";
          state.connectionError = "";
        }
      })
      .addCase(fetchDbTables.fulfilled, (state, action) => {
        state.tables = action.payload;
        state.tableStatus = "succeeded";
        state.connectedProvider ||= "Database";
        state.connectionStatus = "succeeded";
        state.connectionError = "";
      })
      .addCase(fetchDbTables.rejected, (state, action) => {
        state.tableStatus = "failed";
        state.tableError = action.payload || action.error.message || "Unable to load database tables.";
        state.connectionStatus = "failed";
        state.connectionError = state.tableError;
      })
      .addCase(fetchDbSchema.pending, (state) => {
        state.schemaStatus = "loading";
        state.schemaError = "";
      })
      .addCase(fetchDbSchema.fulfilled, (state, action) => {
        state.schema = action.payload;
        const selected = action.payload.tables.find((table) =>
          table.name === state.selectedTable && table.schema === state.selectedSchema)
          || action.payload.tables[0];
        state.selectedTable = selected?.name || "";
        state.selectedSchema = selected?.schema || "";
        state.schemaStatus = "succeeded";
        state.connectedProvider ||= "Database";
        state.connectionStatus = "succeeded";
        state.connectionError = "";
      })
      .addCase(fetchDbSchema.rejected, (state, action) => {
        state.schemaStatus = "failed";
        state.schemaError = action.payload || action.error.message || "Unable to load database schema.";
      })
      .addCase(fetchDbTableData.pending, (state, action) => {
        const { tableName, schema = "" } = typeof action.meta.arg === "string" ? { tableName: action.meta.arg } : action.meta.arg;
        const key = tableDataKey(tableName, schema);
        state.dataByTable[key] = {
          ...state.dataByTable[key],
          status: "loading",
          error: "",
        };
      })
      .addCase(fetchDbTableData.fulfilled, (state, action) => {
        const existing = state.dataByTable[action.payload.key];
        state.dataByTable[action.payload.key] = {
          ...existing,
          ...action.payload,
          status: "succeeded",
          error: "",
          filters: existing?.filters || {},
          sort: existing?.sort || null,
        };
      })
      .addCase(fetchDbTableData.rejected, (state, action) => {
        const { tableName, schema = "" } = typeof action.meta.arg === "string" ? { tableName: action.meta.arg } : action.meta.arg;
        const key = tableDataKey(tableName, schema);
        state.dataByTable[key] = {
          ...state.dataByTable[key],
          status: "failed",
          error: action.payload || action.error.message || "Unable to load table data.",
        };
      });
  },
});

export const {
  setDatabaseDebugUiEnabled,
  selectDbTable,
  setPreviewDbTable,
  setDatabaseViewMode,
  setColumnFilter,
  setTableSort,
} = databaseSlice.actions;
export default databaseSlice.reducer;
