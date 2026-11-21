import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Icon from "../icon/icon";
import { listProjects, type ProjectSummary } from "../../services/project-service";
import "../projects/projects.css";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

// With no project yet, the workspace goes straight to Create project.
export default function WorkspacePage() {
  const [state, setState] = useState<{ projects: ProjectSummary[] | null; error: string }>({ projects: null, error: "" });

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

  if (state.projects?.length === 0) return <Navigate to="/projects/create" replace />;

  return (
    <section className="projects-page">
      <div className="projects-page-head">
        <div>
          <span className="section-kicker">WORKSPACE</span>
          <h2>Projects</h2>
          <p className="connection-intro">Each project holds one database, its Main domain and its queries.</p>
        </div>
        <Link className="button primary" to="/projects/create"><Icon name="plus" size={14} /> New project</Link>
      </div>

      {state.error && <p className="connection-message error" role="alert">{state.error}</p>}
      {!state.projects && !state.error && <p className="metadata-message">Loading projects…</p>}

      {state.projects && (
        <ul className="projects-list" aria-label="Projects">
          {state.projects.map((project) => (
            <li key={project.id}>
              <Link className="projects-card" to={`/playground/${encodeURIComponent(project.id)}`}>
                <Icon name="folder" size={18} />
                <strong>{project.name}</strong>
                <small>{project.description || "No description"}</small>
                <small>{project.connection?.provider || project.dbConnectionProfile || "No database"}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
