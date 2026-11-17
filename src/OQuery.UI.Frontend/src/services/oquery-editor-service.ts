import { store } from "../store/store";
import {
  fetchFilterOperators,
  fetchFunctionDefinitions,
  fetchQueryRequests,
} from "../components/query-builder/query-design/query-builder-slice";
import { getDomain } from "./domain-service";

// Orchestrates the OQuery editor's data. Every source is loaded through its owning service;
// the results are written to Redux so the editor components can read them.
export async function load(domainId: string, options: { includeQueryRequests?: boolean } = {}): Promise<void> {
  const tasks: Promise<unknown>[] = [
    getDomain(domainId),
    store.dispatch(fetchFunctionDefinitions()),
    store.dispatch(fetchFilterOperators()),
  ];
  if (options.includeQueryRequests) tasks.push(store.dispatch(fetchQueryRequests(domainId)));
  await Promise.all(tasks);
}
