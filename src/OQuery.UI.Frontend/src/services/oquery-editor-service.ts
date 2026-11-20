import { store } from "../store/store";
import {
  fetchFunctionDefinitions,
  fetchQueryRequests,
} from "../components/query-builder/query-design/query-builder-slice";
import { getDomain } from "./project-service";

// Orchestrates the OQuery editor's data. Every source is loaded through its owning service;
// the results are written to Redux so the editor components can read them.
export async function load(
  projectId: string,
  domainId: string,
  options: { includeQueryRequests?: boolean } = {},
): Promise<void> {
  const tasks: Promise<unknown>[] = [
    getDomain(projectId, domainId),
    store.dispatch(fetchFunctionDefinitions(projectId)),
  ];
  if (options.includeQueryRequests) tasks.push(store.dispatch(fetchQueryRequests({ projectId, domainId })));
  await Promise.all(tasks);
}
