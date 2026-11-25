import MainLayout, { CUSTOM_FUNCTIONS_PATH, Heading, databaseExplorerPath, type WorkspaceView } from "../main-layout/main-layout";
import type { ProjectSummary } from "../../services/project-service";
import { domainDiagramPath } from "../domains/domain-routes";
import { playgroundPath, rememberedPlaygroundPath, rememberedPlaygroundSelection } from "../playground/playground-memory";
import DataSources from "./data-sources";

type DatabaseExplorerPageProps = {
  projects: ProjectSummary[];
  projectId: string;
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
};

// The explorer is bound to the project in ?project=. Other views open the same project; the project chooser is only
// used when no project is selected and none is remembered.
const PROJECT_CHOOSER_PATH = "/projects";

export default function DatabaseExplorerPage({ projects, projectId, connectionStatus, provider, onNavigate, onOpenConnection }: DatabaseExplorerPageProps) {
  const onSelectView = (view: WorkspaceView) => {
    if (view === "explorer") return;
    if (view === "functions") {
      onNavigate(CUSTOM_FUNCTIONS_PATH);
      return;
    }
    const selection = rememberedPlaygroundSelection();
    if (view === "diagram") {
      const domainId = selection?.projectId === projectId ? selection.domainId : "";
      onNavigate(projectId && domainId ? domainDiagramPath(projectId, domainId) : PROJECT_CHOOSER_PATH);
      return;
    }
    const basePath = projectId ? playgroundPath(projectId) : rememberedPlaygroundPath();
    if (!basePath) {
      onNavigate(PROJECT_CHOOSER_PATH);
      return;
    }
    onNavigate(view === "playground" ? basePath : `${basePath}?view=${view}`);
  };
  return (
    <MainLayout
      view="explorer"
      projects={projects}
      projectId={projectId}
      domainId=""
      hideDomainSelect
      connectionStatus={connectionStatus}
      provider={provider}
      onSelectView={onSelectView}
      onSelectProject={(id) => { if (id) onNavigate(databaseExplorerPath(id)); }}
      onSelectDomain={() => undefined}
      onOpenConnection={onOpenConnection}
      onNavigateHome={() => onNavigate("/")}
    >
      {() => (
        <>
          <Heading icon="database" title="Database explorer" text="Browse source tables and inspect your connected data" />
          <DataSources onRequestConnection={onOpenConnection} />
        </>
      )}
    </MainLayout>
  );
}
