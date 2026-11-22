import { useEffect, useState, type FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon, { getDatabaseIconName } from "../../shared/icon/icon";
import { connectDatabase, fetchDatabaseConnections } from "../database-slice";
import ConnectionStringInput from "./connection-string-input";
import "./database-connection.css";

type DatabaseConnectionProps = {
  onConnected?: () => void;
};

export default function DatabaseConnection({ onConnected }: DatabaseConnectionProps) {
  const dispatch = useDispatch();
  const {
    providers,
    connectionOptionsStatus,
    connectionOptionsError,
    connectionStatus,
    connectionError,
  } = useSelector((state) => state.database);
  const [provider, setProvider] = useState("");
  const [connectionString, setConnectionString] = useState("");

  useEffect(() => {
    dispatch(fetchDatabaseConnections());
  }, [dispatch]);

  useEffect(() => {
    if (providers.length > 0) {
      setProvider((current) => current || providers[0]);
    }
  }, [providers]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await dispatch(connectDatabase({ provider, connectionString })).unwrap();
      setConnectionString("");
      onConnected?.();
    } catch {
      // The rejected thunk stores the message for display below.
    }
  }

  return (
    <section className="connection-screen" aria-labelledby="connection-title">
      <div className="connection-pitch">
        <span className="section-kicker">ONE WORKSPACE · MULTIPLE DATABASES</span>
        <h2>Explore data across the systems you use.</h2>
        <p className="connection-pitch-copy">
          Connect to a supported database and use one workspace to inspect schemas, browse tables, and preview records.
        </p>
        <div className="connection-provider-list" aria-label="Supported database systems">
          {providers.length > 0 ? providers.map((item) => (
            <span className="connection-provider" key={item}><Icon name={getDatabaseIconName(item)} size={16} />{item}</span>
          )) : (
            <span className="connection-provider-status">
              {connectionOptionsStatus === "loading" ? "Loading supported systems…" : "Supported systems are provided by your server"}
            </span>
          )}
        </div>
        <div className="connection-capabilities">
          <span><Icon name="schema" size={15} /> Inspect schemas</span>
          <span><Icon name="table" size={15} /> Browse tables</span>
          <span><Icon name="results" size={15} /> Preview records</span>
        </div>
      </div>

      <div className="connection-card">
        <span className="section-kicker">GET STARTED</span>
        <h2 id="connection-title">Choose a database</h2>
        <p className="connection-intro">Select a supported database system and enter its connection string.</p>

        <div className="connection-options-status" aria-live="polite">
          {connectionOptionsStatus === "failed" && <p className="connection-message error" role="alert">{connectionOptionsError}</p>}
        </div>

        <form className="connection-form" onSubmit={submit}>
          <label>
            <span>Database system</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={connectionStatus === "loading"}>
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
              disabled={connectionStatus === "loading"}
            />
            <small>Used only to establish this connection; it is not returned by the API.</small>
          </label>

          {connectionError && <p className="connection-message error" role="alert">{connectionError}</p>}
          <button
            className="connection-submit"
            type="submit"
            disabled={connectionStatus === "loading" || !provider || !connectionString.trim()}
          >
            <Icon name="database" size={15} />
            {connectionStatus === "loading" ? "Connecting…" : "Connect database"}
          </button>
        </form>
      </div>
    </section>
  );
}
