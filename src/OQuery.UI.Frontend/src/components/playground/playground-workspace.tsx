import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import MainLayout, { CUSTOM_FUNCTIONS_PATH, databaseExplorerPath, type WorkspaceView } from "../main-layout/main-layout";
import type { ProjectSummary } from "../../services/project-service";
import Playground from "./playground";
import PlaygroundOverview from "./playground-overview";
import PlaygroundSavedQueries from "./playground-saved-queries";
import { playgroundPath } from "./playground-memory";
import { domainDiagramPath } from "../domains/domain-routes";
import { WORKSPACE_PATH } from "../project-setup/project-setup-layout";

// Views rendered inside the playground shell; custom functions, the explorer, and the diagram have their own routes.
const LOCAL_VIEWS: WorkspaceView[] = ["overview", "playground", "queries"];

export default function PlaygroundWorkspace({ projectId, domainId, queryId, projects, connectionStatus, provider, onNavigate, onOpenConnection }: {
  projectId: string;
  domainId: string;
  queryId: string;
  projects: ProjectSummary[];
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
}) {
  const [searchParams] = useSearchParams();
  // Other pages open a specific view with ?view=<name>, such as the menu on the Domain Diagram page.
  const [view, setView] = useState<WorkspaceView>(() => {
    const requested = searchParams.get("view") as WorkspaceView | null;
    return requested && LOCAL_VIEWS.includes(requested) ? requested : "playground";
  });
  const selectView = (next: WorkspaceView, selectedDomainId: string) => {
    if (next === "diagram") onNavigate(domainDiagramPath(projectId, selectedDomainId));
    else if (next === "functions") onNavigate(CUSTOM_FUNCTIONS_PATH);
    else if (next === "explorer") onNavigate(databaseExplorerPath(projectId));
    else if (next === "workspace") onNavigate(WORKSPACE_PATH);
    else setView(next);
  };
  return <MainLayout
    view={view}
    projects={projects}
    projectId={projectId}
    domainId={domainId}
    connectionStatus={connectionStatus}
    provider={provider}
    onSelectView={selectView}
    onSelectProject={(id) => { if (id) onNavigate(`/playground/${encodeURIComponent(id)}`); }}
    onSelectDomain={(id) => { if (id) onNavigate(`/playground/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`); }}
    onOpenConnection={onOpenConnection}
    onNavigateHome={() => onNavigate("/")}
  >
    {({ domainId: selectedDomainId }) => {
      // Opening a saved query or a new playground switches this shell to the playground view and updates the URL.
      const openPlayground = (targetQueryId: string) => {
        setView("playground");
        onNavigate(targetQueryId ? `${playgroundPath(projectId, selectedDomainId)}/${encodeURIComponent(targetQueryId)}` : playgroundPath(projectId, selectedDomainId));
      };
      if (view === "overview") return <PlaygroundOverview projectId={projectId} domainId={selectedDomainId} onOpenPlayground={openPlayground} onNavigate={onNavigate} />;
      if (view === "queries") return <PlaygroundSavedQueries projectId={projectId} domainId={selectedDomainId} onOpenPlayground={openPlayground} />;
      return <Playground queryId={queryId} projectId={projectId} domainId={selectedDomainId} />;
    }}
  </MainLayout>;
}
