import { createContext, useContext } from "react";
import type { DomainRelation } from "./query-builder-slice";

export const MetadataRelationsContext = createContext<DomainRelation[]>([]);

export const useMetadataRelations = () => useContext(MetadataRelationsContext);
