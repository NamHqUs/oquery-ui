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

function projectInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : (words[0]?.slice(0, 2) || "PR").toUpperCase();
}

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
    <section className="projects-page projects-list-page">
      <div className="projects-page-head">
        <div>
          <span className="section-kicker">YOUR WORKSPACE</span>
          <h2>Projects</h2>
          <p className="connection-intro">A focused home for your data, domains, and query work.</p>
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
      {state.projects && state.projects.length > 0 && (
        <div className="projects-summary" aria-label="Workspace summary">
          <div className="projects-summary-item">
            <span className="projects-summary-icon"><Icon name="folder" size={16} /></span>
            <span><strong>{state.projects.length}</strong><small>{state.projects.length === 1 ? "project" : "projects"}</small></span>
          </div>
          <div className="projects-summary-item">
            <span className="projects-summary-icon projects-summary-icon-green"><Icon name="database" size={16} /></span>
            <span><strong>{state.projects.filter((project) => project.connection?.provider || project.dbConnectionProfile).length}</strong><small>connected</small></span>
          </div>
          <p>Choose a project to continue where your data work lives.</p>
        </div>
      )}
      {!state.projects && !state.error && (
        <div className="projects-loading" aria-label="Loading projects">
          <span /><span /><span />
        </div>
      )}
      {state.projects?.length === 0 && (
        <div className="projects-empty">
          <span className="projects-empty-icon"><Icon name="folder" size={25} /></span>
          <div>
            <h3>Your workspace is ready</h3>
            <p>Create your first project or load an existing project folder to start exploring your data.</p>
          </div>
          <div className="projects-empty-actions">
            <Link className="button primary" to="/projects/create"><Icon name="plus" size={14} /> Create a project</Link>
            <button className="button secondary" type="button" onClick={loadFromDisk} disabled={importing || !folderPickerSupported}>
              <Icon name="folder" size={14} /> Load from disk
            </button>
          </div>
        </div>
      )}

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
                    <span className="projects-card-top">
                      <span className="projects-card-icon">{projectInitials(project.name)}</span>
                      <span className="projects-card-provider">{project.connection?.provider || project.dbConnectionProfile || "No database"}</span>
                    </span>
                    <strong>{project.name}</strong>
                    <small>{project.description || "No description yet"}</small>
                    <span className="projects-card-open">Open workspace <Icon name="arrow-right" size={13} /></span>
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
