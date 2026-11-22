import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import * as dynamicQueryService from "../../services/dynamic-query-service";
import type { QueryResult } from "../../services/dynamic-query-service";
import type { InlineQueryResult } from "../oquery-editor/oquery-inline-result";

export const executeContextFromText = createAsyncThunk(
  "playground/executeContextFromText",
  async ({ text, context, projectId, domainId }: { text: string; context: string; projectId: string; domainId: string }, { rejectWithValue }) => {
    try {
      const [payload, sql] = await Promise.all([
        dynamicQueryService.executeOQueryContext(text, context, projectId, domainId),
        dynamicQueryService.oqueryContextToSql(text, context, projectId, domainId).catch(() => null),
      ]);
      if (!payload || typeof payload.name !== "string" || !Array.isArray(payload.rows)
        || typeof payload.totalRecords !== "number") {
        return rejectWithValue("Query API returned an invalid context result.");
      }
      const responseColumns = typeof payload.columns === "string"
        ? payload.columns.split(",").filter((column: string) => column.trim())
        : [];
      const result = {
        name: payload.name,
        columns: responseColumns,
        rows: payload.rows.map((row: string) => row.split(",")),
        totalRecords: payload.totalRecords,
      } as QueryResult;
      return { result, sql: typeof sql === "string" ? sql : null };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to execute context.");
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
      });
  },
});

export const { clearAllInlineResults, clearInlineResult } = playgroundSlice.actions;
export default playgroundSlice.reducer;
