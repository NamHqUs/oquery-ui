import { getDomain, invalidateDomain } from "../../services/project-service";
import type { AppDispatch, RootState } from "../../store/store";
import { domainDraftFailed, domainDraftLoaded, domainDraftLoading } from "./domain-draft-slice";

type LoadDomainDraftArgs = { projectId: string; domainId: string; force?: boolean };

// Loads the domain only when the in-memory draft does not already hold it. Reload passes `force`
// and replaces any unsaved changes, so the caller must confirm first.
export function loadDomainDraft({ projectId, domainId, force = false }: LoadDomainDraftArgs) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const draft = getState().domainDraft;
    const alreadyHeld = draft.projectId === projectId
      && draft.domainId === domainId
      && (draft.status === "loading" || draft.status === "succeeded");
    if (alreadyHeld && !force) return;

    dispatch(domainDraftLoading({ projectId, domainId }));
    try {
      if (force) invalidateDomain(projectId, domainId);
      const details = await getDomain(projectId, domainId);
      dispatch(domainDraftLoaded({
        projectId,
        domainId,
        name: details.name,
        description: details.description,
        entities: details.entities,
        relations: details.relations,
      }));
    } catch (error) {
      dispatch(domainDraftFailed({ projectId, domainId, error: error instanceof Error ? error.message : "Something went wrong." }));
    }
  };
}
