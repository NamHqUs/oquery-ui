import { useEffect, useMemo, useState } from "react";
import { Heading } from "../main-layout/main-layout";
import Icon from "../shared/icon/icon";
import { fetchPlaygrounds, type SavedPlayground } from "../../services/playground-service";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

// Lists the playgrounds saved in the selected domain. Search filters by name; each row opens its playground.
export default function PlaygroundSavedQueries({ projectId, domainId, onOpenPlayground }: {
  projectId: string;
  domainId: string;
  onOpenPlayground: (queryId: string) => void;
}) {
  const [items, setItems] = useState<SavedPlayground[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setItems(null);
    setError("");
    fetchPlaygrounds(projectId, domainId)
      .then((playgrounds) => {
        if (active) setItems(playgrounds);
      })
      .catch((failure: unknown) => {
        if (active) setError(messageOf(failure));
      });
    return () => {
      active = false;
    };
  }, [projectId, domainId]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items ?? []).filter((item) => !term || (item.name || "").toLowerCase().includes(term));
  }, [items, search]);

  return <>
    <Heading icon="file-text" title="Saved queries" text="Playgrounds saved in this domain" action="New query" onAction={() => onOpenPlayground("")} />
    <div className="main-layout-toolbar">
      <input type="search" placeholder="Search queries..." aria-label="Search saved queries" value={search} onChange={(event) => setSearch(event.target.value)} />
      {items && <span>{items.length} saved</span>}
    </div>
    {error && <p className="connection-message error" role="alert">{error}</p>}
    {!items && !error && <p className="metadata-message">Loading saved queries…</p>}
    {items && items.length === 0 && <p className="metadata-message">No saved queries in this domain yet. Save a playground to see it here.</p>}
    {items && items.length > 0 && visible.length === 0 && <p className="metadata-message">No saved queries match “{search.trim()}”.</p>}
    {visible.length > 0 && <section className="main-layout-panel query-list" aria-label="Saved queries">
      {visible.map((item) => <article key={item.id}>
        <Icon name="chart-bar" size={19} />
        <div><b>{item.name || "Untitled query"}</b><p>{item.tabs.length} tab{item.tabs.length === 1 ? "" : "s"}</p></div>
        <small>{item.entity || "No entity"}</small>
        <button className="main-layout-primary" type="button" onClick={() => onOpenPlayground(item.id)}>Open</button>
      </article>)}
    </section>}
  </>;
}
