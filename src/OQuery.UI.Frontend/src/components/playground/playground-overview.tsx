import { useEffect, useState } from "react";
import { CUSTOM_FUNCTIONS_PATH, Heading, PageHeader, databaseExplorerPath } from "../main-layout/main-layout";
import Icon, { type IconName } from "../shared/icon/icon";
import { fetchPlaygrounds, type SavedPlayground } from "../../services/playground-service";
import { getDomain, type DomainDetails } from "../../services/project-service";

type OverviewData = { domain: DomainDetails; playgrounds: SavedPlayground[] };

const RECENT_LIMIT = 4;

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return <article><Icon name={icon} size={21} /><span>{label}<b>{value}</b></span></article>;
}

// Real counts for the selected domain. Opening a saved playground goes through onOpenPlayground, which receives its ID.
export default function PlaygroundOverview({ projectId, domainId, onOpenPlayground, onNavigate }: {
  projectId: string;
  domainId: string;
  onOpenPlayground: (queryId: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [state, setState] = useState<{ data: OverviewData | null; error: string }>({ data: null, error: "" });

  useEffect(() => {
    let active = true;
    setState({ data: null, error: "" });
    Promise.all([getDomain(projectId, domainId), fetchPlaygrounds(projectId, domainId)])
      .then(([domain, playgrounds]) => {
        if (active) setState({ data: { domain, playgrounds }, error: "" });
      })
      .catch((error: unknown) => {
        if (active) setState({ data: null, error: messageOf(error) });
      });
    return () => {
      active = false;
    };
  }, [projectId, domainId]);

  const { data, error } = state;
  return <>
    <PageHeader>
      <Heading icon="grid" title="Overview" text={data ? `Domain ${data.domain.name || domainId}` : "Your domain at a glance"} />
    </PageHeader> {error && <p className="connection-message error" role="alert">{error}</p>}
    {!data && !error && <p className="metadata-message">Loading overview…</p>}
    {data && <>
      <div className="main-layout-stats">
        <Stat icon="schema" label="Entities" value={data.domain.entities.length} />
        <Stat icon="database" label="Relations" value={data.domain.relations.length} />
        <Stat icon="file-text" label="Saved queries" value={data.playgrounds.length} />
      </div>
      <div className="main-layout-overview-grid">
        <section className="main-layout-panel wide">
          <header><span><Icon name="file-text" size={16} /><b>Recent saved queries</b></span></header>
          {data.playgrounds.length === 0
            ? <p className="metadata-message">No saved queries in this domain yet.</p>
            : <div className="main-layout-list">
              {data.playgrounds.slice(0, RECENT_LIMIT).map((item) => <p key={item.id}>
                <Icon name="chart-bar" size={15} />
                <b>{item.name || "Untitled query"}<small>{item.entity || "No entity"}</small></b>
                <button type="button" className="button secondary" onClick={() => onOpenPlayground(item.id)}>Open</button>
              </p>)}
            </div>}
        </section>
        <section className="main-layout-panel">
          <header><span><Icon name="play" size={16} /><b>Quick actions</b></span></header>
          <div className="main-layout-actions-list">
            <button type="button" onClick={() => onOpenPlayground("")}>New playground<span>›</span></button>
            <button type="button" onClick={() => onNavigate(databaseExplorerPath(projectId))}>Explore database<span>›</span></button>
            <button type="button" onClick={() => onNavigate(CUSTOM_FUNCTIONS_PATH)}>Custom functions<span>›</span></button>
          </div>
        </section>
      </div>
    </>}
  </>;
}
