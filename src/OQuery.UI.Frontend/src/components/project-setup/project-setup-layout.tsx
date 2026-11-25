import type { ReactNode } from "react";
import MainLayout, { CUSTOM_FUNCTIONS_PATH, databaseExplorerPath, type WorkspaceView } from "../main-layout/main-layout";
import Icon from "../shared/icon/icon";
import { domainDiagramPath } from "../domains/domain-routes";
import { rememberedPlaygroundPath, rememberedPlaygroundSelection } from "../playground/playground-memory";
import type { ProjectSummary } from "../../services/project-service";

export const WORKSPACE_PATH = "/projects";

type ProjectSetupLayoutProps = {
  projects: ProjectSummary[];
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
  children: ReactNode;
};

// The workspace pages (project list, new project) are not bound to a project or domain, so the header shows a scope
// label and hides the Domain selector. Project and domain items return to the last playground the user worked in.
export default function ProjectSetupLayout({ projects, connectionStatus, provider, onNavigate, onOpenConnection, children }: ProjectSetupLayoutProps) {
  const onSelectView = (view: WorkspaceView) => {
    if (view === "workspace") return onNavigate(WORKSPACE_PATH);
    if (view === "functions") return onNavigate(CUSTOM_FUNCTIONS_PATH);
    if (view === "explorer") return onNavigate(databaseExplorerPath(rememberedPlaygroundSelection()?.projectId ?? ""));
    if (view === "diagram") {
      const selection = rememberedPlaygroundSelection();
      return onNavigate(selection ? domainDiagramPath(selection.projectId, selection.domainId) : WORKSPACE_PATH);
    }
    onNavigate(rememberedPlaygroundPath() ?? WORKSPACE_PATH);
  };
  return (
    <MainLayout
      view="workspace"
      projects={projects}
      projectId=""
      domainId=""
      hideDomainSelect
      headerContext={<div className="function-scope-label" aria-label="Scope"><Icon name="folder" size={14} /><span>Workspace projects</span></div>}
      connectionStatus={connectionStatus}
      provider={provider}
      onSelectView={onSelectView}
      onSelectProject={(projectId) => onNavigate(`/playground/${encodeURIComponent(projectId)}`)}
      onSelectDomain={() => undefined}
      onOpenConnection={onOpenConnection}
      onNavigateHome={() => onNavigate("/")}
    >
      {() => children}
    </MainLayout>
  );
}
