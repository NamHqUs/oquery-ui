import { useState } from "react";
import Icon from "../../icon/icon";
import { FunctionDefinition } from "../types";
import MetadataSidebar, { type MetadataSidebarGroup } from "../../metadata-builder/metadata-sidebar/metadata-sidebar";
import "./function-list.css";

type FunctionListProps = {
  definitions: FunctionDefinition[];
  selectedName: string;
  status: string;
  onSelect: (definition: FunctionDefinition) => void;
};

export default function FunctionList({
  definitions,
  selectedName,
  status,
  onSelect,
}: FunctionListProps) {
  const [filter, setFilter] = useState("");
  const visibleDefinitions = definitions.filter((definition) =>
    definition.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const customDefinitions = visibleDefinitions.filter((definition) =>
    definition.isBuiltin !== true && definition.canDelete !== false,
  );
  const builtInDefinitions = visibleDefinitions.filter((definition) =>
    definition.isBuiltin === true || definition.canDelete === false,
  );
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
  const groups: MetadataSidebarGroup[] = [
    {
      id: "function-custom-list",
      title: "Custom",
      count: customDefinitions.length,
      content: customDefinitions.map(renderDefinition),
      emptyMessage: status !== "loading" && !customDefinitions.length ? "No custom functions." : undefined,
    },
    {
      id: "function-builtin-list",
      title: "Builtin",
      count: builtInDefinitions.length,
      content: builtInDefinitions.map(renderDefinition),
      emptyMessage: status !== "loading" && !builtInDefinitions.length ? "No built-in functions." : undefined,
    },
  ];

  return (
    <MetadataSidebar
      className="function-list split-panel"
      title="FUNCTIONS"
      totalCount={definitions.length}
      filter={filter}
      searchPlaceholder="Find a function"
      loadingMessage={status === "loading" ? "Loading function definitions…" : undefined}
      groups={groups}
      onFilterChange={setFilter}
      scrollable
    />
  );
}
