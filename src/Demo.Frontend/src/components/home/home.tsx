import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  executeQueryFromText,
  fetchFunctionDefinitions,
  fetchQueryMetadata,
  type QueryResult,
} from "../query-builder/query-design/query-builder-slice";
import type { RootState } from "../../store/store";
import HomePage from "./home-page";
import type { DemoExampleKey } from "./home-demo-examples";
import "./home.css";

export default function Home({
  onNavigateToPage,
}: {
  onNavigateToPage: (page: "sources" | "metadata" | "builder") => void;
}) {
  const dispatch = useDispatch();
  const { metadata, metadataStatus, metadataError, functionDefinitions, functionDefinitionsStatus } = useSelector((state: RootState) => state.queryBuilder);
  const [demoResults, setDemoResults] = useState<Partial<Record<DemoExampleKey, QueryResult>>>({});
  const [demoLoading, setDemoLoading] = useState<Partial<Record<DemoExampleKey, boolean>>>({});
  const [demoErrors, setDemoErrors] = useState<Partial<Record<DemoExampleKey, string>>>({});

  useEffect(() => {
    if (metadataStatus === "idle") dispatch(fetchQueryMetadata());
    if (functionDefinitionsStatus === "idle") dispatch(fetchFunctionDefinitions());
  }, [dispatch, functionDefinitionsStatus, metadataStatus]);

  const runDemo = async (example: DemoExampleKey, query: string) => {
    setDemoLoading((current) => ({ ...current, [example]: true }));
    setDemoErrors((current) => ({ ...current, [example]: "" }));
    const action = await dispatch(executeQueryFromText(query));
    if (executeQueryFromText.fulfilled.match(action)) {
      setDemoResults((current) => ({ ...current, [example]: action.payload }));
    } else {
      setDemoErrors((current) => ({ ...current, [example]: String(action.payload || "Unable to run this example.") }));
    }
    setDemoLoading((current) => ({ ...current, [example]: false }));
  };

  const closeDemo = (example: DemoExampleKey) => {
    setDemoResults((current) => {
      const next = { ...current };
      delete next[example];
      return next;
    });
    setDemoErrors((current) => {
      const next = { ...current };
      delete next[example];
      return next;
    });
  };

  return <HomePage
    onNavigateToPage={onNavigateToPage}
    metadataStatus={metadataStatus}
    metadataError={metadataError}
    metadata={metadata}
    functionDefinitions={functionDefinitions}
    demoResults={demoResults}
    demoLoading={demoLoading}
    demoErrors={demoErrors}
    onRunDemo={(example, query) => void runDemo(example, query)}
    onCloseDemo={closeDemo}
  />;
}
