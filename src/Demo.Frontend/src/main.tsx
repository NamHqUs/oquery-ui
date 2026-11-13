import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useBlocker, useLocation, useNavigate } from "react-router-dom";
import Icon, { getDatabaseIconName } from "./components/icon/icon";
import DataSources from "./components/data-sources/data-sources";
import DatabaseConnection from "./components/data-sources/database-connection/database-connection";
import { fetchDbProvider } from "./components/data-sources/database-slice";
import QueryBuilder from "./components/query-builder/query-builder";
import MetadataBuilder from "./components/metadata-builder/metadata-builder";
import { parseWizardRoute, WIZARD_ROUTE_PATHS } from "./components/metadata-builder/metadata-routes";
import FunctionDefinitionsWorkspace from "./components/function-definition/function-definition";
import Home from "./components/home/home";
import Documentation from "./components/documentation/documentation";
import { documentationSubmenu } from "./components/documentation/doc-agenda";
import { GITHUB_URL, PRODUCT_NAME } from "./components/home/home-content";
import { MessageBoxProvider } from "./components/message-box/message-box";
import * as domainService from "./services/domain-service";
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
const DOMAINS_PATH = "/metadata/domains";
const DIAGRAMS_PATH = "/metadata/diagrams";
const ENTITIES_PATH = "/metadata/entities";
const DATABASE_EXPLORER_PATH = "/metadata/explorer";
const METADATA_LAST_ROUTE_STORAGE_KEY = "oquery.metadata.last-route";

type Page = keyof typeof PAGE_PATHS;
type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;
type MetadataSection = "diagram" | "entities" | "domains" | "explorer";

const HOME_SUBMENU = [
  { label: "Playground", target: "hp-playground" },
  { label: "Examples", target: "hp-examples" },
  { label: "Capabilities", target: "hp-capabilities" },
  { label: "How it works", target: "hp-reveal" },
  { label: "For developers", target: "hp-developers" },
] as const;

const PAGE_SUBMENUS: Record<Exclude<Page, "home">, readonly string[]> = {
  builder: [],
  sources: ["Connections", "Tables", "Schema"],
  metadata: ["Domains", "Diagram", "Entity definitions", "Explore database"],
  functions: [],
  documentation: [],
};
const QUERY_DOMAIN_TONES = ["revenue", "customer", "product", "finance", "custom"] as const;

function pageForPath(path: string): Page | null {
  if (path === DOMAINS_PATH || path === DIAGRAMS_PATH || parseWizardRoute(path)
    || path === ENTITIES_PATH || path.startsWith(`${ENTITIES_PATH}/`)
    || path === DATABASE_EXPLORER_PATH) return "metadata";
  return (Object.keys(PAGE_PATHS) as Page[]).find((page) => PAGE_PATHS[page] === path) ?? null;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PageSubnav({
  page,
  onNavigateToPage,
  onBuilderDomainSelect,
  onMetadataSectionSelect,
}: {
  page: Page | null;
  onNavigateToPage: (nextPage: Page) => void;
  onBuilderDomainSelect: (domainId: string) => void;
  onMetadataSectionSelect: (section: MetadataSection) => void;
}) {
  const location = useLocation();
  const [queryDomains, setQueryDomains] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (page !== "builder") return;
    let active = true;
    domainService.listDomainNames()
      .then((domains) => {
        if (active) {
          setQueryDomains(domains);
          if (!new URLSearchParams(location.search).get("domain") && domains[0]) {
            onBuilderDomainSelect(domains[0].id);
          }
        }
      })
      .catch((error: unknown) => {
        if (active) console.error(error instanceof Error ? error.message : "Unable to load query domains.");
      });
    return () => {
      active = false;
    };
  }, [location.search, onBuilderDomainSelect, page]);
  const wizardRoute = parseWizardRoute(location.pathname);
  const metadataSection = wizardRoute
    ? wizardRoute.section
    : location.pathname === DOMAINS_PATH
    ? "domains"
    : location.pathname === ENTITIES_PATH
      || location.pathname.startsWith(`${ENTITIES_PATH}/`)
      ? "entities"
    : location.pathname === DATABASE_EXPLORER_PATH
      ? "explorer"
    : location.pathname === DIAGRAMS_PATH
      ? "diagram"
      : new URLSearchParams(location.search).get("section") ?? "diagram";
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
    <>
      <nav className="hp-subnav app-subnav" aria-label={`${page} sections`}>
        <span className="hp-subnav-brand">{page === "builder" ? "QUERY BUILDER" : page.replace("-", " ").toUpperCase()}</span>
        <div className={`hp-subnav-links${page === "builder" ? " query-builder-subnav-links" : ""}`}>
          {page === "builder" ? <>
            <button type="button" className="active" aria-current="page">Plan text</button>
            <span className="query-builder-subnav-item" aria-disabled="true">Query Builder <small>Hide</small></span>
            <span className="query-builder-subnav-item" aria-disabled="true">AI Assistant <small>Roadmap</small></span>
          </> : <>
            {page === "documentation" && documentationSubmenu.map((item) => (
              <button key={item.target} type="button" onClick={() => scrollToSection(item.target)}>{item.label}</button>
            ))}
            {PAGE_SUBMENUS[page].map((item) => {
            const itemSection = item === "Diagram" ? "diagram" : item === "Entity definitions" ? "entities" : item === "Domains" ? "domains" : undefined;
            const metadataItemSection = itemSection ?? (item === "Explore database" ? "explorer" : undefined);
            const isActive = page === "metadata" && metadataItemSection === metadataSection;
            return <button
              key={item}
              type="button"
              className={isActive ? "active" : undefined}
              aria-current={isActive ? "page" : undefined}
              onClick={page === "metadata" && metadataItemSection
                ? () => onMetadataSectionSelect(metadataItemSection)
                : undefined}
            >{item}</button>;
            })}
            {page === "functions" && (
              <div className="function-subnav-intro">
                <strong>Custom functions</strong>
                <span>Extend the OQuery vocabulary with reusable business logic.</span>
              </div>
            )}
          </>}
        </div>
        <div className={`app-subnav-actions${page === "metadata" || page === "functions" || page === "builder" ? "" : " app-subnav-actions-hidden"}`} id="metadata-toolbar-actions">
        </div>
      </nav>
      {page === "builder" && <div className="query-builder-domain-bar diagram-toolbar">
        <div>
          <span className="section-kicker">QUERY DOMAINS</span>
          <p>Choose a domain to plan a query against its metadata.</p>
        </div>
        <nav className="diagram-group-switch query-builder-domain-list" aria-label="Query domains">
          {queryDomains.map((domain, index) => {
            const isActive = new URLSearchParams(location.search).get("domain") === domain.id;
            return <button
              key={domain.id}
              type="button"
              className={`diagram-group-button tone-${QUERY_DOMAIN_TONES[index % QUERY_DOMAIN_TONES.length]}${isActive ? " active" : ""}`}
              aria-pressed={isActive}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onBuilderDomainSelect(domain.id)}
            >
              <span className="diagram-group-mark" aria-hidden="true" />
              <strong>{domain.name}</strong>
            </button>;
          })}
        </nav>
      </div>}
    </>
  );
}

function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const database = useSelector((state: RootState) => state.database);
  const page = pageForPath(location.pathname);
  const [metadataVisited, setMetadataVisited] = useState(() => location.pathname === PAGE_PATHS.metadata || pageForPath(location.pathname) === "metadata");
  const [functionDefinitionsVisited, setFunctionDefinitionsVisited] = useState(() => location.pathname === PAGE_PATHS.functions);
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
    void store.dispatch(fetchDbProvider());
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
    if (location.pathname === PAGE_PATHS.metadata || pageForPath(location.pathname) === "metadata") setMetadataVisited(true);
    if (location.pathname === PAGE_PATHS.functions) setFunctionDefinitionsVisited(true);
  }, [location.pathname]);
  useEffect(() => {
    if (page !== "metadata"
      || location.pathname === PAGE_PATHS.metadata
      || parseWizardRoute(location.pathname)) return;
    window.sessionStorage.setItem(
      METADATA_LAST_ROUTE_STORAGE_KEY,
      `${location.pathname}${location.search}${location.hash}`,
    );
  }, [location.hash, location.pathname, location.search, page]);

  const requestDatabaseConnection = useCallback(() => setConnectionDialogOpen(true), []);
  const navigateToBuilderDomain = useCallback(
    (domainId: string) => routerNavigate(`${PAGE_PATHS.builder}?domain=${encodeURIComponent(domainId)}`),
    [routerNavigate],
  );

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
    const rememberedMetadataRoute = window.sessionStorage.getItem(METADATA_LAST_ROUTE_STORAGE_KEY);
    const destination = nextPage === "builder" && fromHome
      ? `${PAGE_PATHS.builder}?from=home`
      : nextPage === "metadata"
        ? rememberedMetadataRoute?.startsWith(`${PAGE_PATHS.metadata}/`)
          ? rememberedMetadataRoute
          : DOMAINS_PATH
      : PAGE_PATHS[nextPage];
    const continueNavigation = () => {
      if (nextPage === "metadata") setMetadataVisited(true);
      if (nextPage === "functions") setFunctionDefinitionsVisited(true);
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
          <nav className="topnav" aria-label="Primary navigation"><button className={page === "metadata" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("metadata")}><Icon name="schema" /> Metadata</button><button className={page === "builder" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("builder")}><Icon name="query" /> Playground</button><button className={page === "functions" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("functions")}><Icon name="function" /> Function definitions</button><button className={page === "documentation" ? "nav-item active" : "nav-item"} onClick={() => navigateToPage("documentation")}><Icon name="file-text" /> Docs</button></nav>
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
        onBuilderDomainSelect={navigateToBuilderDomain}
        onMetadataSectionSelect={(section) => {
          if (section === "explorer") {
          if (metadataSectionNavigation.current) metadataSectionNavigation.current(section);
          else routerNavigate(DATABASE_EXPLORER_PATH);
          return;
          }
          if (metadataSectionNavigation.current) {
          metadataSectionNavigation.current(section);
          return;
          }
          routerNavigate(section === "domains" ? DOMAINS_PATH : section === "entities" ? ENTITIES_PATH : DIAGRAMS_PATH);
        }}
      />
      <div className="page-content">
        <Routes>
          <Route path={PAGE_PATHS.home} element={<div className="page-transition page-transition-no-slide"><Home onNavigateToPage={navigateToPage} onRequestConnection={requestDatabaseConnection} /></div>} />
          <Route path={PAGE_PATHS.documentation} element={<div className="page-transition page-transition-no-slide"><Documentation /></div>} />
          <Route path={PAGE_PATHS.builder} element={null} />
          <Route path={PAGE_PATHS.metadata} element={null} />
          <Route path={DOMAINS_PATH} element={null} />
          <Route path={DIAGRAMS_PATH} element={null} />
          {WIZARD_ROUTE_PATHS.map((path) => <Route key={path} path={path} element={null} />)}
          <Route path={ENTITIES_PATH} element={null} />
          <Route path={`${ENTITIES_PATH}/:domainId`} element={null} />
          <Route path={DATABASE_EXPLORER_PATH} element={null} />
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
      {page === "builder" && <QueryBuilder
        key={new URLSearchParams(location.search).get("domain") || "query-builder"}
        onRequestConnection={requestDatabaseConnection}
        onBackToHome={new URLSearchParams(location.search).get("from") === "home"
          ? () => navigateToPage("home")
          : undefined}
      />}
      {metadataVisited && page === "metadata" && location.pathname !== DATABASE_EXPLORER_PATH && <div className="page-transition page-transition-no-slide"><MetadataBuilder onNavigationGuardChange={updateMetadataNavigationGuard} onSectionNavigationChange={updateMetadataSectionNavigation} /></div>}
      {metadataVisited && page === "metadata" && location.pathname === DATABASE_EXPLORER_PATH && <DataSources onRequestConnection={requestDatabaseConnection} />}
      {functionDefinitionsVisited && <div hidden={page !== "functions"} className={page === "functions" ? "page-transition page-transition-no-slide" : undefined}>
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
