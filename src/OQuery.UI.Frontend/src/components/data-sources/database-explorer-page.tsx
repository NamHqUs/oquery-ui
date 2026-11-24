import MainLayout, { CUSTOM_FUNCTIONS_PATH, Heading, type WorkspaceView } from "../main-layout/main-layout";
import Icon from "../shared/icon/icon";
import { domainDiagramPath } from "../domains/domain-routes";
import { rememberedPlaygroundPath, rememberedPlaygroundSelection } from "../playground/playground-memory";
import DataSources from "./data-sources";

type DatabaseExplorerPageProps = {
  connectionStatus: string;
  provider: string;
  onNavigate: (path: string) => void;
  onOpenConnection: () => void;
};

// The explorer reads the connected database, so the page has no project or domain. Other views return to the last
// playground selection; the project chooser is only used when none is remembered.
const PROJECT_CHOOSER_PATH = "/workspace";

export default function DatabaseExplorerPage({ connectionStatus, provider, onNavigate, onOpenConnection }: DatabaseExplorerPageProps) {
  const onSelectView = (view: WorkspaceView) => {
    if (view === "explorer") return;
    if (view === "functions") {
      onNavigate(CUSTOM_FUNCTIONS_PATH);
      return;
    }
    if (view === "diagram") {
      const selection = rememberedPlaygroundSelection();
      onNavigate(selection ? domainDiagramPath(selection.projectId, selection.domainId) : PROJECT_CHOOSER_PATH);
      return;
    }
    const playgroundPath = rememberedPlaygroundPath();
    if (!playgroundPath) {
      onNavigate(PROJECT_CHOOSER_PATH);
      return;
    }
    onNavigate(view === "playground" ? playgroundPath : `${playgroundPath}?view=${view}`);
  };
  return (
    <MainLayout
      view="explorer"
      projects={[]}
      projectId=""
      domainId=""
      headerContext={<div className="database-explorer-scope" aria-label="Scope"><Icon name="database" size={14} /><span>Connected data source</span></div>}
      connectionStatus={connectionStatus}
      provider={provider}
      onSelectView={onSelectView}
      onSelectProject={() => undefined}
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
