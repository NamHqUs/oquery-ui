import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../icon/icon";
import PanelSplitter from "../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import { fetchDbSchema, fetchDbTables } from "./database-slice";
import TableList from "./table-list/table-list";
import TableDetails from "./table-details/table-details";
import "./data-sources.css";

type DataSourcesProps = {
  onRequestConnection: () => void;
};

export default function DataSources({ onRequestConnection }: DataSourcesProps) {
  const dispatch = useDispatch();
  const {
    selectedTable,
    tableStatus,
    connectionStatus,
    providerCheckStatus,
    connectedProvider,
    connectedProfileName,
    connectionError,
  } = useSelector((state) => state.database);
  const isConnected = connectionStatus === "succeeded";
  const panel = useResizablePanel("data-sources");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [tableListPosition, setTableListPosition] = useState<{ top: number; left: number; width: number; bottom: number } | null>(null);

  useEffect(() => {
    if (providerCheckStatus === "loading" || providerCheckStatus === "idle") return;
    if (!connectedProvider) {
      if (providerCheckStatus === "succeeded") onRequestConnection();
      return;
    }
    if (connectionStatus === "failed" || connectionStatus === "loading") return;
    dispatch(fetchDbTables());
    dispatch(fetchDbSchema());
  }, [dispatch, providerCheckStatus, connectionStatus, connectedProvider, onRequestConnection]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    const sidebar = workspace?.querySelector(".database-sidebar");
    const tableList = workspace?.querySelector(".database-table-list");
    const search = workspace?.querySelector(".database-table-search");
    if (!workspace || !sidebar || !tableList || !search) return;

    const updateListPosition = () => {
      const sidebarRect = sidebar.getBoundingClientRect();
      const sidebarStyle = getComputedStyle(sidebar);
      const searchStyle = getComputedStyle(search);
      const sidebarBottomPadding = Number.parseFloat(sidebarStyle.paddingBottom) || 0;
      const sidebarBottomBorder = Number.parseFloat(sidebarStyle.borderBottomWidth) || 0;
      const sidebarContentBottom = sidebarRect.bottom - sidebarBottomPadding - sidebarBottomBorder;
      const bottomEdge = Math.max(0, Math.min(window.innerHeight - 20, sidebarContentBottom));
      const top = Math.min(
        bottomEdge,
        Math.max(0, search.getBoundingClientRect().bottom + (Number.parseFloat(searchStyle.marginBottom) || 0)),
      );
      const nextPosition = {
        top,
        left: sidebarRect.left,
        width: sidebarRect.width,
        bottom: window.innerHeight - bottomEdge,
      };
      setTableListPosition((current) =>
        current?.top === nextPosition.top
        && current.left === nextPosition.left
        && current.width === nextPosition.width
        && current.bottom === nextPosition.bottom
          ? current
          : nextPosition,
      );
    };

    updateListPosition();
    const observer = new ResizeObserver(updateListPosition);
    observer.observe(sidebar);
    observer.observe(search);
    window.addEventListener("resize", updateListPosition);
    window.addEventListener("scroll", updateListPosition, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateListPosition);
      window.removeEventListener("scroll", updateListPosition, true);
    };
  }, [isConnected]);

  const tableListStyle: CSSProperties | undefined = tableListPosition
    ? {
      position: "fixed",
      top: tableListPosition.top,
      bottom: tableListPosition.bottom,
      left: tableListPosition.left,
      width: tableListPosition.width,
      boxSizing: "border-box",
      zIndex: 4,
      padding: "0 12px",
      borderRight: "1px solid var(--line)",
      backgroundColor: "#0e1117",
    }
    : undefined;

  return (
    <>
      {isConnected && connectionError && <p className="database-message error" role="alert">{connectionError}</p>}
      {isConnected ? (
        <section className={`database-browser split-workspace${panel.collapsed ? " panel-collapsed" : ""}`} style={panel.style}>
          <div
            ref={workspaceRef}
            className={`database-workspace split-workspace${panel.collapsed ? " panel-collapsed" : ""}`}
          >
            <TableList scrollStyle={tableListStyle} />
            <PanelSplitter panel={panel} label="tables panel" />
            <section className="database-content" aria-live="polite">
              {selectedTable ? (
                <TableDetails dataLoadingEnabled={isConnected} />
              ) : (
                <div className="database-placeholder">
                  <Icon name="database" size={24} />
                  <p>{tableStatus === "succeeded" ? "Select a table to view its details and records." : "Loading database tables…"}</p>
                </div>
              )}
            </section>
          </div>
        </section>
      ) : (
        <section className="database-browser database-disconnected">
          <div className="database-placeholder">
            <Icon name="database" size={24} />
            <p>Connect to a database from the top bar to browse its tables and records.</p>
          </div>
        </section>
      )}
    </>
  );
}
