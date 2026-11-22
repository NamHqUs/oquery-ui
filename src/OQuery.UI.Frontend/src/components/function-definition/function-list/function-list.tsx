import { useState, type ReactNode } from "react";
import Icon from "../../shared/icon/icon";
import { FunctionDefinition } from "../types";
import "./function-list.css";

type FunctionGroup = {
  id: string;
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
  const groups: FunctionGroup[] = [
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
    <aside className="function-list split-panel">
      <header className="function-list-header">
        <h3>FUNCTIONS</h3>
        <small>{definitions.length}</small>
      </header>
      <input
        className="function-list-search"
        type="search"
        placeholder="Find a function"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {status === "loading" && <p className="metadata-message">Loading function definitions…</p>}
      {groups.map((group) => (
        <section key={group.id} className="function-list-group">
          <h4>{group.title} <small>{group.count}</small></h4>
          {group.content.length ? group.content : <p className="metadata-message">{group.emptyMessage}</p>}
        </section>
      ))}
    </aside>
  );
}
