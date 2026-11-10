import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useBlocker, useLocation, useNavigate } from "react-router-dom";
import Icon, { getDatabaseIconName } from "./components/icon/icon";
import DataSources from "./components/data-sources/data-sources";
import DatabaseConnection from "./components/data-sources/database-connection/database-connection";
import { fetchDatabaseConnections, fetchDbProvider, fetchDbSchema, fetchDbTables } from "./components/data-sources/database-slice";
import QueryBuilder from "./components/query-builder/query-builder";
import MetadataBuilder from "./components/metadata-builder/metadata-builder";
import FunctionDefinitionsWorkspace from "./components/function-definition/function-definition";
import Home from "./components/home/home";
import Documentation from "./components/documentation/documentation";
import { GITHUB_URL, PRODUCT_NAME } from "./components/home/home-content";
import { MessageBoxProvider } from "./components/message-box/message-box";
import { store, type RootState } from "./store/store";
import "./styles.css";

const PAGE_PATHS = {
  home: "/",
  builder: "/query-builder",
  metadata: "/metadata",
  sources: "/data-sources",
  functions: "/function-definitions",
  documentation: "/documentation",
} as const;

const LEGACY_FUNCTIONS_PATH = "/functions";
const CREATE_DOMAIN_PATH = "/metadata/domains/create";
const EDIT_DOMAIN_PATH = "/metadata/domains/edit";

type Page = keyof typeof PAGE_PATHS;
type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;
type MetadataSection = "diagram" | "entities" | "domains" | "functions" | "operators";

const HOME_SUBMENU = [
  { label: "Playground", target: "hp-playground" },
  { label: "Examples", target: "hp-examples" },
  { label: "Capabilities", target: "hp-capabilities" },
  { label: "How it works", target: "hp-reveal" },
  { label: "For developers", target: "hp-developers" },
] as const;

const PAGE_SUBMENUS: Record<Exclude<Page, "home">, readonly string[]> = {
  builder: ["Design query", "Results"],
  sources: ["Connections", "Tables", "Schema"],
  metadata: ["Domains", "Diagram", "Entity definitions"],
  functions: ["Definitions", "Arguments", "SQL templates"],
  documentation: ["Overview", "Query syntax", "Security", "Next steps"],
};

function pageForPath(path: string): Page | null {
  if (path === CREATE_DOMAIN_PATH || path === EDIT_DOMAIN_PATH) return "metadata";
  return (Object.keys(PAGE_PATHS) as Page[]).find((page) => PAGE_PATHS[page] === path) ?? null;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PageSubnav({
  page,
  onNavigateToPage,
  onMetadataSectionSelect,
}: {
  page: Page | null;
  onNavigateToPage: (nextPage: Page) => void;
  onMetadataSectionSelect: (section: MetadataSection) => void;
}) {
  const location = useLocation();
  const metadataSection = new URLSearchParams(location.search).get("section") ?? "diagram";
  if (!page) return null;

  if (page === "home") {
    return (
      <nav className="hp-subnav app-subnav" aria-label="Home sections">
        <span className="hp-subnav-brand">{PRODUCT_NAME}</span>
        <div className="hp-subnav-links">
          {HOME_SUBMENU.map((item) => <button key={item.target} type="button" onClick={() => scrollToSection(item.target)}>{item.label}</button>)}
          <button type="button" onClick={() => onNavigateToPage("documentation")}>Documentation</button>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <button className="button primary hp-subnav-cta" type="button" onClick={() => scrollToSection("hp-playground")}><Icon name="play" size={11} /> Try Playground</button>
      </nav>
    );
  }

  return (
    <nav className="hp-subnav app-subnav" aria-label={`${page} sections`}>
      <span className="hp-subnav-brand">{page === "builder" ? "QUERY BUILDER" : page.replace("-", " ").toUpperCase()}</span>
      <div className="hp-subnav-links">
        {PAGE_SUBMENUS[page].map((item) => {
          const itemSection = item === "Diagram" ? "diagram" : item === "Entity definitions" ? "entities" : item === "Domains" ? "domains" : undefined;
          const isActive = page === "metadata" && itemSection === metadataSection;
          return <button
            key={item}
            type="button"
            className={isActive ? "active" : undefined}
            aria-current={isActive ? "page" : undefined}
            onClick={page === "metadata" && itemSection
              ? () => onMetadataSectionSelect(itemSection)
              : undefined}
          >{item}</button>;
        })}
      </div>
      <div className={`app-subnav-actions${page === "metadata" ? "" : " app-subnav-actions-hidden"}`} id="metadata-toolbar-actions">
      </div>
    </nav>
  );
}

function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const database = useSelector((state: RootState) => state.database);
  const page = pageForPath(location.pathname);
  const [metadataVisited, setMetadataVisited] = useState(() => location.pathname === PAGE_PATHS.metadata || location.pathname === CREATE_DOMAIN_PATH || location.pathname === EDIT_DOMAIN_PATH);
  const [functionDefinitionsVisited, setFunctionDefinitionsVisited] = useState(() => location.pathname === PAGE_PATHS.functions);
  const [queryBuilderVisited, setQueryBuilderVisited] = useState(() => location.pathname === PAGE_PATHS.builder);
  const [queryBuilderInstance, setQueryBuilderInstance] = useState(0);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const metadataNavigationGuard = useRef<NavigationGuard | null>(null);
  const metadataSectionNavigation = useRef<((section: MetadataSection) => void) | null>(null);
  const functionNavigationGuard = useRef<NavigationGuard | null>(null);
  const approvedNavigation = useRef<string | null>(null);
  const handledBlockedLocation = useRef<string | null>(null);
  const updateMetadataNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    metadataNavigationGuard.current = guard;
  }, []);
  const updateMetadataSectionNavigation = useCallback((handler: ((section: MetadataSection) => void) | null) => {
    metadataSectionNavigation.current = handler ?? undefined;
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
    void store.dispatch(fetchDatabaseConnections());
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
    if (location.pathname === PAGE_PATHS.metadata || location.pathname === CREATE_DOMAIN_PATH || location.pathname === EDIT_DOMAIN_PATH) setMetadataVisited(true);
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

  const navigateToPage = (nextPage: Page, fromHome = false) => {
    if (nextPage === page && !(nextPage === "builder" && fromHome)) return;
    const destination = nextPage === "builder" && fromHome
      ? `${PAGE_PATHS.builder}?from=home`
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
        <div className="header-brand-group">
          <button className="brand" type="button" aria-label="Open Query home" onClick={() => navigateToPage("home")}><img className="brand-logo" src="/brand-concepts/23-oquery-orbit-core.svg" alt="" /></button>
          <span className="header-product-tag">DATA QUERY ENGINE</span>
        </div>
        <div className="topnav-wrap">
          <span className="topnav-label">WORKSPACE</span>
          <nav className="topnav" aria-label="Primary navigation"><button className={page === "builder" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("builder")}><Icon name="query" /> Query builder</button><button className={page === "sources" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("sources")}><Icon name="database" /> Data sources</button><button className={page === "metadata" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("metadata")}><Icon name="schema" /> Metadata</button><button className={page === "functions" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("functions")}><Icon name="function" /> Function definitions</button><button className={page === "documentation" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("documentation")}><Icon name="file-text" /> Docs</button></nav>
        </div>
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

      <PageSubnav
        page={page}
        onNavigateToPage={navigateToPage}
        onMetadataSectionSelect={(section) => metadataSectionNavigation.current?.(section)}
      />
      <div className="page-content">
        <Routes>
          <Route path={PAGE_PATHS.home} element={<div className="page-transition page-transition-no-slide"><Home onNavigateToPage={navigateToPage} onRequestConnection={requestDatabaseConnection} /></div>} />
          <Route path={PAGE_PATHS.documentation} element={<div className="page-transition page-transition-no-slide"><Documentation /></div>} />
          <Route path={PAGE_PATHS.builder} element={null} />
          <Route path={PAGE_PATHS.metadata} element={null} />
          <Route path={CREATE_DOMAIN_PATH} element={null} />
          <Route path={EDIT_DOMAIN_PATH} element={null} />
          <Route path={PAGE_PATHS.functions} element={null} />
          <Route path={LEGACY_FUNCTIONS_PATH} element={<Navigate to={PAGE_PATHS.functions} replace />} />
          <Route path={PAGE_PATHS.sources} element={<div className="page-transition page-transition-no-slide"><DataSources onRequestConnection={requestDatabaseConnection} /></div>} />
          <Route path="*" element={<Navigate to={PAGE_PATHS.home} replace />} />
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
        onBackToHome={new URLSearchParams(location.search).get("from") === "home"
          ? () => navigateToPage("home")
          : undefined}
      /></div>}
      {metadataVisited && <div hidden={page !== "metadata"} className={page === "metadata" ? "page-transition page-transition-no-slide" : undefined}><MetadataBuilder onNavigationGuardChange={updateMetadataNavigationGuard} onSectionNavigationChange={updateMetadataSectionNavigation} /></div>}
      {functionDefinitionsVisited && <div hidden={page !== "functions"} className={page === "functions" ? "page-transition page-transition-no-slide" : undefined}>
        <section className="page-heading metadata-page-heading function-page-heading">
          <div className="metadata-heading-main">
            <span className="metadata-heading-mark" aria-hidden="true"><Icon name="function" size={21} /></span>
            <div className="metadata-heading-copy">
              <span className="metadata-heading-eyebrow">QUERY METADATA <i /> FUNCTIONS · ARGUMENTS · SQL TEMPLATES</span>
            </div>
          </div>
        </section>
        <FunctionDefinitionsWorkspace onNavigationGuardChange={updateFunctionNavigationGuard} />
      </div>}
      </div>
      <footer><span><span className="footer-mark">✦</span> oQuery engine</span><span>Metadata-driven queries · Client preview</span></footer>
    </main>
  );
}

const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <MessageBoxProvider><RouterProvider router={router} /></MessageBoxProvider>
  </Provider>,
);
