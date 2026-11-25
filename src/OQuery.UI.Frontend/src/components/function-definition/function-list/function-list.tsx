import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "../../shared/icon/icon";
import { useKeepSelectedInView } from "../../../utils/use-keep-selected-in-view";
import { FunctionDefinition } from "../types";
import "./function-list.css";

type FunctionGroup = {
  id: "builtin"| "custom";
  title: string;
  count: number;
  content: ReactNode[];
  emptyMessage?: string;
};

type FunctionListProps = {
  definitions: FunctionDefinition[];
  selectedName: string;
  status: string;
  onSelect: (definition: FunctionDefinition) => void;
};

const isBuiltInDefinition = (definition: FunctionDefinition) =>
  definition.isBuiltin === true || definition.canDelete === false;

export default function FunctionList({
  definitions,
  selectedName,
  status,
  onSelect,
}: FunctionListProps) {
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<FunctionGroup["id"]>("builtin");
  const listRef = useRef<HTMLDivElement>(null);
  // A newly saved custom function is selected by the workspace; show the tab that contains it.
  useEffect(() => {
    const selected = definitions.find((definition) => definition.name === selectedName);
    if (selected) setActiveTab(isBuiltInDefinition(selected) ? "builtin" : "custom");
  }, [definitions, selectedName]);
  useKeepSelectedInView(listRef, ".metadata-entity.active", [activeTab, filter, definitions, selectedName]);
  const visibleDefinitions = definitions.filter((definition) =>
    definition.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const customDefinitions = visibleDefinitions.filter((definition) => !isBuiltInDefinition(definition));
  const builtInDefinitions = visibleDefinitions.filter(isBuiltInDefinition);
  const renderDefinition = (definition: FunctionDefinition) => (
    <button
      className={`metadata-entity${definition.name === selectedName ? " active" : ""}`}
      key={definition.name}
      type="button"
      onClick={() => onSelect(definition)}
    >
      <span className="entity-icon"><Icon name="function" size={14} /></span>
      <span>
        <b>{definition.name}</b>
        <small>
          {definition.arguments.length} arguments · {definition.resultType}
          {definition.isAggregate ? " · aggregate" : ""}
        </small>
      </span>
      <Icon name="chevron" size={14} />
    </button>
  );
  const groups: FunctionGroup[] = [
    {
      id: "builtin",
      title: "Builtin",
      count: builtInDefinitions.length,
      content: builtInDefinitions.map(renderDefinition),
      emptyMessage: status !== "loading" && !builtInDefinitions.length ? "No built-in functions." : undefined,
    },
    {
      id: "custom",
      title: "Custom",
      count: customDefinitions.length,
      content: customDefinitions.map(renderDefinition),
      emptyMessage: status !== "loading" && !customDefinitions.length ? "No custom functions." : undefined,
    },
  ];
  const activeGroup = groups.find((group) => group.id === activeTab) ?? groups[0];

  return (
    <aside className="function-list split-panel">
      <div className="function-list-head">
        <div className="function-list-tabs" role="tablist" aria-label="Function types">
          {groups.map((group) => (
            <button
              key={group.id}
              id={`function-tab-${group.id}`}
              className={`function-list-tab${group.id === activeGroup.id ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={group.id === activeGroup.id}
              aria-controls="function-list-panel"
              onClick={() => setActiveTab(group.id)}
            >
              {group.title} <small>{group.count}</small>
            </button>
          ))}
        </div>
        <input
          className="function-list-search"
          type="search"
          placeholder="Find a function"
          aria-label="Find a function"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className="function-list-scroll" id="function-list-panel" ref={listRef} role="tabpanel" aria-labelledby={`function-tab-${activeGroup.id}`}>
        {status === "loading" && <p className="metadata-message">Loading function definitions…</p>}
        {activeGroup.content.length ? activeGroup.content : <p className="metadata-message">{activeGroup.emptyMessage}</p>}
      </div>
    </aside>
  );
}
