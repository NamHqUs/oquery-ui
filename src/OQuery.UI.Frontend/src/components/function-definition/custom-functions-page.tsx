import MainLayout, { databaseExplorerPath, type WorkspaceView } from "../main-layout/main-layout";
import Icon from "../shared/icon/icon";
import { domainDiagramPath } from "../domains/domain-routes";
import { rememberedPlaygroundPath, rememberedPlaygroundSelection } from "../playground/playground-memory";
import FunctionDefinitionWorkspace from "./function-definition";

type CustomFunctionsPageProps = {
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
  onNavigationGuardChange: (guard: ((continueNavigation: () => void, cancelNavigation?: () => void) => void) | null) => void;
};

// Custom functions live in the user section, so the page has no project or domain. Playground and Domain Diagram
// return to the last project and domain the user worked in; the project chooser is only used when none is remembered.
const PROJECT_CHOOSER_PATH = "/projects";

export default function CustomFunctionsPage({ connectionStatus, provider, onNavigate, onOpenConnection, onNavigationGuardChange }: CustomFunctionsPageProps) {
  const onSelectView = (view: WorkspaceView) => {
    if (view === "functions") return;
    if (view === "workspace") {
      onNavigate(PROJECT_CHOOSER_PATH);
      return;
    }
    if (view === "explorer") {
      onNavigate(databaseExplorerPath(rememberedPlaygroundSelection()?.projectId ?? ""));
      return;
    }
    if (view === "diagram") {
      const selection = rememberedPlaygroundSelection();
      onNavigate(selection ? domainDiagramPath(selection.projectId, selection.domainId) : PROJECT_CHOOSER_PATH);
      return;
    }
    onNavigate(rememberedPlaygroundPath() ?? PROJECT_CHOOSER_PATH);
  };
  return (
    <MainLayout
      view="functions"
      projects={[]}
      projectId=""
      domainId=""
      headerContext={<div className="function-scope-label" aria-label="Scope"><Icon name="function" size={14} /><span>Shared across all projects</span></div>}
      connectionStatus={connectionStatus}
      provider={provider}
      onSelectView={onSelectView}
      onSelectProject={() => undefined}
      onSelectDomain={() => undefined}
      onOpenConnection={onOpenConnection}
      onNavigateHome={() => onNavigate("/")}
    >
      {() => <FunctionDefinitionWorkspace onNavigationGuardChange={onNavigationGuardChange} />}
    </MainLayout>
  );
}
