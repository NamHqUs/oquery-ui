import type { ProjectSummary } from "../../services/project-service";
import MainLayout, { CUSTOM_FUNCTIONS_PATH, type WorkspaceView } from "../main-layout/main-layout";
import { domainDiagramPath } from "../domains/domain-routes";
import FunctionDefinitionWorkspace from "./function-definition";

type CustomFunctionsPageProps = {
  projectId: string;
  projects: ProjectSummary[];
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
  onNavigationGuardChange: (guard: ((continueNavigation: () => void, cancelNavigation?: () => void) => void) | null) => void;
};

const encode = (segment: string) => encodeURIComponent(segment);

// Custom functions is project-scoped, so the domain selector opens that domain's playground and the views
// route the same way the domain diagram does.
export default function CustomFunctionsPage({ projectId, projects, connectionStatus, provider, onNavigate, onOpenConnection, onNavigationGuardChange }: CustomFunctionsPageProps) {
  const onSelectView = (view: WorkspaceView, domainId: string) => {
    if (view === "functions") return;
    if (view === "diagram") {
      onNavigate(domainDiagramPath(projectId, domainId));
      return;
    }
    onNavigate(`/playground/${encode(projectId)}${domainId ? `/${encode(domainId)}` : ""}${view === "playground" ? "" : `?view=${encodeURIComponent(view)}`}`);
  };
  return (
    <MainLayout
      view="functions"
      projects={projects}
      projectId={projectId}
      domainId=""
      connectionStatus={connectionStatus}
      provider={provider}
      onSelectView={onSelectView}
      onSelectProject={(id) => { if (id) onNavigate(`${CUSTOM_FUNCTIONS_PATH}?${new URLSearchParams({ project: id }).toString()}`); }}
      onSelectDomain={(id) => { if (id) onNavigate(`/playground/${encode(projectId)}/${encode(id)}`); }}
      onOpenConnection={onOpenConnection}
      onNavigateHome={() => onNavigate("/")}
    >
      {() => <FunctionDefinitionWorkspace projectId={projectId} onNavigationGuardChange={onNavigationGuardChange} />}
    </MainLayout>
  );
}
