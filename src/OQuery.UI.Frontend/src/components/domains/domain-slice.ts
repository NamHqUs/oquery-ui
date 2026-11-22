import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DomainRelation, MetadataEntity } from "./domain-model";

// Entities and relations of the domain currently loaded by project-service.
const domainSlice = createSlice({
  name: "metadata",
  initialState: {
    entities: [] as MetadataEntity[],
    relations: [] as DomainRelation[],
    status: "idle",
    error: "",
  },
  reducers: {
    invalidateQueryMetadata(state) {
      state.entities = [];
      state.relations = [];
      state.status = "idle";
      state.error = "";
    },
    setQueryMetadata(state, action: PayloadAction<{ entities: MetadataEntity[]; relations: DomainRelation[] }>) {
      state.entities = action.payload.entities;
      state.relations = action.payload.relations;
      state.status = "succeeded";
      state.error = "";
    },
  },
});

export const { invalidateQueryMetadata, setQueryMetadata } = domainSlice.actions;
export default domainSlice.reducer;
