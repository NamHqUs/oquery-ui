import { useEffect, useState } from "react";
import Icon, { type IconName } from "../shared/icon/icon";
import type { WorkspaceView } from "./main-layout";

// "auto" follows the viewport width; an explicit choice is kept until the user toggles again.
export type SidebarPreference = "auto" | "expanded" | "collapsed";
export type SidebarGroupId = "domain" | "project" | "global";
type SidebarItem = { view: WorkspaceView; label: string; icon: IconName };
type SidebarGroup = { id: SidebarGroupId; label: string; items: SidebarItem[] };

export const SIDEBAR_AUTO_COLLAPSE_WIDTH = 1280;
const SIDEBAR_STORAGE_KEY = "oquery.main-sidebar";
const RESIZE_DEBOUNCE_MS = 150;

// Groups are ordered by how often they are used: domain tools first, then project tools, then global tools.
export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "domain",
    label: "Domain",
    items: [
      { view: "playground", label: "Playground", icon: "play" },
      { view: "queries", label: "Queries", icon: "file-text" },
      { view: "diagram", label: "Domain Diagram", icon: "schema" },
    ],
  },
  {
    id: "project",
    label: "Project",
    items: [
      { view: "overview", label: "Overview", icon: "grid" },
      { view: "explorer", label: "Database explorer", icon: "database" },
    ],
  },
  {
    id: "global",
    label: "Global",
    items: [
      { view: "functions", label: "Custom functions", icon: "function" },
      { view: "workspace", label: "Workspace", icon: "folder" },
    ],
  },
];

export function isSidebarCollapsed(preference: SidebarPreference, viewportWidth: number) {
  if (preference === "auto") return viewportWidth < SIDEBAR_AUTO_COLLAPSE_WIDTH;
  return preference === "collapsed";
}

export function parseSidebarPreference(value: string | null): SidebarPreference {
  return value === "expanded" || value === "collapsed" ? value : "auto";
}

function readPreference(): SidebarPreference {
  try {
    return parseSidebarPreference(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

// The preference lives in local storage, so it survives page changes that remount the layout.
export function useSidebarCollapse() {
  const [preference, setPreference] = useState(readPreference);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    if (preference !== "auto") return;
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setViewportWidth(window.innerWidth), RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [preference]);
  const collapsed = isSidebarCollapsed(preference, viewportWidth);
  const toggle = () => {
    const next: SidebarPreference = collapsed ? "expanded" : "collapsed";
    setPreference(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session when storage is unavailable.
    }
  };
  return { collapsed, toggle };
}

type MainLayoutSidebarProps = {
  view: WorkspaceView;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (view: WorkspaceView) => void;
};

export default function MainLayoutSidebar({ view, collapsed, onToggle, onSelect }: MainLayoutSidebarProps) {
  return <aside className={`root-sidebar${collapsed ? " collapsed" : ""}`} aria-label="Main menu">
    <button type="button" className="root-sidebar-toggle" aria-label={collapsed ? "Expand main menu" : "Collapse main menu"} aria-expanded={!collapsed} onClick={onToggle}>
      <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={14} />
    </button>
    <nav aria-label="Workspace">
      {SIDEBAR_GROUPS.map((group) => <div key={group.id} className="root-sidebar-group" role="group" aria-label={group.label}>
        <span className="root-sidebar-label" aria-hidden="true">{group.label}</span>
        {group.items.map((item) => <button
            key={item.view}
            type="button"
            className={view === item.view ? "active" : ""}
            aria-current={view === item.view ? "page" : undefined}
            title={item.label}
            aria-label={item.label}
            onClick={() => onSelect(item.view)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>)}
      </div>)}
    </nav>
    {!collapsed && <p>Smarter queries.<br />Deeper insights.</p>}
  </aside>;
}
