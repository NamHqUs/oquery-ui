import { createContext, type Dispatch, type SetStateAction } from "react";

export type FieldBoxPopupManager = {
  activeMenuId: symbol | null;
  setActiveMenuId: Dispatch<SetStateAction<symbol | null>>;
};

export const FieldBoxPopupContext = createContext<FieldBoxPopupManager | null>(null);
