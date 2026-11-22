import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as queryService from "../../services/query-service";
import { normalizeQueryRequestProjection, type ApiQueryDto, type SavedQueryRequestDto } from "./saved-query-model";

export const fetchQueryRequests = createAsyncThunk(
  "savedQueries/fetch",
  async ({ projectId, domainId }: { projectId: string; domainId: string }, { rejectWithValue }) => {
    try {
      const payload = await queryService.fetchQueryRequestPayload(projectId, domainId);
      const normalizedPayload = Array.isArray(payload)
        ? payload.map((item) => item && typeof item === "object" && !Array.isArray(item)
          ? normalizeQueryRequestProjection(item as Record<string, unknown>)
          : item)
        : payload;
      if (!Array.isArray(normalizedPayload) || normalizedPayload.some((item) => !item
        || typeof item.isBuiltin !== "boolean"
        || typeof item.id !== "string"
        || typeof item.name !== "string"
        || typeof item.domainId !== "string"
        || typeof item.entity !== "string"
        || (item.rawText !== undefined && item.rawText !== null && typeof item.rawText !== "string")
        || !Array.isArray(item.projection)
        || (item.contexts !== undefined && item.contexts !== null
          && (typeof item.contexts !== "object" || Array.isArray(item.contexts))))) {
        return rejectWithValue("Query request API must return saved query requests.");
      }
      return normalizedPayload.map((item) => item as ApiQueryDto);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load saved queries.");
    }
  },
);

export const deleteQueryRequest = createAsyncThunk(
  "savedQueries/delete",
  async ({ id, projectId, domainId }: { id: string; projectId: string; domainId: string }, { rejectWithValue }) => {
    try {
      await queryService.deleteQueryRequestById(id, projectId, domainId);
      return id;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to delete query.");
    }
  },
);

const savedQueriesSlice = createSlice({
  name: "savedQueries",
  initialState: {
    items: [] as SavedQueryRequestDto[],
    status: "idle",
    error: "",
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQueryRequests.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchQueryRequests.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = "succeeded";
      })
      .addCase(fetchQueryRequests.rejected, (state, action) => {
        state.status = "failed";
        state.error = String(action.payload || action.error.message || "Unable to load saved queries.");
      })
      .addCase(deleteQueryRequest.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      })
      .addCase(deleteQueryRequest.rejected, (state, action) => {
        state.error = String(action.payload || action.error.message || "Unable to delete query.");
      });
  },
});

export default savedQueriesSlice.reducer;
