import { useEffect, useState, type FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon, { getDatabaseIconName } from "../../icon/icon";
import { connectDatabase, fetchDatabaseConnections } from "../database-slice";
import "./database-connection.css";

type ConnectionMode = "internal" | "direct";

type DatabaseConnectionProps = {
  onConnected?: () => void;
};

export default function DatabaseConnection({ onConnected }: DatabaseConnectionProps) {
  const dispatch = useDispatch();
  const {
    connectionProfiles,
    providers,
    directConnectionsEnabled,
    connectionOptionsStatus,
    connectionOptionsError,
    connectionStatus,
    connectionError,
  } = useSelector((state) => state.database);
  const [mode, setMode] = useState<ConnectionMode>("internal");
  const [profileName, setProfileName] = useState("");
  const [provider, setProvider] = useState("");
  const [connectionString, setConnectionString] = useState("");

  useEffect(() => {
    dispatch(fetchDatabaseConnections());
  }, [dispatch]);

  useEffect(() => {
    const profile = connectionProfiles.includes(profileName) ? profileName : connectionProfiles[0];
    if (profile) {
      setProfileName(profile);
    } else if (providers.length > 0) {
      setProvider((current) => current || providers[0]);
    }
  }, [connectionProfiles, profileName, providers]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = mode === "internal"
      ? { profile: profileName }
      : { provider, connectionString };
    try {
      await dispatch(connectDatabase(request)).unwrap();
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
        <p className="connection-intro">Select an available source or connect directly to a supported database system.</p>

        <div className="connection-mode-tabs" role="tablist" aria-label="Connection method">
          <button type="button" role="tab" aria-selected={mode === "internal"} className={mode === "internal" ? "active" : ""} onClick={() => setMode("internal")}>
            Available source
          </button>
          <button type="button" role="tab" aria-selected={mode === "direct"} className={mode === "direct" ? "active" : ""} onClick={() => setMode("direct")} disabled={!directConnectionsEnabled}>
            Direct connection
          </button>
        </div>

        {!directConnectionsEnabled && <p className="connection-message">Direct connections are disabled by the server. An administrator can enable them for a trusted environment.</p>}
        <div className="connection-options-status" aria-live="polite">
          {connectionOptionsStatus === "loading" && <p className="connection-message">Loading available sources…</p>}
          {connectionOptionsStatus === "failed" && <p className="connection-message error" role="alert">{connectionOptionsError}</p>}
        </div>

        <form className="connection-form" onSubmit={submit}>
          {mode === "internal" ? (
            <label>
              <span>Available source</span>
              <select
                value={profileName}
                onChange={(event) => {
                  setProfileName(event.target.value);
                }}
                disabled={connectionProfiles.length === 0 || connectionStatus === "loading"}
              >
                {connectionProfiles.length === 0 && <option value="">No available sources</option>}
                {connectionProfiles.map((profile) => (
                  <option value={profile} key={profile}>{profile}</option>
                ))}
              </select>
              <small>Connection strings remain on the server and are never sent to the browser.</small>
            </label>
          ) : (
            <>
              <label>
                <span>Database system</span>
                <select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={connectionStatus === "loading"}>
                  {providers.map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Connection string</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={connectionString}
                  onChange={(event) => setConnectionString(event.target.value)}
                  placeholder="Enter your database connection string"
                  required
                  disabled={connectionStatus === "loading"}
                />
                <small>Used only to establish this connection; it is not returned by the API.</small>
              </label>
            </>
          )}

          {connectionError && <p className="connection-message error" role="alert">{connectionError}</p>}
          <button
            className="connection-submit"
            type="submit"
            disabled={connectionStatus === "loading" || (mode === "internal"
              ? !profileName || connectionProfiles.length === 0
              : !provider || !connectionString.trim())}
          >
            <Icon name="database" size={15} />
            {connectionStatus === "loading" ? "Connecting…" : "Connect database"}
          </button>
        </form>
      </div>
    </section>
  );
}
