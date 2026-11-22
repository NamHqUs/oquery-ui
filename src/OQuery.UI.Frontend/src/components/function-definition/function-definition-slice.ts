import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as functionDefinitionService from "../../services/function-definition-service";
import type { FunctionDefinition } from "./types";

export const fetchFunctionDefinitions = createAsyncThunk(
  "functionDefinitions/fetch",
  async (projectId: string, { rejectWithValue }) => {
    try {
      return await functionDefinitionService.getDefinitions(projectId);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load function metadata.");
    }
  },
  {
    condition: (projectId, { getState }) => {
      const { projectId: loadedProjectId, status } = getState().functionDefinitions;
      return loadedProjectId !== projectId || (status !== "loading" && status !== "succeeded");
    },
  },
);

const functionDefinitionsSlice = createSlice({
  name: "functionDefinitions",
  initialState: {
    definitions: [] as FunctionDefinition[],
    projectId: "",
    status: "idle",
    error: "",
  },
  reducers: {
    invalidateFunctionDefinitions(state) {
      state.definitions = [];
      state.projectId = "";
      state.status = "idle";
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFunctionDefinitions.pending, (state, action) => {
        state.projectId = action.meta.arg;
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchFunctionDefinitions.fulfilled, (state, action) => {
        if (action.meta.arg !== state.projectId) return;
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
