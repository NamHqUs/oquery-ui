import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchFunctionDefinitions, invalidateFunctionDefinitions } from "../query-builder/query-design/query-builder-slice";
import * as functionDefinitionService from "../../services/function-definition-service";
import type { RootState } from "../../store/store";
import PanelSplitter from "../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import { useMessageBox } from "../message-box/message-box";
import FunctionDetail from "./function-detail/function-detail";
import FunctionList from "./function-list/function-list";
import DefinitionActions from "../metadata-builder/definition-actions/definition-actions";
import {
  resolveDefinitionChanges,
  useDefinitionUnsavedWarning,
} from "../metadata-builder/definition-actions/definition-actions";
import type { DefinitionActionAdapter } from "../metadata-builder/definition-actions/definition-actions";
import {
  EditableFunctionDefinition,
  FunctionDefinition,
  emptyFunction,
  toEditableFunction,
} from "./types";
import "./function-definition.css";

type FunctionDefinitionWorkspaceProps = {
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

function toPayload(draft: EditableFunctionDefinition): FunctionDefinition {
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
    isAggregate: draft.isAggregate,
    description: draft.description.trim(),
    sqlTemplates: sqlTemplates as Record<string, string>,
  };
}

export default function FunctionDefinitionWorkspace({ onNavigationGuardChange }: FunctionDefinitionWorkspaceProps) {
  const dispatch = useDispatch();
  const definitions = useSelector((state: RootState) => state.queryBuilder.functionDefinitions);
  const functionDefinitionsStatus = useSelector((state: RootState) => state.queryBuilder.functionDefinitionsStatus);
  const providers = useSelector((state: RootState) => state.database.providers);
  const showMessageBox = useMessageBox();
  const panel = useResizablePanel("metadata-functions");
  const [selectedName, setSelectedName] = useState("");
  const [draft, setDraft] = useState<EditableFunctionDefinition | null>(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const selectedDefinition = definitions.find((definition) => definition.name === selectedName);
  const selectedIsBuiltin = selectedDefinition?.isBuiltin === true
    || selectedDefinition?.canDelete === false;

  useDefinitionUnsavedWarning(dirty);
  useEffect(() => setToolbarHost(document.getElementById("metadata-toolbar-actions")), []);

  const loadDefinitions = async (selectFirst = false, preferredName = selectedName) => {
    setStatus("loading");
    setMessage("");
    try {
      const result = await dispatch(fetchFunctionDefinitions());
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
  }, [definitions, functionDefinitionsStatus]);

  const discardChanges = () => {
    const original = definitions.find((definition) => definition.name === selectedName);
    setDraft(original ? toEditableFunction(original) : null);
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
    let payload: FunctionDefinition;
    try {
      payload = toPayload(draft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Function definition contains invalid values.");
      return false;
    }
    setStatus("saving");
    setMessage("");
    try {
      const savedDefinition = await functionDefinitionService.saveDefinition(selectedName || undefined, payload);
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
    return resolveDefinitionChanges({
      resourceName: "function",
      selectedName,
      dirty,
      saving: status === "saving",
      onSave: save,
      onDiscard: discardChanges,
    }, showMessageBox);
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
    setSelectedName("");
    setDraft(emptyFunction(providers));
    setDirty(false);
    setMessage("");
  };

  const removeDefinition = async () => {
    if (!selectedName || selectedIsBuiltin) return;
    setStatus("saving");
    setMessage("");
    try {
      await functionDefinitionService.deleteDefinition(selectedName);
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

  const actionAdapter: DefinitionActionAdapter = {
    resourceName: "function",
    selectedName,
    hasSelection: Boolean(selectedName),
    isBuiltIn: selectedIsBuiltin,
    hasDraft: Boolean(draft),
    dirty,
    saving: status === "saving",
    onSave: save,
    onDiscard: discardChanges,
    onDelete: removeDefinition,
    onNew: () => void createDefinition(),
  };

  return (
    <>
      {toolbarHost && createPortal(<DefinitionActions adapter={actionAdapter} />, toolbarHost)}
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
          onDraftChange={updateDraft}
        />
      </section>
    </>
  );
}
