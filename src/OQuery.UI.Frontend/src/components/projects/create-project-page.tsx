import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../icon/icon";
import "../data-sources/database-connection/database-connection.css";
import { getConnectionOptions } from "../../services/database-connection-service";
import { createProjectFromDatabase, testDatabaseConnection } from "../../services/project-service";
import ConnectionStringInput from "../data-sources/database-connection/connection-string-input";
import "./projects.css";

export const DEFAULT_PROJECT_NAME = "Default";
export const DEFAULT_PROJECT_DESCRIPTION = "the first project";

type Feedback = { tone: "success" | "error"; message: string };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

// Test and create results stay on this page: success or the server's error details, each with an icon.
export default function CreateProjectPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(DEFAULT_PROJECT_NAME);
  const [description, setDescription] = useState(DEFAULT_PROJECT_DESCRIPTION);
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [busy, setBusy] = useState<"test" | "create" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [optionsError, setOptionsError] = useState("");

  useEffect(() => {
    let active = true;
    getConnectionOptions()
      .then(({ providers: available }) => {
        if (!active) return;
        setProviders(available);
        setProvider((current) => current || available[0] || "");
      })
      .catch((error: unknown) => {
        if (active) setOptionsError(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const hasRequiredFields = Boolean(provider && connectionString.trim());

  const testConnection = async () => {
    setBusy("test");
    setFeedback(null);
    try {
      await testDatabaseConnection(provider, connectionString);
      setFeedback({ tone: "success", message: `Connected to ${provider} successfully.` });
    } catch (error) {
      setFeedback({ tone: "error", message: messageOf(error) });
    } finally {
      setBusy(null);
    }
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("create");
    setFeedback(null);
    try {
      const project = await createProjectFromDatabase({
        name: name.trim(),
        description: description.trim(),
        provider,
        connectionString,
      });
      navigate(`/projects/${encodeURIComponent(project.id)}`);
    } catch (error) {
      setFeedback({ tone: "error", message: messageOf(error) });
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <section className="projects-page connection-card" aria-labelledby="create-project-title">
      <span className="section-kicker">NEW PROJECT</span>
      <h2 id="create-project-title">Create project</h2>
      <p className="connection-intro">
        The project reads its entities, fields and relations from this database into the Main domain.
        The connection string is encrypted before it is saved.
      </p>

      {optionsError && <p className="connection-message error" role="alert">{optionsError}</p>}

      <form className="connection-form" onSubmit={createProject}>
        <label>
          <span>Project name</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} required disabled={disabled} />
        </label>
        <label>
          <span>Description</span>
          <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} disabled={disabled} />
        </label>
        <label>
          <span>DBMS</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={disabled || providers.length === 0} required>
            {providers.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Connection string</span>
          <ConnectionStringInput
            value={connectionString}
            onChange={setConnectionString}
            placeholder="Enter your database connection string"
            required
            disabled={disabled}
          />
          <small>Encrypted with the server encryption key. It is never returned by the API.</small>
        </label>

        {feedback && (
          <p
            className={`connection-message connection-message-inline ${feedback.tone}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            <Icon name={feedback.tone === "error" ? "close" : "check"} size={14} />
            {feedback.message}
          </p>
        )}

        <div className="projects-page-actions">
          <button className="button secondary" type="button" onClick={testConnection} disabled={disabled || !hasRequiredFields}>
            <Icon name="database" size={14} /> {busy === "test" ? "Testing…" : "Test Connection"}
          </button>
          <button className="connection-submit" type="submit" disabled={disabled || !hasRequiredFields || !name.trim()}>
            <Icon name="check" size={14} /> {busy === "create" ? "Creating project…" : "Create Project"}
          </button>
        </div>
      </form>
    </section>
  );
}
