import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import * as dynamicQueryService from "../../services/dynamic-query-service";
import type { QueryResult } from "../../services/dynamic-query-service";
import * as playgroundService from "../../services/playground-service";
import type { PlaygroundPayload, SavedPlayground } from "../../services/playground-service";
import type { InlineQueryResult } from "../oquery-editor/oquery-inline-result";

export const fetchSavedPlaygrounds = createAsyncThunk(
  "playground/fetchSaved",
  async ({ projectId, domainId }: { projectId: string; domainId: string }, { rejectWithValue }) => {
    try {
      const payload = await playgroundService.fetchPlaygrounds(projectId, domainId);
      if (!Array.isArray(payload)) return rejectWithValue("Playground API must return saved playgrounds.");
      return payload;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to load saved playgrounds.");
    }
  },
);

// Saves raw tab text. Without an id the playground is created; with one it is updated in place.
export const savePlayground = createAsyncThunk(
  "playground/save",
  async ({ projectId, playground, id }: { projectId: string; playground: PlaygroundPayload; id?: string }, { rejectWithValue }) => {
    try {
      return await playgroundService.savePlaygroundRequest(projectId, playground, id);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to save playground.");
    }
  },
);

export const deletePlayground = createAsyncThunk(
  "playground/delete",
  async ({ projectId, domainId, id }: { projectId: string; domainId: string; id: string }, { rejectWithValue }) => {
    try {
      await playgroundService.deleteSavedPlayground(projectId, domainId, id);
      return id;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to delete playground.");
    }
  },
);

type ContextPayload = { name?: unknown; columns?: unknown; rows?: unknown; totalRecords?: unknown } | null;

// Maps an execute response (name, column names, rows of cell values) to a QueryResult.
function toQueryResult(payload: ContextPayload): QueryResult {
  if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.rows) || !Array.isArray(payload.columns) || typeof payload.totalRecords !== "number") {
    throw new Error("Query API returned an invalid context result.");
  }
  return {
    name: payload.name,
    columns: payload.columns,
    rows: payload.rows,
    totalRecords: payload.totalRecords,
  };
}

export const executeContextFromText = createAsyncThunk(
  "playground/executeContextFromText",
  async ({ text, context, projectId, domainId }: { text: string; context: string; projectId: string; domainId: string }, { rejectWithValue }) => {
    try {
      const [payload, sql] = await Promise.all([
        dynamicQueryService.executeOQueryContext(text, context, projectId, domainId),
        dynamicQueryService.oqueryContextToSql(text, context, projectId, domainId).catch(() => null),
      ]);
      return { result: toQueryResult(payload), sql: typeof sql === "string" ? sql : null };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to execute context.");
    }
  },
);

// Run posts the whole tab text; the API detects the entry point and returns its context name, which keys the inline result.
export const executeQueryFromText = createAsyncThunk(
  "playground/executeQueryFromText",
  async ({ text, projectId, domainId }: { text: string; projectId: string; domainId: string }, { rejectWithValue }) => {
    try {
      const [payload, sql] = await Promise.all([
        dynamicQueryService.executeOQueryText(text, projectId, domainId),
        dynamicQueryService.oqueryTextToSql(text, projectId, domainId).catch(() => null),
      ]);
      return { result: toQueryResult(payload), sql: typeof sql === "string" ? sql : null };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to run query.");
    }
  },
);

function markInlineLoading(state: { inlineResults: Record<string, InlineQueryResult> }, context?: string) {
  if (!context) return;
  const previous = state.inlineResults[context];
  state.inlineResults[context] = { status: "loading", result: previous?.result ?? null, sql: previous?.sql ?? null, error: "" };
}

function markInlineSucceeded(state: { inlineResults: Record<string, InlineQueryResult> }, context: string | undefined, result: QueryResult, sql: string | null) {
  if (!context) return;
  state.inlineResults[context] = { status: "succeeded", result, sql, error: "" };
}

function markInlineFailed(state: { inlineResults: Record<string, InlineQueryResult> }, context: string | undefined, error: string) {
  if (!context) return;
  const previous = state.inlineResults[context];
  state.inlineResults[context] = { status: "failed", result: previous?.result ?? null, sql: previous?.sql ?? null, error };
}

const playgroundSlice = createSlice({
  name: "playground",
  initialState: {
    inlineResults: {} as Record<string, InlineQueryResult>,
    saved: {
      items: [] as SavedPlayground[],
      status: "idle" as "idle" | "loading" | "succeeded" | "failed",
      error: "",
    },
    saveStatus: "idle" as "idle" | "saving" | "failed",
    saveError: "",
    run: {
      status: "idle" as "idle" | "running" | "failed",
      error: "",
    },
  },
  reducers: {
    clearInlineResult(state, action: PayloadAction<string>) {
      delete state.inlineResults[action.payload];
    },
    clearAllInlineResults(state) {
      state.inlineResults = {};
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(executeContextFromText.pending, (state, action) => {
        markInlineLoading(state, action.meta.arg.context);
      })
      .addCase(executeContextFromText.fulfilled, (state, action) => {
        markInlineSucceeded(state, action.meta.arg.context, action.payload.result, action.payload.sql);
      })
      .addCase(executeContextFromText.rejected, (state, action) => {
        markInlineFailed(state, action.meta.arg.context, String(action.payload || action.error.message || "Unable to execute context."));
      })
      .addCase(executeQueryFromText.pending, (state) => {
        state.run = { status: "running", error: "" };
      })
      .addCase(executeQueryFromText.fulfilled, (state, action) => {
        markInlineSucceeded(state, action.payload.result.name, action.payload.result, action.payload.sql);
        state.run = { status: "idle", error: "" };
      })
      .addCase(executeQueryFromText.rejected, (state, action) => {
        state.run = { status: "failed", error: String(action.payload || action.error.message || "Unable to run query.") };
      })
      .addCase(fetchSavedPlaygrounds.pending, (state) => {
        state.saved.status = "loading";
        state.saved.error = "";
      })
      .addCase(fetchSavedPlaygrounds.fulfilled, (state, action) => {
        state.saved.items = action.payload;
        state.saved.status = "succeeded";
      })
      .addCase(fetchSavedPlaygrounds.rejected, (state, action) => {
        state.saved.status = "failed";
        state.saved.error = String(action.payload || action.error.message || "Unable to load saved playgrounds.");
      })
      .addCase(savePlayground.pending, (state) => {
        state.saveStatus = "saving";
        state.saveError = "";
      })
      .addCase(savePlayground.fulfilled, (state, action) => {
        const index = state.saved.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) state.saved.items[index] = action.payload;
        else state.saved.items.unshift(action.payload);
        state.saveStatus = "idle";
      })
      .addCase(savePlayground.rejected, (state, action) => {
        state.saveStatus = "failed";
        state.saveError = String(action.payload || action.error.message || "Unable to save playground.");
      })
      .addCase(deletePlayground.fulfilled, (state, action) => {
        state.saved.items = state.saved.items.filter((item) => item.id !== action.payload);
      })
      .addCase(deletePlayground.rejected, (state, action) => {
        state.saved.error = String(action.payload || action.error.message || "Unable to delete playground.");
      });
  },
});

export const { clearAllInlineResults, clearInlineResult } = playgroundSlice.actions;
export default playgroundSlice.reducer;
