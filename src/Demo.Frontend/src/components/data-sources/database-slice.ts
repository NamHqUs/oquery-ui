import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import * as databaseConnectionService from "../../services/database-connection-service";
import * as dbSchemaService from "../../services/db-schema-service";
import { MAX_TABLE_DATA_ROWS } from "../../services/db-schema-service";

export type DatabaseConnectRequest =
  | { profile: string }
  | { provider: string; connectionString: string };

export const fetchDatabaseConnections = createAsyncThunk(
  "database/fetchConnections",
  async (_, { rejectWithValue }) => {
    try {
      return await databaseConnectionService.getConnectionOptions();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load connection options.");
    }
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
    try {
      return await databaseConnectionService.getProvider();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to check database connection status.");
    }
  },
);

export const connectDatabase = createAsyncThunk(
  "database/connect",
  async (request: DatabaseConnectRequest, { rejectWithValue }) => {
    try {
      return await databaseConnectionService.connect(request);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Could not connect to the database.");
    }
  },
);

export const disconnectDatabase = createAsyncThunk(
  "database/disconnect",
  async (_, { rejectWithValue }) => {
    try {
      await databaseConnectionService.disconnect();
      return true;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Could not disconnect from the database.");
    }
  },
);

export const fetchDbSchema = createAsyncThunk(
  "database/fetchSchema",
  async (_, { rejectWithValue }) => {
    try {
      return await dbSchemaService.getSchema();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load database schema.");
    }
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
    try {
      const preview = await dbSchemaService.getTablePreview(tableName, schema, rowLimit);
      return {
        key: tableDataKey(tableName, schema),
        name: preview.name,
        columns: preview.columns,
        rows: preview.rows,
        limit: rowLimit,
      };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load table data.");
    }
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
    selectedTable: "",
    selectedSchema: "",
    previewTable: null as { name: string; schema: string } | null,
    viewMode: "diagram",
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
          state.selectedTable = "";
          state.selectedSchema = "";
          state.previewTable = null;
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
        state.selectedTable = "";
        state.selectedSchema = "";
        state.previewTable = null;
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
        state.selectedTable = "";
        state.selectedSchema = "";
        state.previewTable = null;
        state.schemaStatus = "idle";
        state.schemaError = "";
        state.schema = { tables: [], relationships: [] };
        state.dataByTable = {};
      })
      .addCase(disconnectDatabase.rejected, (state, action) => {
        state.connectionError = action.payload || action.error.message || "Unable to disconnect from the database.";
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
