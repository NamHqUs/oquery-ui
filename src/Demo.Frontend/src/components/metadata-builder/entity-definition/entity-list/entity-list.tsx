import { useEffect, useRef } from "react";
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
  const visibleEntities = entities.filter((entity) =>
    entity.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const renderEntity = (entity: MetadataEntity) => (
    <button
      className={`metadata-entity${entity.name === selectedName ? " active" : ""}`}
      key={entity.name}
      onClick={() => onSelectEntity(entity)}
    >
      <span className="entity-icon"><Icon name="table" size={14} /></span>
      <span>
        <b>{entity.name}</b>
      </span>
      <Icon name="chevron" size={14} />
    </button>
  );
  const groups: MetadataSidebarGroup[] = [
    {
      id: "entity-list",
      title: "Entities",
      count: visibleEntities.length,
      content: visibleEntities.map(renderEntity),
      emptyMessage: status !== "loading" && !visibleEntities.length ? "No entities." : undefined,
      showHeader: false,
    },
  ];

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
    />
  );
}
