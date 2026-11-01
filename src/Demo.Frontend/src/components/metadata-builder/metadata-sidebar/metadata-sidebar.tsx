import { useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import Icon from "../../icon/icon";
import SidebarList from "../../sidebar-list/sidebar-list";
import "./metadata-sidebar.css";

export type MetadataSidebarGroup = {
  id: string;
  title: string;
  count: number;
  content: ReactNode;
  emptyMessage?: string;
};

type MetadataSidebarProps = {
  className: string;
  title: string;
  totalCount: number;
  filter: string;
  searchPlaceholder: string;
  loadingMessage?: string;
  groups: MetadataSidebarGroup[];
  onFilterChange: (filter: string) => void;
  scrollable?: boolean;
  listRef?: RefObject<HTMLDivElement | null>;
  scrollStyle?: CSSProperties;
};

export default function MetadataSidebar({
  className,
  title,
  totalCount,
  filter,
  searchPlaceholder,
  loadingMessage,
  groups,
  onFilterChange,
  scrollable = false,
  listRef,
  scrollStyle,
}: MetadataSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const listContent = (
    <>
      {loadingMessage && <p className="metadata-message">{loadingMessage}</p>}
      {groups.map((group) => {
        const expanded = expandedGroups[group.id] ?? true;
        return (
          <section className="metadata-list-group" key={group.id}>
            <button
              className="metadata-list-group-head"
              type="button"
              aria-expanded={expanded}
              aria-controls={group.id}
              onClick={() => setExpandedGroups((current) => ({
                ...current,
                [group.id]: !expanded,
              }))}
            >
              <span className="metadata-list-group-title">{group.title}</span>
              <span className="tab-number">{group.count}</span>
              <span className="metadata-list-group-chevron"><Icon name="chevron-down" size={14} /></span>
            </button>
            <div id={group.id} hidden={!expanded}>
              {group.content}
              {group.emptyMessage && <p className="metadata-list-group-empty">{group.emptyMessage}</p>}
            </div>
          </section>
        );
      })}
    </>
  );

  return (
    <SidebarList
      className={className}
      ariaLabel={title}
      title={title}
      totalCount={<span className="tab-number">{totalCount}</span>}
      filter={filter}
      searchPlaceholder={searchPlaceholder}
      onFilterChange={onFilterChange}
      listRef={listRef}
      listClassName={scrollable ? "metadata-sidebar-scroll" : "metadata-sidebar-content"}
      searchClassName="metadata-search"
      scrollStyle={scrollStyle}
    >
      {listContent}
    </SidebarList>
  );
}
