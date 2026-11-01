import { useEffect, useRef, useState, type CSSProperties } from "react";
import Icon from "../../../icon/icon";
import { MetadataEntity } from "../../../query-builder/query-design/query-builder-slice";
import MetadataSidebar, { type MetadataSidebarGroup } from "../../metadata-sidebar/metadata-sidebar";
import "./entity-list.css";

type EntityListProps = {
  entities: MetadataEntity[];
  selectedName: string;
  filter: string;
  status: string;
  onFilterChange: (filter: string) => void;
  onSelectEntity: (entity: MetadataEntity) => void;
};

export default function EntityList({
  entities,
  selectedName,
  filter,
  status,
  onFilterChange,
  onSelectEntity,
}: EntityListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [listPosition, setListPosition] = useState<{ top: number; left: number; width: number; bottom: number } | null>(null);
  const visibleEntities = entities.filter((entity) =>
    entity.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const customEntities = visibleEntities.filter((entity) => entity.canDelete !== false);
  const builtInEntities = visibleEntities.filter((entity) => entity.canDelete === false);
  const renderEntity = (entity: MetadataEntity) => (
    <button
      className={`metadata-entity${entity.name === selectedName ? " active" : ""}`}
      key={entity.name}
      onClick={() => onSelectEntity(entity)}
    >
      <span className="entity-icon"><Icon name="table" size={14} /></span>
      <span>
        <b>{entity.name}</b>
        <small>{entity.fields.length} fields · {(entity.relations || []).length} relations</small>
      </span>
      <Icon name="chevron" size={14} />
    </button>
  );
  const groups: MetadataSidebarGroup[] = [
    {
      id: "entity-custom-list",
      title: "Custom",
      count: customEntities.length,
      content: customEntities.map(renderEntity),
      emptyMessage: status !== "loading" && !customEntities.length ? "No custom entities." : undefined,
    },
    {
      id: "entity-builtin-list",
      title: "Builtin",
      count: builtInEntities.length,
      content: builtInEntities.map(renderEntity),
      emptyMessage: status !== "loading" && !builtInEntities.length ? "No built-in entities." : undefined,
    },
  ];

  useEffect(() => {
    const list = listRef.current;
    const sidebar = list?.closest<HTMLElement>(".entity-list");
    const search = sidebar?.querySelector<HTMLElement>(".metadata-search");
    if (!list || !sidebar || !search) return;

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
      setListPosition((current) =>
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
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const scrollSelectedIntoView = () => {
      const selectedItem = list.querySelector<HTMLElement>(".metadata-entity.active");
      if (!selectedItem) return;

      const listRect = list.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      const visibleTop = listRect.top + list.clientTop;
      const visibleBottom = visibleTop + list.clientHeight;
      if (itemRect.top < visibleTop) {
        list.scrollTop -= visibleTop - itemRect.top;
      } else if (itemRect.bottom > visibleBottom) {
        list.scrollTop += itemRect.bottom - visibleBottom;
      }
    };

    scrollSelectedIntoView();
    const observer = new ResizeObserver(scrollSelectedIntoView);
    observer.observe(list);
    return () => observer.disconnect();
  }, [filter, selectedName]);
  const scrollStyle: CSSProperties | undefined = listPosition
    ? {
      position: "fixed",
      top: listPosition.top,
      bottom: listPosition.bottom,
      left: listPosition.left,
      width: listPosition.width,
      boxSizing: "border-box",
      zIndex: 4,
      padding: "0 12px",
      borderRight: "1px solid var(--line)",
      backgroundColor: "#0e1117",
    }
    : undefined;

  return (
    <MetadataSidebar
      className="metadata-list entity-list split-panel"
      title="ENTITIES"
      totalCount={entities.length}
      filter={filter}
      searchPlaceholder="Find an entity"
      loadingMessage={status === "loading" ? "Loading metadata…" : undefined}
      groups={groups}
      onFilterChange={onFilterChange}
      scrollable
      listRef={listRef}
      scrollStyle={scrollStyle}
    />
  );
}
