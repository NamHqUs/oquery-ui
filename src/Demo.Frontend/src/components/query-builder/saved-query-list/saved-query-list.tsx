import { useState } from "react";
import Icon from "../../icon/icon";
import type { SavedQueryRequestDto } from "../query-design/query-builder-slice";
import "./saved-query-list.css";

type SavedQueryListProps = {
  requests: SavedQueryRequestDto[];
  selectedRequestName: string | null;
  status: string;
  error: string;
  onSelectRequest: (request: SavedQueryRequestDto) => void;
  onRetry: () => void;
};

export default function SavedQueryList({
  requests,
  selectedRequestName,
  status,
  error,
  onSelectRequest,
  onRetry,
}: SavedQueryListProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const sortedRequests = [...requests].sort((left, right) => (
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
  ));
  const filteredRequests = sortedRequests.filter((request) => (
    !normalizedSearchTerm || request.name.toLowerCase().includes(normalizedSearchTerm)
  ));

  return (
    <aside className="saved-query-library split-panel" aria-label="Saved queries">
      <div className="saved-query-library-heading">
        <span className="section-kicker">SAVED QUERIES</span><span className="saved-query-total">{requests.length}</span>
      </div>
      <div className="saved-query-library-content">
        {status !== "loading" && status !== "failed" && requests.length > 0 && (
          <label className="saved-query-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search saved queries"
              aria-label="Search saved queries"
            />
          </label>
        )}
        {status === "loading" && <p className="saved-query-status">Loading saved queries…</p>}
        {status === "failed" && (
          <div className="saved-query-status error" role="alert">
            <span>{error}</span>
            <button type="button" className="saved-query-retry" onClick={onRetry}>Retry</button>
          </div>
        )}
        {status !== "failed" && status !== "loading" && requests.length === 0 && (
          <p className="saved-query-status">No saved queries yet.</p>
        )}
        {status !== "failed" && status !== "loading" && requests.length > 0 && filteredRequests.length === 0 && (
          <p className="saved-query-status">No saved queries match “{searchTerm.trim()}”.</p>
        )}
        {status !== "failed" && status !== "loading" && filteredRequests.length > 0 && (
          <ul className="saved-query-list">
            {filteredRequests.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`saved-query-item${selectedRequestName === item.name ? " active" : ""}`}
                  onClick={() => onSelectRequest(item)}
                  aria-current={selectedRequestName === item.name ? "page" : undefined}
                >
                  <span className="saved-query-item-copy">
                    <span className="saved-query-item-name">{item.name}</span>
                    <span className="saved-query-item-description">
                      {item.isBuiltin ? "Ready-to-use query" : "Your saved query"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
