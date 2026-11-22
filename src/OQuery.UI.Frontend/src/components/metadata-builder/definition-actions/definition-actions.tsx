import { useEffect } from "react";
import { useMessageBox } from "../../message-box/message-box";
import Icon from "../../icon/icon";

export interface DefinitionActionAdapter {
  resourceName: string;
  selectedName: string;
  hasSelection: boolean;
  getSelectedName?: () => string;
  isBuiltIn: boolean;
  hasDraft: boolean;
  dirty: boolean;
  showSaveWhenClean?: boolean;
  deleteWithoutConfirmation?: boolean;
  saving: boolean;
  onSave?: () => Promise<boolean>;
  onDiscard?: () => void;
  onReload?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onNew?: () => void;
  showLabels?: boolean;
  deleteMessage?: string;
}

type DefinitionChangeAdapter = Pick<
  DefinitionActionAdapter,
  "resourceName" | "selectedName" | "dirty" | "saving" | "onSave" | "onDiscard"
>;

export function useDefinitionUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);
}

function showDefinitionChangesPrompt(
  resourceName: string,
  showMessageBox: ReturnType<typeof useMessageBox>,
): Promise<string> {
  return showMessageBox({
    eyebrow: `UNSAVED ${resourceName.toUpperCase()}`,
    title: `Save your ${resourceName} changes?`,
    message: "Save your changes before continuing, discard them, or stay here to keep editing.",
    actions: [
      { value: "stay", label: "Stay here", variant: "secondary" },
      { value: "discard", label: "Discard changes", variant: "secondary" },
      { value: "save", label: "Save changes", variant: "primary" },
    ],
  });
}

export async function resolveDefinitionChanges(
  adapter: DefinitionChangeAdapter,
  showMessageBox: ReturnType<typeof useMessageBox>,
): Promise<boolean> {
  if (!adapter.dirty) return true;

  const action = await showDefinitionChangesPrompt(adapter.resourceName, showMessageBox);

  if (action === "save") return adapter.onSave ? adapter.onSave() : false;
  if (action === "discard") {
    adapter.onDiscard?.();
    return true;
  }
  return false;
}

async function confirmDefinitionDelete(
  adapter: DefinitionActionAdapter,
  showMessageBox: ReturnType<typeof useMessageBox>,
): Promise<boolean> {
  const selectedName = adapter.getSelectedName?.() || adapter.selectedName;
  const verb = adapter.resourceName === "entity" ? "Remove" : "Delete";
  const action = await showMessageBox({
    eyebrow: `${verb.toUpperCase()} ${adapter.resourceName.toUpperCase()}`,
    title: `${verb} ${selectedName}?`,
    message: adapter.deleteMessage || `This ${adapter.resourceName} definition will be permanently removed.`,
    actions: [
      { value: "cancel", label: "Cancel", variant: "secondary" },
      { value: "delete", label: verb, variant: "danger" },
    ],
  });
  return action === "delete";
}

export default function DefinitionActions({ adapter }: { adapter: DefinitionActionAdapter }) {
  const showMessageBox = useMessageBox();
  const showDelete = !adapter.isBuiltIn && adapter.hasSelection;
  const showSave = !adapter.isBuiltIn
    && adapter.hasDraft
    && (adapter.dirty || adapter.showSaveWhenClean);
  const resourceContext = adapter.resourceName === "entity" ? " from current domain" : "";
  const createLabel = `Create ${adapter.resourceName}${adapter.resourceName === "entity" ? " in current domain" : ""}`;
  const deleteLabel = `${adapter.resourceName === "entity" ? "Remove" : "Delete"} ${adapter.resourceName}${resourceContext}`;
  const labelClass = adapter.showLabels ? " labeled" : "";
  const createVisibleLabel = adapter.resourceName === "entity" ? "New entity" : "";
  const deleteVisibleLabel = adapter.resourceName === "entity" ? "Remove entity" : "";

  const handleNew = async () => {
    if (!adapter.onNew || !(await resolveDefinitionChanges(adapter, showMessageBox))) return;
    adapter.onNew();
  };

  const handleDelete = async () => {
    if (!adapter.onDelete || !adapter.hasSelection || adapter.isBuiltIn) return;
    if (adapter.deleteWithoutConfirmation) {
      await adapter.onDelete();
      return;
    }
    if (!(await resolveDefinitionChanges(adapter, showMessageBox))) return;
    if (await confirmDefinitionDelete(adapter, showMessageBox)) await adapter.onDelete();
  };

  return (
    <div className="editor-actions">
      {!adapter.isBuiltIn && showDelete && (
        <button
          className={`icon-button definition-action-button danger${labelClass}`}
          type="button"
          title={deleteLabel}
          aria-label={deleteLabel}
          onClick={() => void handleDelete()}
          disabled={!adapter.onDelete || adapter.saving}
        >
          <Icon name="trash" size={17} />
          {adapter.showLabels && <span>{deleteVisibleLabel}</span>}
        </button>
      )}

      {adapter.onReload && (
        <button
          className="icon-button definition-action-button"
          type="button"
          title="Reload metadata and discard current edits"
          aria-label="Reload metadata and discard current edits"
          onClick={() => void adapter.onReload?.()}
          disabled={adapter.saving}
        >
          <Icon name="reset" size={17} />
        </button>
      )}
      {adapter.onNew && <button
        className={`icon-button definition-action-button create${labelClass}`}
        type="button"
        title={createLabel}
        aria-label={createLabel}
        onClick={() => void handleNew()}
        disabled={!adapter.onNew || adapter.saving}
      >
        <Icon name="file-plus" size={17} />
        {adapter.showLabels && <span>{createVisibleLabel}</span>}
      </button>}
    </div>
  );
}
