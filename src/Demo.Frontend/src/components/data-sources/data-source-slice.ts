import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiUrls } from "../../const/api-urls";

const seedRows = [
  { id: 1042, customer: "Northwind Traders", segment: "Enterprise", region: "North America", revenue: 128400, orders: 42, status: "Active", updated: "Oct 08, 2026" },
  { id: 1041, customer: "Acme Industries", segment: "Mid-market", region: "Europe", revenue: 96750, orders: 31, status: "Active", updated: "Oct 07, 2026" },
  { id: 1040, customer: "Globex Corporation", segment: "Enterprise", region: "Asia Pacific", revenue: 184200, orders: 56, status: "Review", updated: "Oct 07, 2026" },
  { id: 1039, customer: "Soylent Corp", segment: "Startup", region: "North America", revenue: 24600, orders: 12, status: "Active", updated: "Oct 06, 2026" },
  { id: 1038, customer: "Umbrella Labs", segment: "Mid-market", region: "Europe", revenue: 71300, orders: 24, status: "Paused", updated: "Oct 05, 2026" },
  { id: 1037, customer: "Stark Industries", segment: "Enterprise", region: "North America", revenue: 215800, orders: 68, status: "Active", updated: "Oct 04, 2026" },
  { id: 1036, customer: "Wayne Enterprises", segment: "Enterprise", region: "Europe", revenue: 156900, orders: 47, status: "Active", updated: "Oct 03, 2026" },
  { id: 1035, customer: "Wonka Works", segment: "Startup", region: "Asia Pacific", revenue: 38900, orders: 18, status: "Review", updated: "Oct 02, 2026" },
];

export const fetchDataSource = createAsyncThunk("dataSource/fetch", async (url, { rejectWithValue }) => {
  const sourceUrl = url || apiUrls.dataSource;
  if (!sourceUrl) return rejectWithValue("Set VITE_DATA_SOURCE_URL to load a datasource from an API.");

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    return rejectWithValue(`Datasource request failed (${response.status}).`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload?.rows;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    return rejectWithValue("Datasource API must return an array of objects or an object with a rows array.");
  }

  return { rows, name: Array.isArray(payload) ? undefined : payload.name };
});

const dataSourceSlice = createSlice({
  name: "dataSource",
  initialState: {
    rows: seedRows,
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
