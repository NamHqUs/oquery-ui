import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useBlocker, useLocation, useNavigate } from "react-router-dom";
import Icon, { getDatabaseIconName } from "./components/icon/icon";
import DataSources from "./components/data-sources/data-sources";
import DatabaseConnection from "./components/data-sources/database-connection/database-connection";
import { fetchDbProvider, fetchDbSchema, fetchDbTables } from "./components/data-sources/database-slice";
import QueryBuilder, { setQueryBuilderDefinition } from "./components/query-builder/query-builder";
import MetadataBuilder from "./components/metadata-builder/metadata-builder";
import FunctionDefinitionsWorkspace from "./components/function-definition/function-definition";
import Reports from "./components/reports/reports";
import Documentation from "./components/documentation/documentation";
import { MessageBoxProvider } from "./components/message-box/message-box";
import type { QueryDefinition } from "./components/query-builder/query-design/query-builder-slice";
import { store, type RootState } from "./store/store";
import "./styles.css";

const PAGE_PATHS = {
  reports: "/reports",
  builder: "/query-builder",
  metadata: "/metadata",
  sources: "/data-sources",
  functions: "/function-definitions",
  documentation: "/documentation",
} as const;

const LEGACY_FUNCTIONS_PATH = "/functions";

type Page = keyof typeof PAGE_PATHS;
type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;

function pageForPath(path: string): Page | null {
  return (Object.keys(PAGE_PATHS) as Page[]).find((page) => PAGE_PATHS[page] === path) ?? null;
}

function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const database = useSelector((state: RootState) => state.database);
  const page = pageForPath(location.pathname);
  const [metadataVisited, setMetadataVisited] = useState(() => location.pathname === PAGE_PATHS.metadata);
  const [functionDefinitionsVisited, setFunctionDefinitionsVisited] = useState(() => location.pathname === PAGE_PATHS.functions);
  const [queryBuilderVisited, setQueryBuilderVisited] = useState(() => location.pathname === PAGE_PATHS.builder);
  const [queryBuilderInstance, setQueryBuilderInstance] = useState(0);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const metadataNavigationGuard = useRef<NavigationGuard | null>(null);
  const functionNavigationGuard = useRef<NavigationGuard | null>(null);
  const approvedNavigation = useRef<string | null>(null);
  const handledBlockedLocation = useRef<string | null>(null);
  const updateMetadataNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    metadataNavigationGuard.current = guard;
  }, []);
  const updateFunctionNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    functionNavigationGuard.current = guard;
  }, []);
  const guardForPage = (targetPage: Page | null) => {
    if (targetPage === "metadata") return metadataNavigationGuard.current;
    if (targetPage === "functions") return functionNavigationGuard.current;
    return null;
  };

  useEffect(() => {
    void store.dispatch(fetchDbProvider()).then((result) => {
      if (fetchDbProvider.fulfilled.match(result) && result.payload !== null) {
        void store.dispatch(fetchDbTables());
        void store.dispatch(fetchDbSchema());
      }
    });
  }, []);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const currentPage = pageForPath(currentLocation.pathname);
    const nextPage = pageForPath(nextLocation.pathname);
    const target = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    if (approvedNavigation.current === target) {
      approvedNavigation.current = null;
      return false;
    }
    return currentPage !== null
      && nextPage !== null
      && currentPage !== nextPage
      && guardForPage(currentPage) !== null;
  });

  useEffect(() => {
    if (location.pathname === PAGE_PATHS.metadata) setMetadataVisited(true);
    if (location.pathname === PAGE_PATHS.functions) setFunctionDefinitionsVisited(true);
    if (location.pathname === PAGE_PATHS.builder) setQueryBuilderVisited(true);
  }, [location.pathname]);

  const requestDatabaseConnection = useCallback(() => setConnectionDialogOpen(true), []);

  useEffect(() => {
    if (!connectionDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConnectionDialogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [connectionDialogOpen]);

  const navigateToPage = (nextPage: Page, fromReport = false) => {
    if (nextPage === page && !(nextPage === "builder" && fromReport)) return;
    const destination = nextPage === "builder" && fromReport
      ? `${PAGE_PATHS.builder}?from=reports`
      : PAGE_PATHS[nextPage];
    const continueNavigation = () => {
      if (nextPage === "metadata") setMetadataVisited(true);
      if (nextPage === "functions") setFunctionDefinitionsVisited(true);
      if (nextPage === "builder") setQueryBuilderVisited(true);
      approvedNavigation.current = destination;
      routerNavigate(destination);
    };
    const guard = guardForPage(page);
    if (guard) {
      guard(continueNavigation);
      return;
    }
    continueNavigation();
  };

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const blockedLocation = `${blocker.location.key}:${blocker.location.pathname}${blocker.location.search}${blocker.location.hash}`;
    if (handledBlockedLocation.current === blockedLocation) return;
    handledBlockedLocation.current = blockedLocation;

    const guard = guardForPage(page);
    const continueNavigation = () => {
      handledBlockedLocation.current = null;
      blocker.proceed();
    };
    const cancelNavigation = () => {
      handledBlockedLocation.current = null;
      blocker.reset();
    };
    if (guard) guard(continueNavigation, cancelNavigation);
    else continueNavigation();
  }, [blocker, page]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" aria-label="DynamicSQL Studio home" onClick={() => navigateToPage("reports")}><img className="brand-logo" src="/brand-concepts/dynamicsql-studio.svg" alt="" /></button>
        <nav className="topnav"><button className={page === "builder" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("builder")}><Icon name="query" /> Query builder</button><button className={page === "sources" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("sources")}><Icon name="database" /> Data sources</button><button className={page === "metadata" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("metadata")}><Icon name="schema" /> Metadata</button><button className={page === "functions" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("functions")}><Icon name="function" /> Function definitions</button><button className={page === "documentation" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("documentation")}><Icon name="file-text" /> Docs</button></nav>
        <div className="top-actions">
          {database.providerCheckStatus === "loading" ? (
            <button className="database-status connecting" type="button" onClick={() => setConnectionDialogOpen(true)} aria-live="polite">
              <span className="database-status-dot" />
              <Icon name="database" size={15} />
              <span>Checking connection…</span>
            </button>
          ) : database.providerCheckStatus === "failed" ? (
            <button className="database-status failed" type="button" onClick={() => setConnectionDialogOpen(true)} title={database.connectionError}>
              <span className="database-status-dot" />
              <Icon name="database" size={15} />
              <span>Connection status unavailable</span>
            </button>
          ) : database.connectionStatus === "loading" ? (
            <button className="database-status connecting" type="button" onClick={() => setConnectionDialogOpen(true)} aria-live="polite">
              <span className="database-status-dot" />
              <Icon name={getDatabaseIconName(database.connectingProvider)} size={15} />
              <span>Connecting{database.connectingProvider ? ` · ${database.connectingProvider}` : ""}{database.connectingProfileName ? ` · ${database.connectingProfileName}` : ""}</span>
            </button>
          ) : database.connectionStatus === "succeeded" ? (
            <button className="database-status connected" type="button" onClick={() => setConnectionDialogOpen(true)} title="Change database connection">
              <span className="database-status-dot" />
              <Icon name={getDatabaseIconName(database.connectedProvider)} size={15} />
              <span>{database.connectedProvider}{database.connectedProfileName ? ` · ${database.connectedProfileName}` : " · Connecting"}</span>
            </button>
          ) : (
            <button className={`database-status${database.connectionStatus === "failed" ? " failed" : ""}`} type="button" onClick={() => setConnectionDialogOpen(true)}>
              <span className="database-status-dot" />
              <Icon name="database" size={15} />
              <span>{database.connectionStatus === "failed" ? "Connection failed · Retry" : "Not connected"}</span>
            </button>
          )}
          <button className="avatar" type="button" aria-label="User profile">N</button>
        </div>
      </header>

      <Routes>
        <Route path={PAGE_PATHS.reports} element={<div className="page-transition page-transition-no-slide"><Reports onNavigateToPage={navigateToPage} onEditQuery={(definition: QueryDefinition) => {
          setQueryBuilderDefinition(definition);
          setQueryBuilderInstance((current) => current + 1);
          navigateToPage("builder", true);
        }} /></div>} />
        <Route path={PAGE_PATHS.documentation} element={<div className="page-transition page-transition-no-slide"><Documentation /></div>} />
        <Route path={PAGE_PATHS.builder} element={null} />
        <Route path={PAGE_PATHS.metadata} element={null} />
        <Route path={PAGE_PATHS.functions} element={null} />
        <Route path={LEGACY_FUNCTIONS_PATH} element={<Navigate to={PAGE_PATHS.functions} replace />} />
        <Route path={PAGE_PATHS.sources} element={<div className="page-transition page-transition-no-slide"><DataSources onRequestConnection={requestDatabaseConnection} /></div>} />
        <Route path="*" element={<Navigate to={PAGE_PATHS.reports} replace />} />
      </Routes>
      {connectionDialogOpen && createPortal(
        <div className="database-connection-dialog-backdrop" onClick={() => setConnectionDialogOpen(false)}>
          <section
            className="database-connection-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="database-connection-dialog-close"
              type="button"
              aria-label="Close database connection"
              onClick={() => setConnectionDialogOpen(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <DatabaseConnection onConnected={() => setConnectionDialogOpen(false)} />
          </section>
        </div>,
        document.body,
      )}
      {queryBuilderVisited && <div hidden={page !== "builder"} className={page === "builder" ? "page-transition page-transition-no-slide" : undefined}><QueryBuilder
        key={queryBuilderInstance}
        onRequestConnection={requestDatabaseConnection}
        onBackToReports={new URLSearchParams(location.search).get("from") === "reports"
          ? () => navigateToPage("reports")
          : undefined}
      /></div>}
      {metadataVisited && <div hidden={page !== "metadata"} className={page === "metadata" ? "page-transition page-transition-no-slide" : undefined}><MetadataBuilder onNavigationGuardChange={updateMetadataNavigationGuard} /></div>}
      {functionDefinitionsVisited && <div hidden={page !== "functions"} className={page === "functions" ? "page-transition page-transition-no-slide" : undefined}>
        <section className="page-heading metadata-page-heading function-page-heading">
          <div className="metadata-heading-main">
            <span className="metadata-heading-mark" aria-hidden="true"><Icon name="function" size={21} /></span>
            <div className="metadata-heading-copy">
              <span className="metadata-heading-eyebrow">QUERY METADATA <i /> FUNCTIONS · ARGUMENTS · SQL TEMPLATES</span>
              <h2>Define query functions</h2>
              <p>Manage reusable function definitions and provider-specific raw SQL templates.</p>
              <div className="metadata-heading-summary" aria-label="Function definition summary">
                <span><strong>Reusable</strong> functions</span>
                <span><strong>Provider-specific</strong> SQL templates</span>
              </div>
            </div>
          </div>
        </section>
        <FunctionDefinitionsWorkspace onNavigationGuardChange={updateFunctionNavigationGuard} />
      </div>}
      <footer><span><span className="footer-mark">✦</span> DynamicSQL engine</span><span>Metadata-driven queries · Client preview</span></footer>
    </main>
  );
}

const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <MessageBoxProvider><RouterProvider router={router} /></MessageBoxProvider>
  </Provider>,
);
