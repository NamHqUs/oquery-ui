import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../../shared/icon/icon";
import DatabaseConnection from "../../data-sources/database-connection/database-connection";
import { fetchDbProvider, fetchDbSchema } from "../../data-sources/database-slice";
import type { AppDispatch, RootState } from "../../../store/store";
import { getFullDomain } from "../../../services/project-service";
import DomainWizard, { type WizardSource, type WizardStep } from "./domain-wizard";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";
import { pluralize, singularize, toAbstractDataType } from "../entity-definition/types";
import "./domain-wizard-page.css";

type DatabaseRelationship = {
  name: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
};
type RelationNames = { lookup: string; collection: string };
type DataTypeIcon = "type-number" | "type" | "type-datetime" | "type-boolean";

const tableKey = (schema: string | null | undefined, table: string) => `${schema ?? ""}.${table}`;
const tableKeyOf = (table: DatabaseTableOption) => tableKey(table.schema, table.name);
const relationSourceKey = (relation: DatabaseRelationship) => tableKey(relation.sourceSchema, relation.sourceTable);
const relationTargetKey = (relation: DatabaseRelationship) => tableKey(relation.targetSchema, relation.targetTable);
const relationKey = (relation: DatabaseRelationship) => `${relation.name}|${relationSourceKey(relation)}|${relationTargetKey(relation)}`;

const DATA_TYPE_ICONS: Record<string, DataTypeIcon> = { Number: "type-number", Boolean: "type-boolean", Datetime: "type-datetime" };
const dataTypeIconOf = (dataType: string): DataTypeIcon => DATA_TYPE_ICONS[dataType] ?? "type";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

type DomainWizardPageProps = {
  mode: "create" | "edit";
  projectId: string;
};

export default function DomainWizardPage({ mode, projectId }: DomainWizardPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const database = useSelector((state: RootState) => state.database);
  const connected = database.connectionStatus === "succeeded";
  const tables: DatabaseTableOption[] = database.schema.tables;
  const relationships: DatabaseRelationship[] = database.schema.relationships;

  const [step, setStep] = useState<WizardStep>(1);
  const [source, setSource] = useState<WizardSource>("database");
  const [tableFilter, setTableFilter] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  // Table key -> name of the Main domain entity already mapped to that table (edit mode only).
  const [existingEntities, setExistingEntities] = useState<Map<string, string>>(() => new Map());
  const [excludedColumns, setExcludedColumns] = useState<Record<string, string[]>>({});
  const [fieldNames, setFieldNames] = useState<Record<string, Record<string, string>>>({});
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [relationNames, setRelationNames] = useState<Record<string, RelationNames>>({});
  const [collapsedEntities, setCollapsedEntities] = useState<Record<string, boolean>>({});
  const [domainName, setDomainName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [doneMessage, setDoneMessage] = useState("");

  useEffect(() => {
    if (database.connectionStatus === "idle") void dispatch(fetchDbProvider());
  }, [database.connectionStatus, dispatch]);

  useEffect(() => {
    if (connected && database.schemaStatus === "idle") void dispatch(fetchDbSchema());
  }, [connected, database.schemaStatus, dispatch]);

  useEffect(() => {
    if (mode !== "edit") return;
    let active = true;
    getFullDomain(projectId)
      .then((full) => {
        if (!active) return;
        const existing = new Map(full.entities.map((entity) => [tableKey(entity.dbSchema, entity.dbTable ?? ""), entity.name]));
        setExistingEntities(existing);
        setSelectedKeys(new Set(existing.keys()));
      })
      .catch((reason: unknown) => {
        if (active) setError(messageOf(reason));
      });
    return () => {
      active = false;
    };
  }, [mode, projectId]);

  const normalizedFilter = tableFilter.trim().toLowerCase();
  const filteredTables = tables.filter(table => !normalizedFilter
    || table.name.toLowerCase().includes(normalizedFilter)
    || table.schema.toLowerCase().includes(normalizedFilter));
  const schemas = [...new Set(tables.map(table => table.schema))];
  const chosen = tables.filter(table => selectedKeys.has(tableKeyOf(table)));
  const chosenKeys = new Set(chosen.map(tableKeyOf));
  const relations = relationships.filter(relation => chosenKeys.has(relationSourceKey(relation)) && chosenKeys.has(relationTargetKey(relation)));
  const isExisting = (table: DatabaseTableOption) => existingEntities.has(tableKeyOf(table));
  const entityName = (table: DatabaseTableOption) => entityNames[tableKeyOf(table)] ?? existingEntities.get(tableKeyOf(table)) ?? table.name;
  const fieldName = (table: DatabaseTableOption, columnName: string) => fieldNames[tableKeyOf(table)]?.[columnName] ?? columnName;
  const relationNamesFor = (relation: DatabaseRelationship): RelationNames => relationNames[relationKey(relation)]
    ?? { lookup: singularize(relation.targetTable), collection: pluralize(relation.sourceTable) };
  const canContinue = step === 1 ? source === "database" && connected && chosen.length > 0 : true;

  const toggleTable = (key: string) => {
    setSelectedKeys(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleColumn = (table: DatabaseTableOption, columnName: string) => {
    const key = tableKeyOf(table);
    setExcludedColumns(current => {
      const list = current[key] ?? [];
      return { ...current, [key]: list.includes(columnName) ? list.filter(item => item !== columnName) : [...list, columnName] };
    });
  };

  const goTo = (next: WizardStep) => {
    setError("");
    setStep(next);
  };

  // Preview only: the wizard does not persist the design yet.
  const generate = () => {
    const name = domainName.trim();
    if (!name) {
      setError("Enter a domain name.");
      return;
    }
    setError("");
    setDoneMessage("");
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setDoneMessage(`Nothing was saved. "${name}" has ${chosen.length} entities and ${relations.length} relations.`);
    }, 800);
  };

  const sourceStep = source === "file" ? (
    <div className="domain-upload-step">
      <strong>{mode === "edit" ? "Append domain metadata" : "Upload domain metadata"}</strong>
      <p>JSON or YAML import is not connected to this view yet.</p>
    </div>
  ) : !connected ? (
    <div className="domain-connection-prompt">
      <strong>Connect to a database</strong>
      <p>Choose the database that provides the tables for this domain.</p>
      <DatabaseConnection onConnected={() => void dispatch(fetchDbSchema())} />
    </div>
  ) : database.schemaStatus === "failed" ? (
    <p className="domain-error" role="alert">{database.schemaError}</p>
  ) : (
    <div className="domain-table-picker">
      <div className="domain-step-title">
        <strong>{mode === "edit" ? "Select tables to append" : "Select database tables"}</strong>
        <span>{chosen.length} selected</span>
      </div>
      <span>{mode === "edit" ? "Existing domain tables are selected automatically. Choose additional tables to append." : "Tables are read from the active database connection."}</span>
      {mode === "edit" && <div className="domain-source-legend" aria-label="Source legend"><span className="existing-source"><i /> Existing table</span><span className="append-source"><i /> New table to append</span></div>}
      <label className="domain-table-filter">
        <Icon name="search" size={14} />
        <input spellCheck={false} value={tableFilter} onChange={event => setTableFilter(event.target.value)} placeholder="Filter tables by name or schema" aria-label="Filter database tables" />
        {tableFilter && <button type="button" onClick={() => setTableFilter("")} aria-label="Clear table filter">Clear</button>}
      </label>
      <div className="domain-table-picker-layout">
        <div className="domain-available-tables">
          <div className="domain-table-list-heading"><strong>Available tables</strong></div>
          {schemas.map(schema => {
            const schemaTables = filteredTables.filter(table => table.schema === schema);
            if (schemaTables.length === 0) return null;
            return (
              <section key={schema} className="domain-schema-group">
                <div className="domain-schema-heading"><span>{schema || "default"}</span><small>{schemaTables.length} {schemaTables.length === 1 ? "table" : "tables"}</small></div>
                <div className="domain-schema-tables">
                  {schemaTables.map(table => {
                    const key = tableKeyOf(table);
                    const existing = isExisting(table);
                    const sourceClass = mode === "edit" ? (existing ? "existing-source" : "append-source") : "";
                    return (
                      <label key={key} className={sourceClass || undefined}>
                        <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggleTable(key)} />
                        <span><strong>{table.name}</strong>{existing && <small className="domain-table-entity">Entity: {existingEntities.get(key)}</small>}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {tables.length > 0 && filteredTables.length === 0 && <p className="empty-state">No tables match this filter.</p>}
          {tables.length === 0 && <p className="empty-state">No database tables are available.</p>}
        </div>
        <aside className="domain-selected-tables" aria-label="Selected database tables">
          <div className="domain-table-list-heading">
            <strong>Selected tables</strong>
            <span>
              <small>{chosen.length}</small>
              <button type="button" className="domain-clear-selection" onClick={() => setSelectedKeys(new Set())} disabled={chosen.length === 0}>Clear all</button>
            </span>
          </div>
          {chosen.length > 0
            ? <div className="domain-selected-table-list">
              {chosen.map(table => {
                const key = tableKeyOf(table);
                const existing = isExisting(table);
                return (
                  <button key={key} className={existing ? "existing-source" : "append-source"} type="button" onClick={() => toggleTable(key)} title={`Remove ${table.name}`}>
                    <span><strong>{table.name}</strong><small>{table.schema}</small>{existing && <small className="domain-table-entity">Entity: {existingEntities.get(key)}</small>}</span>
                    <b aria-hidden="true">×</b>
                  </button>
                );
              })}
            </div>
            : <p className="domain-selected-empty">Choose tables from the list to add them to this domain.</p>}
        </aside>
      </div>
    </div>
  );

  const designStep = (
    <div className="domain-generation">
      <strong>{mode === "edit" ? "Review domain changes" : "Review and generate metadata"}</strong>
      <p>{mode === "edit" ? "Existing entities remain selected unless removed. Review the entity definitions and appended tables before saving." : `${chosen.length} entities selected. Choose the fields and relation names to generate.`}</p>
      <div className="domain-step-section">
        <h4>Entities</h4>
        <div className="domain-entity-preview">
          {chosen.length === 0 && <p>No tables are selected. Go back to step 1 to choose tables.</p>}
          {chosen.map(table => {
            const key = tableKeyOf(table);
            const excluded = excludedColumns[key] ?? [];
            const collapsed = collapsedEntities[key] ?? false;
            const orderedColumns = [...table.columns].sort((left, right) => Number(!excluded.includes(right.name)) - Number(!excluded.includes(left.name)));
            return (
              <div key={key} className={`domain-entity-item${isExisting(table) ? " existing-source" : " append-source"}`}>
                <button type="button" className="domain-collapse" onClick={() => setCollapsedEntities(current => ({ ...current, [key]: !collapsed }))} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${table.name} entity`}>
                  <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={15} />
                </button>
                <section className="domain-preview-card">
                  <div className="domain-preview-heading">
                    <div className="domain-entity-heading-names">
                      <input
                        className="domain-entity-name"
                        spellCheck={false}
                        aria-label={`Entity name for ${table.name}`}
                        value={entityName(table)}
                        onChange={event => setEntityNames(current => ({ ...current, [key]: event.target.value }))}
                      />
                      <small>{table.schema}.{table.name}</small>
                    </div>
                    <button type="button" className="domain-remove" onClick={() => toggleTable(key)} aria-label={`Remove ${table.name} table`} title="Remove table">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                  {!collapsed && (
                    <div className="domain-column-grid">
                      {orderedColumns.map(item => {
                        const included = !excluded.includes(item.name);
                        const dataType = toAbstractDataType(item.dataType, item.name);
                        return (
                          <label key={item.name}>
                            <input type="checkbox" checked={included} onChange={() => toggleColumn(table, item.name)} />
                            <input
                              className="domain-field-name"
                              spellCheck={false}
                              value={fieldName(table, item.name)}
                              disabled={!included}
                              onChange={event => setFieldNames(current => ({ ...current, [key]: { ...current[key], [item.name]: event.target.value } }))}
                              aria-label={`Field name for ${item.name}`}
                            />
                            <small className="domain-data-type" title={dataType} aria-label={`Data type: ${dataType}`}>
                              <Icon name={dataTypeIconOf(dataType)} size={14} />
                            </small>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            );
          })}
        </div>
      </div>
      {relations.length > 0 && (
        <div className="domain-step-section">
          <h4>Relations</h4>
          <div className="domain-relation-preview">
            <div className="domain-relation-header"><strong>Relation</strong><strong>Lookup name</strong><strong>Collection name</strong></div>
            {relations.map(relation => {
              const key = relationKey(relation);
              const names = relationNamesFor(relation);
              return (
                <div key={key} className="domain-relation-row">
                  <span>{relation.sourceTable} → {relation.targetTable}</span>
                  <input spellCheck={false} value={names.lookup} aria-label={`Lookup relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, lookup: event.target.value } }))} />
                  <input spellCheck={false} value={names.collection} aria-label={`Collection relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, collection: event.target.value } }))} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const generateStep = (
    <form className="domain-final-details" onSubmit={event => { event.preventDefault(); generate(); }}>
      <label className="domain-name">
        <span>Domain name</span>
        <input autoFocus value={domainName} onChange={event => setDomainName(event.target.value)} disabled={saving} placeholder="e.g. Sales" />
        <small>Use a name that describes the business area this workspace serves.</small>
      </label>
      <label className="domain-description">
        <span>Description <small>(optional)</small></span>
        <textarea value={description} onChange={event => setDescription(event.target.value)} disabled={saving} rows={4} placeholder="Describe the business area this domain represents." />
      </label>
      <p className="domain-generation-summary">{chosen.length} entities are ready to generate.</p>
      <button type="submit" className="domain-primary domain-generate-content-button" disabled={saving || chosen.length === 0}>
        {saving ? "Generating…" : "Generate metadata"} <Icon name="arrow-right" size={14} />
      </button>
      {doneMessage && <p className="domain-generation-summary" role="status">{doneMessage}</p>}
    </form>
  );

  return (
    <main className="domain-wizard-page domain-create-view">
      <DomainWizard
        mode={mode}
        domainDisplayName={mode === "edit" ? "Main" : undefined}
        source={source}
        step={step}
        canContinue={canContinue}
        saving={saving}
        error={error}
        onStepChange={goTo}
        onSourceChange={next => { setError(""); setSource(next); }}
        onBack={() => goTo(Math.max(1, step - 1) as WizardStep)}
        onNext={() => goTo(Math.min(3, step + 1) as WizardStep)}
        onGenerate={generate}
      >
        {step === 1 && sourceStep}
        {step === 2 && designStep}
        {step === 3 && generateStep}
      </DomainWizard>
    </main>
  );
}
