import { useEffect, useState } from "react";
import { useMessageBox } from "../../message-box/message-box";
import Icon from "../../icon/icon";
import { createProject, deleteProject, updateProject, type ProjectDetails } from "../../../services/project-service";

type ProjectFormValues = {
  name: string;
  description: string;
  dbConnectionProfile: string;
};

type ProjectFormProps = {
  project: ProjectDetails | null;
  onSaved: (project: ProjectDetails, isNew: boolean) => void;
  onDeleted: (projectId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string) => void;
};

function valuesFrom(project: ProjectDetails | null): ProjectFormValues {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    dbConnectionProfile: project?.dbConnectionProfile ?? "",
  };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function ProjectForm({ project, onSaved, onDeleted, onDirtyChange, onError }: ProjectFormProps) {
  const showMessageBox = useMessageBox();
  const [baseline, setBaseline] = useState<ProjectFormValues>(() => valuesFrom(project));
  const [values, setValues] = useState<ProjectFormValues>(() => valuesFrom(project));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const sourceKey = JSON.stringify(valuesFrom(project));

  useEffect(() => {
    const next = JSON.parse(sourceKey) as ProjectFormValues;
    setBaseline(next);
    setValues(next);
  }, [sourceKey]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const update = (field: keyof ProjectFormValues, value: string) => setValues((current) => ({ ...current, [field]: value }));

  const save = async () => {
    const body = {
      name: values.name.trim(),
      description: values.description.trim(),
      dbConnectionProfile: values.dbConnectionProfile.trim(),
    };
    if (!body.name) {
      onError("Every project needs a name.");
      return;
    }
    setSaving(true);
    try {
      const saved = project
        ? await updateProject(project.id, body)
        : await createProject(body);
      onSaved(saved, !project);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    const action = await showMessageBox({
      eyebrow: "DELETE PROJECT",
      title: `Delete ${project.name}?`,
      message: "The project, its full domain and all of its sub-domains will be permanently removed.",
      actions: [
        { value: "cancel", label: "Cancel", variant: "secondary" },
        { value: "delete", label: "Delete", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    setSaving(true);
    try {
      await deleteProject(project.id);
      onDeleted(project.id);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="project-builder-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="project-builder-form-grid">
        <label>
          Name
          <input
            type="text"
            spellCheck={false}
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            disabled={saving}
          />
        </label>
        <label>
          Database connection profile
          <input
            type="text"
            spellCheck={false}
            value={values.dbConnectionProfile}
            onChange={(event) => update("dbConnectionProfile", event.target.value)}
            disabled={saving}
          />
        </label>
        <label className="project-builder-form-wide">
          Description
          <textarea
            rows={3}
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            disabled={saving}
          />
        </label>
      </div>
      <div className="project-builder-actions">
        {project && (
          <button className="button secondary compact project-builder-danger" type="button" onClick={() => void remove()} disabled={saving}>
            <Icon name="trash" size={14} /> Delete project
          </button>
        )}
        <button className="button primary compact" type="submit" disabled={saving || (Boolean(project) && !dirty)}>
          {project ? "Save project" : "Create project"}
        </button>
      </div>
    </form>
  );
}
