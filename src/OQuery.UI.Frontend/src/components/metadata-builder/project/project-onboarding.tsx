import { useState, type FormEvent } from "react";
import { useSelector } from "react-redux";
import Icon from "../../icon/icon";
import DatabaseConnection from "../../data-sources/database-connection/database-connection";
import { createDomain, createProject, deleteProject, generateFullDomain } from "../../../services/project-service";
import type { RootState } from "../../../store/store";

type ProjectOnboardingProps = {
  onCompleted: (projectId: string, domainId: string) => void;
  onCancel?: () => void;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

// A project is only persisted together with its first domain. If any step fails, the project is removed again.
export default function ProjectOnboarding({ onCompleted, onCancel }: ProjectOnboardingProps) {
  const database = useSelector((state: RootState) => state.database);
  const connected = database.connectionStatus === "succeeded" && Boolean(database.connectedProvider);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domainName, setDomainName] = useState("");
  const [domainDescription, setDomainDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const projectName = name.trim();
    const firstDomainName = domainName.trim();
    if (!projectName || !firstDomainName) {
      setError("Enter a project name and a first domain name.");
      return;
    }
    setError("");
    setSubmitting(true);
    let projectId = "";
    try {
      const project = await createProject({
        name: projectName,
        description: description.trim(),
        dbConnectionProfile: database.connectedProvider,
      });
      projectId = project.id;
      try {
        const fullDomain = await generateFullDomain(projectId);
        if (fullDomain.entities.length === 0) throw new Error("The connected database has no tables to build a domain from.");
        const domain = await createDomain(projectId, {
          name: firstDomainName,
          description: domainDescription.trim(),
          entities: fullDomain.entities.map((entity) => ({
            entity: entity.name,
            entityName: null,
            fieldNames: [],
            excludedFields: [],
            relationNames: [],
          })),
        });
        onCompleted(projectId, domain.id);
      } catch (reason) {
        await deleteProject(projectId).catch(() => undefined);
        throw reason;
      }
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="project-builder project-onboarding">
      <div className="project-builder-section-head">
        <div>
          <span className="section-kicker">NEW PROJECT</span>
          <h3>{connected ? "Name your project and first domain" : "Connect a database"}</h3>
          <p className="project-builder-hint">
            {connected
              ? `Connected to ${database.connectedProvider}. The full domain is generated from this database when you create the project.`
              : "A project starts from one database. Connect it first."}
          </p>
        </div>
        {onCancel && <button type="button" className="button secondary" onClick={onCancel} disabled={submitting}>Cancel</button>}
      </div>

      {!connected && <DatabaseConnection onConnected={() => undefined} />}

      {connected && (
        <form className="project-onboarding-form" onSubmit={submit}>
          {error && <p className="metadata-alert" role="alert">{error}</p>}
          <div className="project-builder-form-grid">
            <label>
              Project name
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} />
            </label>
            <label>
              Description
              <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting} />
            </label>
            <label>
              First domain name
              <input type="text" value={domainName} onChange={(event) => setDomainName(event.target.value)} required disabled={submitting} />
            </label>
            <label>
              Domain description
              <input type="text" value={domainDescription} onChange={(event) => setDomainDescription(event.target.value)} disabled={submitting} />
            </label>
          </div>
          <div className="project-builder-actions">
            <button type="submit" className="button primary" disabled={submitting}>
              <Icon name="check" size={14} /> {submitting ? "Creating project…" : "Create project"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
