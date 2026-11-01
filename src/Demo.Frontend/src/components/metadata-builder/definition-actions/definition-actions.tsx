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
  saving: boolean;
  onSave?: () => Promise<boolean>;
  onDiscard?: () => void;
  onDelete?: () => Promise<void>;
  onNew?: () => void;
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
  const action = await showMessageBox({
    eyebrow: `DELETE ${adapter.resourceName.toUpperCase()}`,
    title: `Delete ${selectedName}?`,
    message: `This ${adapter.resourceName} definition will be permanently removed.`,
    actions: [
      { value: "cancel", label: "Cancel", variant: "secondary" },
      { value: "delete", label: "Delete", variant: "danger" },
    ],
  });
  return action === "delete";
}

export default function DefinitionActions({ adapter }: { adapter: DefinitionActionAdapter }) {
  const showMessageBox = useMessageBox();
  const showDelete = !adapter.isBuiltIn && adapter.hasSelection;
  const showSave = !adapter.isBuiltIn && adapter.hasDraft;

  const handleNew = async () => {
    if (!adapter.onNew || !(await resolveDefinitionChanges(adapter, showMessageBox))) return;
    adapter.onNew();
  };

  const handleDelete = async () => {
    if (!adapter.onDelete || !adapter.hasSelection || adapter.isBuiltIn) return;
    if (!(await resolveDefinitionChanges(adapter, showMessageBox))) return;
    if (await confirmDefinitionDelete(adapter, showMessageBox)) await adapter.onDelete();
  };

  return (
    <div className="editor-actions">
      {!adapter.isBuiltIn && showDelete && (
        <button
          className="icon-button definition-action-button danger"
          type="button"
          title="Delete"
          aria-label="Delete"
          onClick={() => void handleDelete()}
          disabled={!adapter.onDelete || adapter.saving}
        >
          <Icon name="trash" size={17} />
        </button>
      )}
      {!adapter.isBuiltIn && showSave && (
        <button
          className="icon-button definition-action-button primary"
          type="button"
          title="Save function"
          aria-label="Save function"
          onClick={() => void adapter.onSave?.()}
          disabled={!adapter.onSave || !adapter.dirty || adapter.saving}
        >
          <Icon name="save" size={17} />
        </button>
      )}
      {adapter.isBuiltIn && <span className="section-kicker definition-readonly">BUILT-IN · READ-ONLY</span>}
      <button
        className="icon-button definition-action-button create"
        type="button"
        title="Create function"
        aria-label="Create function"
        onClick={() => void handleNew()}
        disabled={!adapter.onNew || adapter.saving}
      >
        <Icon name="file-plus" size={17} />
      </button>
    </div>
  );
}
