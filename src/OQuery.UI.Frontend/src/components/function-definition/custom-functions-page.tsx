import MainLayout, { type WorkspaceView } from "../main-layout/main-layout";
import Icon from "../shared/icon/icon";
import FunctionDefinitionWorkspace from "./function-definition";

type CustomFunctionsPageProps = {
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
  onNavigationGuardChange: (guard: ((continueNavigation: () => void, cancelNavigation?: () => void) => void) | null) => void;
};

// Custom functions live in the user section, so the page has no project or domain. Views that need a project
// open the project chooser first.
const PROJECT_CHOOSER_PATH = "/workspace";

export default function CustomFunctionsPage({ connectionStatus, provider, onNavigate, onOpenConnection, onNavigationGuardChange }: CustomFunctionsPageProps) {
  const onSelectView = (view: WorkspaceView) => {
    if (view === "functions") return;
    onNavigate(PROJECT_CHOOSER_PATH);
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
