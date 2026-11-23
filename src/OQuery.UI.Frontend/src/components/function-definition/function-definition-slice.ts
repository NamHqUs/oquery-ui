import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as functionDefinitionService from "../../services/function-definition-service";
import type { FunctionDefinition } from "./types";

export const fetchFunctionDefinitions = createAsyncThunk(
  "functionDefinitions/fetch",
  async (_: void, { rejectWithValue }) => {
    try {
      return await functionDefinitionService.getDefinitions();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load function metadata.");
    }
  },
  {
    condition: (_: void, { getState }) => {
      const { status } = getState().functionDefinitions;
      return status !== "loading" && status !== "succeeded";
    },
  },
);

const functionDefinitionsSlice = createSlice({
  name: "functionDefinitions",
  initialState: {
    definitions: [] as FunctionDefinition[],
    status: "idle",
    error: "",
  },
  reducers: {
    invalidateFunctionDefinitions(state) {
      state.definitions = [];
      state.status = "idle";
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFunctionDefinitions.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchFunctionDefinitions.fulfilled, (state, action) => {
        state.definitions = action.payload;
        state.status = "succeeded";
      })
      .addCase(fetchFunctionDefinitions.rejected, (state, action) => {
        state.status = "failed";
        state.error = String(action.payload || action.error.message || "Unable to load function metadata.");
      });
  },
});

export const { invalidateFunctionDefinitions } = functionDefinitionsSlice.actions;
export default functionDefinitionsSlice.reducer;
