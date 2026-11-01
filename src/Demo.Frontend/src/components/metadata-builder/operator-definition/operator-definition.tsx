import { useEffect, useState } from "react";
import { apiUrls } from "../../../const/api-urls";
import Icon from "../../icon/icon";
import PanelSplitter from "../../panel-splitter/panel-splitter";
import { useMessageBox } from "../../message-box/message-box";
import { useResizablePanel } from "../../../utils/use-resizable-panel";
import DefinitionActions, {
  resolveDefinitionChanges,
  useDefinitionUnsavedWarning,
} from "../definition-actions/definition-actions";
import type { DefinitionActionAdapter } from "../definition-actions/definition-actions";
import MetadataSidebar, { type MetadataSidebarGroup } from "../metadata-sidebar/metadata-sidebar";
import "./operator-definition.css";

type OperatorDefinitionData = {
  id: string;
  name: string;
  symbol: string;
  description: string;
  leftOperandType: string;
  rightOperandType: string;
  supportedDataTypes: string[];
  sqlTemplates: Record<string, string>;
  isBuiltin: boolean;
  canDelete: boolean;
};

type OperatorDraft = Omit<OperatorDefinitionData, "id"> & { id: string | null };

const operandTypes = ["String", "Number", "Datetime", "Boolean"];
const providers = ["Sqlite", "SqlServer", "Postgres", "Cockroach", "Firebird", "Maria", "Oracle", "SapHana", "Db2"] as const;
const operatorTemplate = "{left} = {value}";
type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;
type OperatorDefinitionProps = {
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};

function emptyOperator(): OperatorDraft {
  return {
    id: null,
    name: "",
    symbol: "",
    description: "",
    leftOperandType: "String",
    rightOperandType: "String",
    supportedDataTypes: ["String"],
    sqlTemplates: Object.fromEntries(providers.map((provider) => [provider, operatorTemplate])),
    isBuiltin: false,
    canDelete: true,
  };
}

async function request<T = unknown>(url: string, options?: RequestInit): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Could not reach the metadata API: ${error instanceof Error ? error.message : "network error"}`);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Operator definition request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json() as Promise<T>;
}

export default function OperatorDefinition({ onNavigationGuardChange }: OperatorDefinitionProps) {
  const showMessageBox = useMessageBox();
  const panel = useResizablePanel("metadata-operators");
  const [definitions, setDefinitions] = useState<OperatorDefinitionData[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<OperatorDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const selectedDefinition = definitions.find((definition) => definition.id === selectedId);
  const selectedName = selectedDefinition?.name || "";

  useDefinitionUnsavedWarning(dirty);

  const loadDefinitions = async (selectFirst = false, preferredId = selectedId) => {
    setStatus("loading");
    setMessage("");
    try {
      const payload = await request<OperatorDefinitionData[]>(apiUrls.metadata.operators);
      const definitions = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { value?: unknown }).value)
          ? (payload as { value: OperatorDefinitionData[] }).value
          : null;
      if (!definitions) throw new Error("Operator definition API must return an array.");
      setDefinitions(definitions);
      const preferred = definitions.find((definition) => definition.id === preferredId);
      const next = selectFirst ? definitions[0] : preferred;
      setSelectedId(next?.id ?? "");
      setDraft(next ? { ...next, sqlTemplates: { ...next.sqlTemplates } } : null);
      setDirty(false);
      setStatus("succeeded");
      return true;
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to load operator definitions.");
      return false;
    }
  };

  useEffect(() => { void loadDefinitions(true); }, []);

  const discardChanges = () => {
    setDraft(selectedDefinition
      ? { ...selectedDefinition, sqlTemplates: { ...selectedDefinition.sqlTemplates } }
      : null);
    setDirty(false);
    setMessage("");
  };

  const save = async (): Promise<boolean> => {
    if (selectedDefinition?.isBuiltin) {
      setMessage("Built-in operator definitions are read-only.");
      return false;
    }
    if (!draft?.name.trim() || !draft.symbol.trim()) {
      setMessage("Operator name and symbol are required.");
      return false;
    }
    const name = draft.name.trim();
    if (definitions.some((definition) =>
      definition.id !== draft.id && (
        definition.name.toLowerCase() === name.toLowerCase()
        || definition.symbol.toLowerCase() === draft.symbol.trim().toLowerCase()
      ),
    )) {
      setMessage("An operator with this name or symbol already exists.");
      return false;
    }

    for (const provider of providers) {
      const template = draft.sqlTemplates[provider] ?? "";
      if ((template.match(/\{left\}/g) ?? []).length !== 1
        || (template.match(/\{value\}/g) ?? []).length !== 1
        || /[{}]/.test(template.replaceAll("{left}", "").replaceAll("{value}", ""))) {
        setMessage(`${provider} template must contain exactly one {left} and one {value} placeholder.`);
        return false;
      }
    }

    setSaving(true);
    setStatus("saving");
    try {
      const { id: draftId, ...draftWithoutId } = draft;
      const payload = {
        ...(draftId ? draft : draftWithoutId),
        name,
        symbol: draft.symbol.trim(),
        description: draft.description.trim(),
        sqlTemplates: Object.fromEntries(providers.map((provider) => [
          provider,
          draft.sqlTemplates[provider].trim(),
        ])),
      };
      const saved = await request<OperatorDefinitionData>(
        draft.id ? apiUrls.metadata.operatorById(draft.id) : apiUrls.metadata.operators,
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!saved) throw new Error("Operator definition API did not return the saved definition.");
      setDefinitions((current) => {
        const updated = current.filter((definition) => definition.id !== draft.id && definition.id !== saved.id);
        updated.push(saved);
        return updated.sort((left, right) =>
          Number(right.isBuiltin) - Number(left.isBuiltin)
          || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
        );
      });
      setSelectedId(saved.id);
      setDraft(saved);
      setDirty(false);
      setMessage("");
      setStatus("succeeded");
      return true;
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to save operator definition.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const create = () => {
    setSelectedId("");
    setDraft(emptyOperator());
    setDirty(true);
    setMessage("");
  };

  const remove = async () => {
    if (!selectedId || selectedDefinition?.isBuiltin) return;
    setSaving(true);
    setStatus("saving");
    try {
      await request(apiUrls.metadata.operatorById(selectedId), { method: "DELETE" });
      setSelectedId("");
      setDraft(null);
      setDirty(false);
      await loadDefinitions(true);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to delete operator definition.");
    } finally {
      setSaving(false);
    }
  };

  const actionAdapter: DefinitionActionAdapter = {
    resourceName: "operator",
    selectedName,
    hasSelection: Boolean(selectedId),
    isBuiltIn: selectedDefinition?.isBuiltin === true,
    hasDraft: Boolean(draft),
    dirty,
    saving,
    onSave: save,
    onDiscard: discardChanges,
    onDelete: remove,
    onNew: create,
  };

  const resolveDirtyChanges = async () => resolveDefinitionChanges(actionAdapter, showMessageBox);

  useEffect(() => {
    const guard: NavigationGuard = (continueNavigation, cancelNavigation) => {
      void (async () => {
        if (await resolveDirtyChanges()) continueNavigation();
        else cancelNavigation?.();
      })();
    };
    onNavigationGuardChange?.(guard);
    return () => onNavigationGuardChange?.(null);
  }, [onNavigationGuardChange, dirty, draft, definitions, selectedId]);

  const selectOperator = async (definition: OperatorDefinitionData) => {
    if (definition.id === selectedId || !(await resolveDirtyChanges())) return;
    setSelectedId(definition.id);
    setDraft({ ...definition, sqlTemplates: { ...definition.sqlTemplates } });
    setDirty(false);
    setMessage("");
  };

  const updateDraft = (update: (current: OperatorDraft) => OperatorDraft) => {
    if (!draft) return;
    setDraft(update(draft));
    setDirty(true);
  };

  const visibleDefinitions = definitions.filter((definition) =>
    `${definition.name} ${definition.symbol} ${definition.supportedDataTypes.join(" ")}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const renderDefinition = (definition: OperatorDefinitionData) => (
    <button
      className={`metadata-entity${definition.id === selectedId ? " active" : ""}`}
      key={definition.id}
      type="button"
      onClick={() => void selectOperator(definition)}
    >
      <span className="entity-icon"><Icon name="operator" size={14} /></span>
      <span>
        <b>{definition.name}</b>
        <small>{definition.symbol} · {definition.supportedDataTypes.join(", ")}</small>
      </span>
      <Icon name="chevron" size={14} />
    </button>
  );
  const groups: MetadataSidebarGroup[] = [
    {
      id: "operator-custom-list",
      title: "Custom",
      content: visibleDefinitions.filter((definition) => !definition.isBuiltin).map(renderDefinition),
      count: visibleDefinitions.filter((definition) => !definition.isBuiltin).length,
      emptyMessage: definitions.some((definition) => !definition.isBuiltin)
        ? "No matching custom operators."
        : "No custom operators yet.",
    },
    {
      id: "operator-builtin-list",
      title: "Builtin",
      count: visibleDefinitions.filter((definition) => definition.isBuiltin).length,
      content: visibleDefinitions.filter((definition) => definition.isBuiltin).map(renderDefinition),
      emptyMessage: "No matching built-in operators.",
    },
  ];

  return (
    <section
      className={`operator-workspace split-workspace${panel.collapsed ? " panel-collapsed" : ""}`}
      style={panel.style}
    >
      <MetadataSidebar
        className="operator-list split-panel"
        title="OPERATORS"
        totalCount={definitions.length}
        filter={filter}
        searchPlaceholder="Find an operator"
        groups={groups}
        onFilterChange={setFilter}
      />
      <PanelSplitter panel={panel} label="operators panel" />
      <main className="operator-editor">
        <div className="editor-head">
          <div>
            <span className="section-kicker">{selectedName || (draft ? "New Operator…" : "Select an operator")}</span>
          </div>
          <DefinitionActions adapter={actionAdapter} />
        </div>
        {status === "loading" && <p className="operator-notice">Loading operator definitions…</p>}
        {message && <p className="metadata-alert" role="alert">{message}</p>}
        <p className="operator-notice">Use {"{left}"} for the selected field and {"{value}"} for the single filter value. Values are passed as query parameters.</p>
        {!draft
          ? <div className="metadata-empty">
              <Icon name="operator" size={32} />
              <p>{message || "Select an operator or create a new custom definition."}</p>
            </div>
          : <>
              <fieldset className="operator-form" disabled={saving || selectedDefinition?.isBuiltin}>
                <div className="metadata-form-grid">
                  <label>
                    Name
                    <input
                      readOnly={Boolean(selectedId)}
                      value={draft.name}
                      onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. Contains"
                    />
                  </label>
                  <label>
                    Operator symbol
                    <input
                      value={draft.symbol}
                      onChange={(event) => updateDraft((current) => ({ ...current, symbol: event.target.value }))}
                      placeholder="e.g. CONTAINS"
                    />
                  </label>
                  <label className="operator-description">
                    Description
                    <input
                      value={draft.description}
                      onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Describe what this operator compares"
                    />
                  </label>
                  <label>
                    Left operand type
                    <select
                      value={draft.leftOperandType}
                      onChange={(event) => updateDraft((current) => ({ ...current, leftOperandType: event.target.value }))}
                    >
                      {operandTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    Right operand type
                    <select
                      value={draft.rightOperandType}
                      onChange={(event) => updateDraft((current) => ({ ...current, rightOperandType: event.target.value }))}
                    >
                      {operandTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                </div>
                <section className="editor-section">
                  <div className="editor-section-head">
                    <div>
                      <h3>Provider templates</h3>
                      <p>Map the operator to SQL for each supported database provider.</p>
                    </div>
                  </div>
                  <div className="operator-template-list">
                    {providers.map((provider) => (
                      <label key={provider}>
                        {provider}
                        <textarea
                          rows={2}
                          value={draft.sqlTemplates[provider] ?? ""}
                          onChange={(event) => updateDraft((current) => ({
                            ...current,
                            sqlTemplates: { ...current.sqlTemplates, [provider]: event.target.value },
                          }))}
                          placeholder="{left} = {value}"
                        />
                      </label>
                    ))}
                  </div>
                </section>
              </fieldset>
            </>}
      </main>
    </section>
  );
}
