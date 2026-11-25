import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../shared/icon/icon";
import "../data-sources/database-connection/database-connection.css";
import { getConnectionOptions } from "../../services/database-connection-service";
import { createProjectFromDatabase, testDatabaseConnection } from "../../services/project-service";
import ConnectionStringInput from "../data-sources/database-connection/connection-string-input";
import "./projects.css";

// The server creates exactly one sub-domain for a new project; it has this fixed ID.
const MAIN_DOMAIN_ID = "main";

type Feedback = { tone: "success" | "error"; message: string };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

// Test results stay on this page. A successful create opens the Playground on the new Main domain;
// any failure stays here with the server's error details.
export default function CreateProjectPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [busy, setBusy] = useState<"test" | "create" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [providersLoading, setProvidersLoading] = useState(true);

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
      })
      .finally(() => {
        if (active) setProvidersLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const testConnection = async () => {
    if (!provider || !connectionString.trim()) {
      setFeedback({ tone: "error", message: "Select a DBMS and enter a connection string before testing." });
      return;
    }
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
    if (!name.trim()) {
      setFeedback({ tone: "error", message: "Project name is required." });
      return;
    }
    if (!provider || !connectionString.trim()) {
      setFeedback({ tone: "error", message: "Select a DBMS and enter a connection string before creating the project." });
      return;
    }
    setBusy("create");
    setFeedback(null);
    try {
      const created = await createProjectFromDatabase({
        name: name.trim(),
        description: description.trim(),
        provider,
        connectionString,
      });
      navigate(`/playground/${encodeURIComponent(created.id)}/${MAIN_DOMAIN_ID}`);
    } catch (error) {
      setFeedback({ tone: "error", message: messageOf(error) });
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;
  const providerMessage = optionsError || (!providersLoading && providers.length === 0
    ? "No database providers are available. Start the API and reload this page."
    : "");

  return (
    <section className="projects-page connection-card" aria-labelledby="create-project-title">
      <span className="section-kicker">NEW PROJECT</span>
      <h2 id="create-project-title">Create project</h2>
      <p className="connection-intro">
        The project reads its entities, fields and relations from this database into the Main domain.
        The connection string is encrypted before it is saved.
      </p>

      {providerMessage && <p className="connection-message error" role="alert">{providerMessage}</p>}

      <form className="connection-form" onSubmit={createProject}>
        <label>
          <span>Project name</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sales analytics" aria-required="true" disabled={disabled} />
        </label>
        <label>
          <span>Description</span>
          <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" disabled={disabled} />
        </label>
        <label>
          <span>DBMS</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={disabled || providersLoading || providers.length === 0} aria-required="true">
            {providers.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Connection string</span>
          <ConnectionStringInput
            value={connectionString}
            onChange={setConnectionString}
            placeholder="Enter your database connection string"
            aria-required="true"
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
          <button className="button secondary" type="button" onClick={testConnection} disabled={disabled}>
            <Icon name="database" size={14} /> {busy === "test" ? "Testing…" : "Test Connection"}
          </button>
          <button className="connection-submit" type="submit" disabled={disabled}>
            <Icon name="check" size={14} /> {busy === "create" ? "Creating project…" : "Create Project"}
          </button>
        </div>
      </form>
    </section>
  );
}
