import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DomainRelation, MetadataEntity } from "./domain-model";

export type DomainGraph = { entities: MetadataEntity[]; relations: DomainRelation[] };

type DomainKey = { projectId: string; domainId: string };

// The in-memory copy of one domain. The diagram and the edit wizard both work on `working`;
// only a successful save moves it to `baseline`, so `working !== baseline` means unsaved changes.
export type DomainDraftState = DomainKey & {
  name: string;
  description: string;
  baseline: DomainGraph;
  working: DomainGraph;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string;
};

const EMPTY_GRAPH: DomainGraph = { entities: [], relations: [] };

const initialState: DomainDraftState = {
  projectId: "",
  domainId: "",
  name: "",
  description: "",
  baseline: EMPTY_GRAPH,
  working: EMPTY_GRAPH,
  status: "idle",
  error: "",
};

type DomainDraftLoaded = DomainKey & { name: string; description: string; entities: MetadataEntity[]; relations: DomainRelation[] };

const isSameDomain = (state: DomainDraftState, key: DomainKey) => state.projectId === key.projectId && state.domainId === key.domainId;

// Responses for a domain the user has already left are ignored.
function switchTo(state: DomainDraftState, key: DomainKey) {
  if (isSameDomain(state, key)) return;
  state.projectId = key.projectId;
  state.domainId = key.domainId;
  state.name = "";
  state.description = "";
  state.baseline = EMPTY_GRAPH;
  state.working = EMPTY_GRAPH;
}

const domainDraftSlice = createSlice({
  name: "domainDraft",
  initialState,
  reducers: {
    domainDraftLoading(state, action: PayloadAction<DomainKey>) {
      switchTo(state, action.payload);
      state.status = "loading";
      state.error = "";
    },
    domainDraftLoaded(state, action: PayloadAction<DomainDraftLoaded>) {
      if (!isSameDomain(state, action.payload)) return;
      const graph = { entities: action.payload.entities, relations: action.payload.relations };
      state.name = action.payload.name;
      state.description = action.payload.description;
      state.baseline = graph;
      state.working = graph;
      state.status = "succeeded";
      state.error = "";
    },
    domainDraftFailed(state, action: PayloadAction<DomainKey & { error: string }>) {
      if (!isSameDomain(state, action.payload)) return;
      state.baseline = EMPTY_GRAPH;
      state.working = EMPTY_GRAPH;
      state.status = "failed";
      state.error = action.payload.error;
    },
    setDomainDraftWorking(state, action: PayloadAction<DomainGraph>) {
      state.working = action.payload;
    },
    // Called after the server accepted the working copy, so the saved copy becomes the new baseline.
    domainDraftSaved(state, action: PayloadAction<DomainKey & DomainGraph & { name: string; description: string }>) {
      if (!isSameDomain(state, action.payload)) return;
      state.name = action.payload.name;
      state.description = action.payload.description;
      state.baseline = { entities: action.payload.entities, relations: action.payload.relations };
      state.working = state.baseline;
    },
    clearDomainDraft() {
      return initialState;
    },
  },
});

export const {
  domainDraftLoading,
  domainDraftLoaded,
  domainDraftFailed,
  setDomainDraftWorking,
  domainDraftSaved,
  clearDomainDraft,
} = domainDraftSlice.actions;

export default domainDraftSlice.reducer;
