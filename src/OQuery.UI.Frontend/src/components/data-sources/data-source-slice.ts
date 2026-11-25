import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { loadDataSource } from "../../services/data-source-service";

export const fetchDataSource = createAsyncThunk("dataSource/fetch", async (url, { rejectWithValue }) => {
  try {
    return await loadDataSource(url);
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : "Unable to load the datasource.");
  }
});

const dataSourceSlice = createSlice({
  name: "dataSource",
  initialState: {
    rows: [] as Record<string, unknown>[],
    sourceName: "customer_revenue",
    status: "idle",
    error: "",
  },
  reducers: {
    setDataSource(state, action) {
      state.rows = action.payload.rows;
      if (action.payload.name) state.sourceName = action.payload.name;
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDataSource.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchDataSource.fulfilled, (state, action) => {
        state.rows = action.payload.rows;
        if (action.payload.name) state.sourceName = action.payload.name;
        state.status = "succeeded";
      })
      .addCase(fetchDataSource.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || action.error.message || "Unable to load datasource.";
      });
  },
});

export const { setDataSource } = dataSourceSlice.actions;
export default dataSourceSlice.reducer;
