import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../shared/icon/icon";
import { useMessageBox } from "../shared/message-box/message-box";
import { deleteProject, importProjectFromDisk, listProjects, updateProject, type ProjectSummary } from "../../services/project-service";
import { isFolderPickerSupported, pickProjectFolder, readProjectFolder } from "./project-folder-reader";
import "./projects.css";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

type EditDraft = { project: ProjectSummary; name: string; description: string; error: string };

// Lists every project with Edit and Delete, and offers New project and Load Project From Disk. The page stays open when the list is empty.
export default function ProjectListPage() {
  const navigate = useNavigate();
  const showMessageBox = useMessageBox();
  const [state, setState] = useState<{ projects: ProjectSummary[] | null; error: string }>({ projects: null, error: "" });
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const folderPickerSupported = isFolderPickerSupported();

  const refresh = () => listProjects().then((projects) => setState({ projects, error: "" }));

  useEffect(() => {
    let active = true;
    listProjects()
      .then((projects) => {
        if (active) setState({ projects, error: "" });
      })
      .catch((error: unknown) => {
        if (active) setState({ projects: null, error: messageOf(error) });
      });
    return () => {
      active = false;
    };
  }, []);

  const startEdit = (project: ProjectSummary) => {
    setEditing({ project, name: project.name, description: project.description, error: "" });
  };

  // The name is required. The stored connection is kept by the server, so only name and description are sent.
  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setEditing({ ...editing, error: "Project name is required." });
      return;
    }
    setSaving(true);
    try {
      await updateProject(editing.project.id, {
        id: editing.project.id,
        name,
        description: editing.description.trim(),
        dbConnectionProfile: editing.project.dbConnectionProfile,
      });
      setEditing(null);
      await refresh();
    } catch (error) {
      setEditing((current) => current && { ...current, error: messageOf(error) });
    } finally {
      setSaving(false);
    }
  };

  // Deleting a project is permanent, so the user must type its name. The database itself is not touched.
  const removeProject = async (project: ProjectSummary) => {
    const choice = await showMessageBox({
      eyebrow: "Delete project",
      title: `Delete "${project.name}"?`,
      message: "This permanently deletes the project with its domains, saved queries and playgrounds. The connected database is not changed.",
      confirmationText: project.name,
      confirmationLabel: `Type ${project.name} to confirm`,
      actions: [
        { value: "cancel", label: "Cancel" },
        { value: "delete", label: "Delete project", variant: "danger" },
      ],
    });
    if (choice !== "delete") return;
    try {
      await deleteProject(project.id);
      await refresh();
    } catch (error) {
      setState((current) => ({ ...current, error: `Delete failed. ${messageOf(error)}` }));
    }
  };

  // A failed import keeps the user here with the server's error. A successful one opens the imported project's first domain.
  const loadFromDisk = async () => {
    setImporting(true);
    setState((current) => ({ ...current, error: "" }));
    try {
      const folder = await pickProjectFolder();
      if (!folder) return;
      const imported = await importProjectFromDisk(await readProjectFolder(folder));
      navigate(`/playground/${encodeURIComponent(imported.id)}/${encodeURIComponent(imported.domains[0]?.id ?? "main")}`);
    } catch (error) {
      setState((current) => ({ ...current, error: messageOf(error) }));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="projects-page">
      <div className="projects-page-head">
        <div>
          <span className="section-kicker">WORKSPACE</span>
          <h2>Projects</h2>
          <p className="connection-intro">Each project holds one database, its Main domain and its queries.</p>
        </div>
        <div className="projects-page-actions">
          <button
            className="button secondary"
            type="button"
            onClick={loadFromDisk}
            disabled={importing || !folderPickerSupported}
            title={folderPickerSupported ? "Choose a project folder on this computer" : "Loading from disk needs a Chromium-based browser"}
          >
            <Icon name="folder" size={14} /> {importing ? "Loading project…" : "Load Project From Disk"}
          </button>
          <Link className="button primary" to="/projects/create"><Icon name="plus" size={14} /> New project</Link>
        </div>
      </div>

      {state.error && <p className="connection-message error" role="alert">{state.error}</p>}
      {!state.projects && !state.error && <p className="metadata-message">Loading projects…</p>}
      {state.projects?.length === 0 && <p className="metadata-message">No projects yet. Create one or load a project folder from disk.</p>}

      {state.projects && state.projects.length > 0 && (
        <ul className="projects-list" aria-label="Projects">
          {state.projects.map((project) => (
            <li key={project.id} className="projects-item">
              {editing?.project.id === project.id ? (
                <form className="projects-edit" aria-label={`Edit ${project.name}`} onSubmit={saveEdit}>
                  <label>
                    <span>Project name</span>
                    <input type="text" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} aria-required="true" disabled={saving} />
                  </label>
                  <label>
                    <span>Description</span>
                    <input type="text" value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} disabled={saving} />
                  </label>
                  {editing.error && <p className="connection-message error" role="alert">{editing.error}</p>}
                  <div className="projects-card-actions">
                    <button className="button secondary" type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                    <button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  </div>
                </form>
              ) : (
                <>
                  <Link className="projects-card" to={`/playground/${encodeURIComponent(project.id)}`}>
                    <Icon name="folder" size={18} />
                    <strong>{project.name}</strong>
                    <small>{project.description || "No description"}</small>
                    <small>{project.connection?.provider || project.dbConnectionProfile || "No database"}</small>
                  </Link>
                  <div className="projects-card-actions">
                    <button className="button secondary" type="button" onClick={() => startEdit(project)} aria-label={`Edit ${project.name}`}>
                      <Icon name="edit" size={14} /> Edit
                    </button>
                    <button className="button danger" type="button" onClick={() => removeProject(project)} aria-label={`Delete ${project.name}`}>
                      <Icon name="trash" size={14} /> Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
