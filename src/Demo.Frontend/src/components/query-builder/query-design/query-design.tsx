import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiQueryContextDefinition, FilterOperatorDefinition, hasApiQueryCondition, MetadataEntity, QueryDefinition } from "./query-builder-slice";
import { FunctionDefinition } from "../../function-definition/types";
import Icon from "../../icon/icon";
import ProjectionBuilder from "./projection-builder/projection-builder";
import SortBuilder from "./sort-builder/sort-builder";
import FilterBuilder from "./filter-builder/filter-builder";
import JoinsBuilder from "./joins-builder/joins-builder";
import "./query-design.css";

type EntityMenuProps = {
  entities: MetadataEntity[];
  value: string;
  disabled: boolean;
  onChange: (entity: MetadataEntity) => void;
};

function EntityMenu({ entities, value, disabled, onChange }: EntityMenuProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedEntity = entities.find((item) => item.name === value);
  const filteredEntities = entities.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const bounds = trigger.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const top = window.innerHeight - bounds.bottom < menuHeight + 4 && bounds.top >= menuHeight + 4
        ? bounds.top - menuHeight - 4
        : bounds.bottom + 4;
      const width = Math.max(bounds.width, 240);
      const left = Math.min(bounds.left, Math.max(8, window.innerWidth - width - 8));
      setMenuPosition({ top, left, width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, search, filteredEntities.length]);

  useLayoutEffect(() => {
    if (open && menuPosition) searchRef.current?.focus();
  }, [open, menuPosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node
        && !containerRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)
      ) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="entity-menu" ref={containerRef}>
      <button
        type="button"
        className={`entity-menu-trigger${selectedEntity ? "" : " empty"}`}
        ref={triggerRef}
        aria-label="Entity"
        aria-invalid={!value.trim()}
        aria-describedby={!value.trim() ? "query-entity-error" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => {
          setSearch("");
          setOpen((isOpen) => !isOpen);
        }}
      >
        <span>{selectedEntity?.name ?? (value || "Select an entity...")}</span>
      </button>
      {open && createPortal(
        <div
          className="entity-menu-popup"
          ref={menuRef}
          role="menu"
          aria-label="Entities"
          style={{
            position: "fixed",
            top: menuPosition?.top ?? 0,
            left: menuPosition?.left ?? 0,
            width: menuPosition?.width,
            visibility: menuPosition ? "visible" : "hidden",
          }}
        >
          <input
            ref={searchRef}
            className="entity-menu-search"
            type="search"
            aria-label="Search entities"
            placeholder="Search entities..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {filteredEntities.length
            ? filteredEntities.map((item) => (
              <button
                type="button"
                className={`entity-menu-option${item.name === value ? " selected" : ""}`}
                role="menuitemradio"
                aria-checked={item.name === value}
                key={item.name}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setSearch("");
                  triggerRef.current?.focus();
                }}
              >
                {item.name}
              </button>
            ))
            : <span className="entity-menu-empty" role="status">No entities found.</span>}
        </div>,
        document.body,
      )}
    </div>
  );
}

type QueryDesignProps = {
  metadata: MetadataEntity[];
  metadataStatus: string;
  metadataError: string;
  functionDefinitions: FunctionDefinition[];
  functionDefinitionsStatus: string;
  functionDefinitionsError: string;
  filterOperators: FilterOperatorDefinition[];
  filterOperatorsStatus: string;
  filterOperatorsError: string;
  definition: QueryDefinition;
  contextDefinitions: ApiQueryContextDefinition[];
  selectedContextIndex: number | null;
  onSelectContext: (index: number | null) => void;
  onCreateContext: (name: string) => boolean;
  onDeleteContext: (index: number) => void;
  onContextNameChange: (name: string) => void;
  entity?: MetadataEntity;
  requestName: string;
  requestNameError: string;
  onRequestNameChange: (name: string) => void;
  onDefinitionChange: (definition: QueryDefinition) => void;
  editorMode: "visual" | "yaml";
  yamlText: string;
  yamlStatus: "idle" | "loading" | "applying";
  yamlError: string;
  yamlValidationMessage: string;
  onYamlTextChange: (text: string) => void;
  onFormatYaml: () => void;
  onInsertYamlTemplate: () => void;
  onApplyYaml: () => void;
};

function orderContextEntries(contextDefinitions: ApiQueryContextDefinition[]) {
  const contextNames = new Set(contextDefinitions.map((context) => context.name));
  const dependencies = new Map<string, Set<string>>();

  for (const context of contextDefinitions) {
    const names = new Set<string>();
    const addQueryDependencies = (query: ApiQueryContextDefinition["query"]) => {
      if (query.entity !== context.name && contextNames.has(query.entity)) names.add(query.entity);
      query.contexts?.forEach((nestedContext) => {
        if (nestedContext.name !== context.name && contextNames.has(nestedContext.name)) names.add(nestedContext.name);
        addQueryDependencies(nestedContext.query);
      });
    };
    addQueryDependencies(context.query);
    dependencies.set(context.name, names);
  }

  const depthCache = new Map<string, number>();
  const getDepth = (name: string, resolving: Set<string>): number => {
    const cached = depthCache.get(name);
    if (cached !== undefined) return cached;
    if (resolving.has(name)) return 0;
    const nextResolving = new Set(resolving).add(name);
    const depth = Math.max(
      0,
      ...Array.from(dependencies.get(name) ?? [], (dependency) => getDepth(dependency, nextResolving) + 1),
    );
    depthCache.set(name, depth);
    return depth;
  };

  return contextDefinitions
    .map((context, index) => ({ context, index, depth: getDepth(context.name, new Set<string>()) }))
    .sort((left, right) => left.depth - right.depth || left.index - right.index);
}

function highlightYaml(text: string, functionDefinitions: FunctionDefinition[], errorFunctionName: string): string {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

  const builtinFunctions = new Set(
    functionDefinitions.filter((definition) => definition.isBuiltin).map((definition) => definition.name),
  );
  const customFunctions = new Set(
    functionDefinitions
      .filter((definition) => !definition.isBuiltin && !builtinFunctions.has(definition.name))
      .map((definition) => definition.name),
  );
  const functionNames = [...builtinFunctions, ...customFunctions]
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const highlightedFunctions = functionNames.length
    ? escaped.replace(new RegExp(`\\b(${functionNames.join("|")})(?=\\s*\\()`, "gi"), (match) => {
      const className = errorFunctionName && match.toLocaleLowerCase() === errorFunctionName.toLocaleLowerCase()
        ? "query-yaml-function query-yaml-error-function"
        : "query-yaml-function";
      return `<span class="${className}">${match}</span>`;
    })
    : escaped;

  return highlightedFunctions.replace(
    /^(\s*)(Entity|Projection|Filter|Sorts|PageSize|Page|Contexts)(\s*:)/gim,
    "$1<span class=\"query-yaml-protected-key\">$2$3</span>",
  );
}

const yamlListSections = new Set(["Projection", "Sorts", "Contexts"]);

function getYamlLineContext(value: string, position: number) {
  const beforeCursor = value.slice(0, position);
  const lineStart = beforeCursor.lastIndexOf("\n") + 1;
  const currentLine = beforeCursor.slice(lineStart);
  const lines = value.slice(0, lineStart).split(/\r?\n/);
  const currentIndentation = currentLine.match(/^\s*/)?.[0] ?? "";
  const keyHeaders = lines.flatMap((line) => {
    const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(line);
    return match ? [{ indentation: match[1]!, name: match[2]! }] : [];
  });
  const parentHeader = [...keyHeaders]
    .reverse()
    .find((header) => header.indentation.length < currentIndentation.length)
    ?? keyHeaders[keyHeaders.length - 1];

  return {
    beforeCursor,
    lineStart,
    currentLine,
    section: parentHeader?.name ?? "",
    sectionIndentation: parentHeader?.indentation ?? "",
  };
}

function getYamlEnterEdit(value: string, selectionStart: number, selectionEnd: number) {
  const { beforeCursor, lineStart, currentLine, section, sectionIndentation } = getYamlLineContext(value, selectionStart);
  const afterCursor = value.slice(selectionEnd);
  const isListSection = yamlListSections.has(section);
  const trimmedLine = currentLine.trim();
  const sectionHeader = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(trimmedLine);
  const isListSectionHeader = sectionHeader ? yamlListSections.has(sectionHeader[1]!) : false;
  const isTopLevelKey = !/^\s/.test(currentLine)
    && /^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(trimmedLine);
  const isEmptyListItem = /^-\s*$/.test(trimmedLine);

  if (isEmptyListItem) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    const parentIndentation = indentation.slice(0, Math.max(0, indentation.length - 2));
    const normalizedBeforeCursor = `${value.slice(0, lineStart)}${parentIndentation}`;
    return {
      value: `${normalizedBeforeCursor}${afterCursor}`,
      caret: normalizedBeforeCursor.length,
    };
  }

  if (!trimmedLine) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    if (!indentation) {
      const inserted = "\n";
      return {
        value: `${beforeCursor}${inserted}${afterCursor}`,
        caret: beforeCursor.length + inserted.length,
      };
    }
    const parentIndentation = indentation.slice(0, Math.max(0, indentation.length - 2));
    const normalizedBeforeCursor = `${value.slice(0, lineStart)}${parentIndentation}`;
    return {
      value: `${normalizedBeforeCursor}${afterCursor}`,
      caret: normalizedBeforeCursor.length,
    };
  }

  if ((!isListSection && !isListSectionHeader) || (isTopLevelKey && !isListSectionHeader)) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    return {
      value: `${beforeCursor}\n${indentation}${afterCursor}`,
      caret: beforeCursor.length + indentation.length + 1,
    };
  }

  if (isListSectionHeader) {
    const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
    const inserted = `\n${indentation}  - `;
    return {
      value: `${beforeCursor}${inserted}${afterCursor}`,
      caret: beforeCursor.length + inserted.length,
    };
  }

  const itemText = trimmedLine.replace(/^-+\s*/, "");
  const listIndentation = `${sectionIndentation}  `;
  const normalizedLine = `${listIndentation}- ${itemText}`;
  const normalizedBeforeCursor = `${value.slice(0, lineStart)}${normalizedLine}`;
  const inserted = `\n${listIndentation}- `;
  return {
    value: `${normalizedBeforeCursor}${inserted}${afterCursor}`,
    caret: normalizedBeforeCursor.length + inserted.length,
  };
}

function YamlEditor({
  value,
  disabled,
  onChange,
  onKeyDown,
  functionDefinitions,
  errorFunctionName,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  functionDefinitions: FunctionDefinition[];
  errorFunctionName: string;
}) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLPreElement>(null);

  return (
    <div className="query-yaml-code-editor">
      <pre ref={lineNumbersRef} className="query-yaml-line-numbers" aria-hidden="true">
        {value.split("\n").map((_, index) => `${index + 1}\n`).join("")}
      </pre>
      <pre
        ref={highlightRef}
        className="query-yaml-highlight"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlightYaml(value, functionDefinitions, errorFunctionName) || " " }}
      />
      <textarea
        className="query-yaml-textarea"
        aria-label="Query YAML"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
        }}
        spellCheck={false}
        disabled={disabled}
      />
    </div>
  );
}

export default function QueryDesign({
  metadata,
  metadataStatus,
  metadataError,
  functionDefinitions,
  functionDefinitionsStatus,
  functionDefinitionsError,
  filterOperators,
  filterOperatorsStatus,
  filterOperatorsError,
  definition,
  contextDefinitions,
  selectedContextIndex,
  onSelectContext,
  onCreateContext,
  onDeleteContext,
  onContextNameChange,
  entity,
  requestName,
  requestNameError,
  onRequestNameChange,
  onDefinitionChange,
  editorMode,
  yamlText,
  yamlStatus,
  yamlError,
  yamlValidationMessage,
  onYamlTextChange,
  onFormatYaml,
  onInsertYamlTemplate,
  onApplyYaml,
}: QueryDesignProps) {
  const [draggedProjectionField, setDraggedProjectionField] = useState<string | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [newContextName, setNewContextName] = useState("");
  const [contextNameError, setContextNameError] = useState("");
  const orderedContextEntries = orderContextEntries(contextDefinitions);
  const contextEntities = contextDefinitions.map((context) => {
    const fields = context.query.projection?.flatMap((projection) => {
      const alias = projection.alias?.trim();
      if (alias) return [alias];

      const projectionFields = "fields" in projection
        ? projection.fields
        : [projection.field];
      return projectionFields.length === 1 && projectionFields[0].kind === "field"
        ? [projectionFields[0].field.split(".").pop() ?? projectionFields[0].field]
        : [];
    }) ?? [];
    return {
      name: context.name,
      fields: [...new Set(fields)].map((name) => ({ name, dbColumn: name })),
    };
  });
  const metadataWithContexts = [
    ...metadata,
    ...contextEntities.filter((context) => !metadata.some((item) => item.name === context.name)),
  ];
  const entityOptions = [
    ...metadata,
    ...(selectedContextIndex === null
      ? contextEntities.filter((context) => !metadata.some((item) => item.name === context.name))
      : []),
  ];
  if (entity && !entityOptions.some((item) => item.name === entity.name)) entityOptions.push(entity);
  const sourceContext = definition.contexts?.find((context) =>
    context.name === definition.entity && !context.alias?.trim() && !hasApiQueryCondition(context.condition));
  const relationDefinition = sourceContext
    ? { ...definition, contexts: definition.contexts?.filter((context) => context !== sourceContext) }
    : definition;
  const relationContexts = sourceContext
    ? contextDefinitions.filter((context) => context.id !== sourceContext.id)
    : contextDefinitions;
  const onRelationDefinitionChange = (nextDefinition: QueryDefinition) => {
    onDefinitionChange(sourceContext
      ? { ...nextDefinition, contexts: [...(nextDefinition.contexts ?? []), sourceContext] }
      : nextDefinition);
  };
  const submitContext = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newContextName.trim();
    if (!name) {
      setContextNameError("Enter a name for the context.");
      return;
    }
    if (!onCreateContext(name)) {
      setContextNameError("A context with this name already exists.");
      return;
    }
    setContextDialogOpen(false);
    setNewContextName("");
    setContextNameError("");
  };
  const openContextDialog = () => {
    setContextDialogOpen(true);
    setContextNameError("");
  };

  return (
    <section className="query-builder-card">
      {contextDefinitions.length > 0 && <nav className="query-context-bar" aria-label="Query contexts">
        {orderedContextEntries.map(({ context, index }) => {
          const contextError = context.query.entity.trim() ? null : "Select an entity.";
          return <div className="query-context-tab-wrap" key={`${context.id ?? context.name}-${index}`}>
            <button
              type="button"
              className={`query-context-tab${selectedContextIndex === index ? " selected" : ""}`}
              aria-pressed={selectedContextIndex === index}
              aria-label={contextError ? `${context.name}: ${contextError}` : undefined}
              title={contextError ? `${context.name}: ${contextError}` : undefined}
              onClick={() => onSelectContext(index)}
            >
              <Icon name="table" size={14} /> {context.name}
              {contextError && <span className="query-context-error-indicator" aria-hidden="true">!</span>}
            </button>
            <button type="button" className="query-context-delete" aria-label={`Delete ${context.name} context`} title={`Delete ${context.name} context`} onClick={() => onDeleteContext(index)}>
              <Icon name="close" size={12} />
            </button>
          </div>;
        })}
        <button
          type="button"
          className={`query-context-tab${selectedContextIndex === null ? " selected" : ""}`}
          aria-pressed={selectedContextIndex === null}
          onClick={() => onSelectContext(null)}
        >
          <Icon name="query" size={14} /> Main Query
        </button>
      </nav>}
      <div className="query-name-row">
        <div className="query-name-field">
          <div className="query-name-label-row">
            <span className="section-kicker">{selectedContextIndex === null ? "QUERY NAME" : "CONTEXT NAME"}</span>
          </div>
          <input
            type="text"
            value={selectedContextIndex === null ? requestName : contextDefinitions[selectedContextIndex]?.name ?? ""}
            onChange={(event) => selectedContextIndex === null
              ? onRequestNameChange(event.target.value)
              : onContextNameChange(event.target.value)}
            placeholder={selectedContextIndex === null ? "e.g. recent-invoices" : "Context name"}
            aria-label={selectedContextIndex === null ? "Query name" : "Context name"}
            aria-invalid={selectedContextIndex === null && Boolean(requestNameError)}
            aria-describedby={selectedContextIndex === null && requestNameError ? "query-name-error" : undefined}
          />
          {selectedContextIndex === null && requestNameError && <p className="query-name-warning" id="query-name-error" role="alert">{requestNameError}</p>}
        </div>
      </div>
      {contextDialogOpen && <div className="context-name-backdrop">
        <form className="context-name-dialog" onSubmit={submitContext}>
          <span className="section-kicker">NEW CONTEXT</span>
          <h3>Create a context</h3>
          <p>Give this context a name. You can choose its entity and relations afterward.</p>
          <label htmlFor="new-context-name">Context name</label>
          <input
            id="new-context-name"
            autoFocus
            value={newContextName}
            onChange={(event) => {
              setNewContextName(event.target.value);
              setContextNameError("");
            }}
            placeholder="e.g. InvoiceDetails"
            aria-invalid={Boolean(contextNameError)}
            aria-describedby={contextNameError ? "new-context-name-error" : undefined}
          />
          {contextNameError && <p className="context-name-error" id="new-context-name-error" role="alert">{contextNameError}</p>}
          <div className="context-name-actions">
            <button type="button" className="button secondary" onClick={() => {
              setContextDialogOpen(false);
              setNewContextName("");
              setContextNameError("");
            }}>Cancel</button>
            <button type="submit" className="button primary">Create context</button>
          </div>
        </form>
      </div>}
      {editorMode === "yaml" ? (
        <div className="query-yaml-editor" role="tabpanel" aria-label="YAML query editor">
          <div className="query-yaml-editor-header">
            <div>
              <span className="section-kicker">QUERY YAML</span>
              <p>Use the template, edit values, and press Enter in list sections to auto-indent items. Format and check syntax when ready.</p>
              <div className="query-yaml-function-legend" aria-label="Function color legend">
                <span className="query-yaml-function">Function</span>
              </div>
            </div>
            <div className="query-yaml-editor-actions">
              <button type="button" className="button secondary" onClick={onInsertYamlTemplate} disabled={yamlStatus !== "idle"}>
                <Icon name="file-plus" size={14} /> Template
              </button>
              <button type="button" className="button secondary" onClick={onFormatYaml} disabled={yamlStatus !== "idle" || !yamlText.trim()}>
                <Icon name="code" size={14} /> Format
              </button>
              {selectedContextIndex === null && <button type="button" className="button secondary" onClick={openContextDialog}>
                <Icon name="plus" size={14} /> Add context
              </button>}
              <button
                type="button"
                className="button primary"
                onClick={onApplyYaml}
                disabled={yamlStatus !== "idle" || !yamlText.trim()}
              >
                {yamlStatus === "applying" ? "Checking…" : "Check YAML"}
              </button>
            </div>
          </div>
          <YamlEditor
            value={yamlText}
            onChange={onYamlTextChange}
            onKeyDown={(event) => {
              const textarea = event.currentTarget;
              if (event.key === "Enter") {
                event.preventDefault();
                const edit = getYamlEnterEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd);
                onYamlTextChange(edit.value);
                requestAnimationFrame(() => {
                  textarea.selectionStart = edit.caret;
                  textarea.selectionEnd = edit.caret;
                });
                return;
              }
              if (event.key !== "Tab") return;
              event.preventDefault();
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              onYamlTextChange(`${textarea.value.slice(0, start)}  ${textarea.value.slice(end)}`);
              requestAnimationFrame(() => {
                textarea.selectionStart = start + 2;
                textarea.selectionEnd = start + 2;
              });
            }}
            functionDefinitions={functionDefinitions}
            errorFunctionName={yamlError.match(/:\s+([A-Za-z_][A-Za-z0-9_]*) requires at least/i)?.[1] ?? ""}
            disabled={yamlStatus !== "idle"}
          />
          {yamlStatus === "loading" && <p className="query-message">Loading YAML…</p>}
          {yamlValidationMessage && <p className="query-yaml-valid" role="status">{yamlValidationMessage}</p>}
          {yamlError && <p className="query-message error" role="alert">{yamlError}</p>}
        </div>
      ) : <><div className="query-builder-toolbar">
        <div className="query-entity-field">
          <div className="query-entity-label-row">
            <span className="section-kicker">ENTITY</span>
            {selectedContextIndex === null && <button className="field-action field-action-icon query-create-context" type="button" aria-label="Create context" title="Create context" onClick={openContextDialog}>
              <Icon name="plus" size={14} />
            </button>}
          </div>
          <EntityMenu entities={entityOptions} value={definition.entity} disabled={!entityOptions.length} onChange={(selectedEntity) => {
            const contexts = (definition.contexts ?? []).filter((context) =>
              !(context.name === definition.entity && !context.alias?.trim() && !hasApiQueryCondition(context.condition))
              && !(context.name === selectedEntity.name
                && !context.alias?.trim()
                && !hasApiQueryCondition(context.condition)));
            const selectedContext = contextDefinitions.find((context) => context.name === selectedEntity.name);
            if (selectedContext && !contexts.some((context) =>
              selectedContext.id
                ? context.id === selectedContext.id
                : context.name === selectedContext.name)) {
              contexts.push({ ...selectedContext, alias: undefined, condition: null });
            }
            onDefinitionChange({
              entity: selectedEntity.name,
              columns: selectedEntity.fields.map((field) => ({ field: field.name, alias: null })),
              contexts: contexts.length ? contexts : undefined,
              contextCatalog: definition.contextCatalog,
              filters: { logicalOperation: 0, filters: [] },
              sorts: [],
              page: selectedContextIndex === null ? 1 : null,
              pageSize: selectedContextIndex === null ? 50 : null,
            });
          }} />
          {!definition.entity.trim() && <span className="query-entity-warning" id="query-entity-error" role="alert">Select an entity.</span>}
        </div>
        <div className="query-paging-controls">
          <label><span className="section-kicker">PAGE</span>
            <input className="small-input" type="number" min="1" step="1" value={definition.page ?? ""} disabled={(definition.page === null && definition.pageSize === null) || (definition.pageSize !== null && definition.pageSize < 1)} onChange={(event) => {
              const value = event.target.value;
              const page = value ? Number.parseInt(value, 10) : null;
              onDefinitionChange({ ...definition, page: page === null ? null : Math.max(1, page) });
            }} />
          </label>
          <label><span className="section-kicker">PAGE SIZE</span>
            <input className="small-input" type="number" step="1" max="1000" value={definition.pageSize ?? ""} onChange={(event) => onDefinitionChange({ ...definition, pageSize: event.target.value ? Number(event.target.value) : null })} />
          </label>
        </div>
      </div>
      {metadataStatus === "loading" && <p className="query-message">Loading metadata…</p>}
      {metadataStatus === "failed" && <p className="query-message error" role="alert">{metadataError}</p>}
      {(selectedContextIndex === null && contextDefinitions.length > 0)
        || (selectedContextIndex !== null && contextDefinitions.length > 1)
        ? <JoinsBuilder
          definition={relationDefinition}
          contexts={relationContexts}
          metadata={metadataWithContexts}
          operators={filterOperators}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          canAddJoin={relationContexts.length > 0}
          excludeContextId={selectedContextIndex === null ? undefined : contextDefinitions[selectedContextIndex]?.id}
          onDefinitionChange={onRelationDefinitionChange}
        />
        : null}
      {entity && <div className="query-builder-body">
        <ProjectionBuilder
          metadata={metadataWithContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          definition={definition}
          joinedContexts={definition.contexts ?? []}
          entity={entity}
          onDefinitionChange={onDefinitionChange}
          onFieldDragStart={setDraggedProjectionField}
        />
        <FilterBuilder
          metadata={metadataWithContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          operators={filterOperators}
          operatorsStatus={filterOperatorsStatus}
          operatorsError={filterOperatorsError}
          definition={definition}
          joinedContexts={definition.contexts ?? []}
          entity={entity}
          onDefinitionChange={onDefinitionChange}
        />
        <SortBuilder
          metadata={metadataWithContexts}
          functionDefinitions={functionDefinitions}
          functionDefinitionsStatus={functionDefinitionsStatus}
          functionDefinitionsError={functionDefinitionsError}
          definition={definition}
          joinedContexts={definition.contexts ?? []}
          entity={entity}
          onDefinitionChange={onDefinitionChange}
          draggedProjectionField={draggedProjectionField}
        />
      </div>}</>}
    </section>
  );
}
