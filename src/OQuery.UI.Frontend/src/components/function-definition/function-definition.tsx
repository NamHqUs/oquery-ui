import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchFunctionDefinitions, invalidateFunctionDefinitions } from "./function-definition-slice";
import { fetchDatabaseConnections } from "../data-sources/database-slice";
import * as functionDefinitionService from "../../services/function-definition-service";
import type { AppDispatch, RootState } from "../../store/store";
import PanelSplitter from "../shared/panel-splitter/panel-splitter";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import { useMessageBox } from "../shared/message-box/message-box";
import { Heading } from "../main-layout/main-layout";
import type { HeaderAction } from "../shared/page-header/page-header-actions";
import FunctionDetail from "./function-detail/function-detail";
import FunctionList from "./function-list/function-list";
import {
  EditableFunctionDefinition,
  FunctionDefinition,
  FunctionDefinitionPayload,
  emptyFunction,
  toEditableFunction,
} from "./types";
import "./function-definition.css";

type FunctionDefinitionWorkspaceProps = {
  projectId: string;
  onNavigationGuardChange?: (guard: ((continueNavigation: () => void, cancelNavigation?: () => void) => void) | null) => void;
};

function parseArgumentDefault(argument: EditableFunctionDefinition["arguments"][number]): unknown {
  const value = argument.defaultValueText;
  if (!value.trim()) return null;
  if (value.trim() === "*") return "*";

  switch (argument.dataType) {
    case "String":
      return value;
    case "Number": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`Default value for ${argument.name || "argument"} must be a number.`);
      return parsed;
    }
    case "Datetime": {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Default value for ${argument.name || "argument"} must be a valid date and time.`);
      }
      return parsed.toISOString();
    }
    case "Boolean":
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
      throw new Error(`Default value for ${argument.name || "argument"} must be true or false.`);
  }
}

function toPayload(draft: EditableFunctionDefinition): FunctionDefinitionPayload {
  const sqlTemplates: Record<string, string> = {};
  for (const row of draft.sqlTemplateRows) {
    const template = row.rawSqlTemplate.trim();
    if (!template) continue;
    if (sqlTemplates[row.databaseType]) {
      throw new Error(`Only one SQL template can be defined for ${row.databaseType}.`);
    }
    sqlTemplates[row.databaseType] = template;
  }
  if (!Object.keys(sqlTemplates).length) throw new Error("At least one raw SQL template is required.");

  const args = draft.arguments.map((argument) => {
    return {
      name: argument.name.trim(),
      dataType: argument.dataType,
      defaultValue: parseArgumentDefault(argument),
    };
  });
  return {
    name: draft.name.trim(),
    arguments: args,
    resultType: draft.resultType,
    applyFor: draft.applyFor,
    description: draft.description.trim(),
    sqlTemplates: sqlTemplates as Record<string, string>,
  };
}

export default function FunctionDefinitionWorkspace({ projectId, onNavigationGuardChange }: FunctionDefinitionWorkspaceProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { definitions, projectId: functionDefinitionsProjectId, status: functionDefinitionsStatus } = useSelector((state: RootState) => state.functionDefinitions);
  const providers = useSelector((state: RootState) => state.database.providers);
  const showMessageBox = useMessageBox();
  const panel = useResizablePanel("metadata-functions");
  const [selectedName, setSelectedName] = useState("");
  const [draft, setDraft] = useState<EditableFunctionDefinition | null>(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const selectedDefinition = definitions.find((definition) => definition.name === selectedName);
  const selectedIsBuiltin = selectedDefinition?.isBuiltin === true
    || selectedDefinition?.canDelete === false;

  // Database types populate the SQL template dropdowns; the thunk skips the request once loaded.
  useEffect(() => {
    void dispatch(fetchDatabaseConnections());
  }, [dispatch]);

  const loadDefinitions = async (selectFirst = false, preferredName = selectedName) => {
    if (!projectId) {
      setStatus("failed");
      setMessage("Choose a project to manage its custom functions.");
      return false;
    }
    setStatus("loading");
    setMessage("");
    try {
      const result = await dispatch(fetchFunctionDefinitions(projectId));
      if (!fetchFunctionDefinitions.fulfilled.match(result)) {
        throw new Error(String(result.payload || "Unable to load function definitions."));
      }
      const payload = result.payload;
      const preferred = payload.find((definition) => definition.name === preferredName);
      const next = selectFirst ? payload[0] : preferred;
      setSelectedName(next?.name || "");
      setDraft(next ? toEditableFunction(next) : null);
      setDirty(false);
      setStatus("succeeded");
      return true;
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to load function definitions.");
      return false;
    }
  };

  useEffect(() => {
    if (!projectId) {
      setStatus("failed");
      setMessage("Choose a project to manage its custom functions.");
      return;
    }
    if (functionDefinitionsProjectId !== projectId) {
      void loadDefinitions(true);
      return;
    }
    if (functionDefinitionsStatus === "succeeded") {
      const next = definitions[0];
      setSelectedName(next?.name || "");
      setDraft(next ? toEditableFunction(next) : null);
      setDirty(false);
      setStatus("succeeded");
      return;
    }
    if (functionDefinitionsStatus === "idle" || functionDefinitionsStatus === "failed") {
      void loadDefinitions(true);
    }
  }, [projectId, definitions, functionDefinitionsProjectId, functionDefinitionsStatus]);

  const discardChanges = () => {
    const original = definitions.find((definition) => definition.name === selectedName);
    if (!selectedName) setDraft(emptyFunction(providers));
    else setDraft(original ? toEditableFunction(original) : null);
    setDirty(false);
    setMessage("");
  };

  const save = async (): Promise<boolean> => {
    if (selectedIsBuiltin) {
      setMessage("Built-in function definitions are read-only.");
      return false;
    }
    if (!draft?.name.trim() || !draft.description.trim()) {
      setMessage("Function name and description are required.");
      return false;
    }
    let payload: FunctionDefinitionPayload;
    try {
      payload = toPayload(draft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Function definition contains invalid values.");
      return false;
    }
    setStatus("saving");
    setMessage("");
    try {
      const savedDefinition = await functionDefinitionService.saveDefinition(projectId, selectedName || undefined, payload);
      dispatch(invalidateFunctionDefinitions());
      await loadDefinitions(false, savedDefinition.name);
      setSelectedName(savedDefinition.name);
      setDraft(toEditableFunction(savedDefinition));
      setDirty(false);
      setStatus("succeeded");
      setMessage("");
      return true;
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to save function definition.");
      return false;
    }
  };

  const resolveDirtyChanges = async () => {
    if (!dirty) return true;
    if (!window.confirm("Discard unsaved function changes?")) return false;
    discardChanges();
    return true;
  };

  useEffect(() => {
    const guard = (continueNavigation: () => void, cancelNavigation?: () => void) => {
      void (async () => {
        if (await resolveDirtyChanges()) continueNavigation();
        else cancelNavigation?.();
      })();
    };
    onNavigationGuardChange?.(guard);
    return () => onNavigationGuardChange?.(null);
  }, [onNavigationGuardChange, dirty, draft, definitions, selectedName]);

  const selectDefinition = async (definition: FunctionDefinition) => {
    if (definition.name === selectedName || !(await resolveDirtyChanges())) return;
    setSelectedName(definition.name);
    setDraft(toEditableFunction(definition));
    setDirty(false);
    setMessage("");
  };

  const createDefinition = async () => {
    if (!(await resolveDirtyChanges())) return;
    setSelectedName("");
    setDraft(emptyFunction(providers));
    setDirty(false);
    setMessage("");
  };

  const removeDefinition = async () => {
    if (!selectedName || selectedIsBuiltin) return;
    const choice = await showMessageBox({
      eyebrow: "Delete function",
      title: `Delete "${selectedName}"?`,
      message: "This permanently deletes the custom function from the project.",
      actions: [
        { value: "cancel", label: "Cancel" },
        { value: "delete", label: "Delete", variant: "danger" },
      ],
    });
    if (choice !== "delete") return;
    setStatus("saving");
    setMessage("");
    try {
      await functionDefinitionService.deleteDefinition(projectId, selectedName);
      setSelectedName("");
      dispatch(invalidateFunctionDefinitions());
      await loadDefinitions(true);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to delete function definition.");
    }
  };

  const canEditSelectedDefinition = !selectedName ||
    Boolean(definitions.find((definition) => definition.name === selectedName)?.canDelete);

  const updateDraft = (update: (current: EditableFunctionDefinition) => EditableFunctionDefinition) => {
    if (!draft) return;
    setDraft(update(draft));
    setDirty(true);
  };

  const saving = status === "saving";
  const headerActions: HeaderAction[] = [
    { key: "save", label: "Save", icon: "save", onSelect: () => void save(), disabled: !dirty || !draft || !canEditSelectedDefinition || saving, title: "Save function", className: "domain-action-button primary" },
    { key: "reload", label: "Reload", icon: "reset", onSelect: discardChanges, disabled: !dirty || saving, title: "Discard unsaved changes", className: "domain-action-button" },
    { key: "new", label: "New function", icon: "plus", onSelect: () => void createDefinition(), disabled: saving, title: "Create a custom function", className: "domain-action-button create" },
  ];
  const editorActions: HeaderAction[] = [
    { key: "delete", label: "Delete", icon: "trash", onSelect: () => void removeDefinition(), disabled: !selectedName || selectedIsBuiltin || saving, title: selectedIsBuiltin ? "Built-in functions cannot be deleted" : "Delete this function", className: "domain-action-button danger", danger: true },
  ];

  return (
    <>
      <Heading
        icon="function"
        title="Custom functions"
        text="Reusable business logic for this project's queries"
        actionItems={headerActions}
        status={dirty ? <span className="page-header-status">Unsaved</span> : null}
      />
      <section
        className={`function-workspace split-workspace${panel.collapsed ? " panel-collapsed" : ""}`}
        style={panel.style}
      >
        <FunctionList
          definitions={definitions}
          selectedName={selectedName}
          status={status}
          onSelect={(definition) => void selectDefinition(definition)}
        />
        <PanelSplitter panel={panel} label="functions panel" />
        <FunctionDetail
          draft={draft}
          selectedName={selectedName}
          canEdit={canEditSelectedDefinition}
          message={message}
          actions={editorActions}
          onDraftChange={updateDraft}
        />
      </section>
    </>
  );
}
