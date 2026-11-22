import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Icon from "../../shared/icon/icon";
import DatabaseConnection from "../../data-sources/database-connection/database-connection";
import { fetchDbProvider, fetchDbSchema } from "../../data-sources/database-slice";
import type { AppDispatch, RootState } from "../../../store/store";
import DomainWizard, { type WizardSource, type WizardStep } from "./domain-wizard";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";
import { pluralize, singularize, toAbstractDataType, toEntityPayload, toRelationPayload } from "../entity-definition/types";
import { createDomain } from "../../../services/project-service";
import { setDomainDraftWorking } from "../domain-draft-slice";
import { loadDomainDraft } from "../domain-draft-actions";
import {
  applyWizardToGraph,
  seedWizardSelection,
  tableEntityMap,
  tableKey,
  tableKeyOf,
  wizardChangeCounts,
  type DatabaseRelationship,
  type RelationNames,
} from "./wizard-draft";
import "./domain-wizard-page.css";

const relationSourceKey = (relation: DatabaseRelationship) => tableKey(relation.sourceSchema, relation.sourceTable);
const relationTargetKey = (relation: DatabaseRelationship) => tableKey(relation.targetSchema, relation.targetTable);
const relationKey = (relation: DatabaseRelationship) => `${relation.name}|${relationSourceKey(relation)}|${relationTargetKey(relation)}`;
type DataTypeIcon = "type-number" | "type" | "type-datetime" | "type-boolean";

const DATA_TYPE_ICONS: Record<string, DataTypeIcon> = { Number: "type-number", Boolean: "type-boolean", Datetime: "type-datetime" };
const dataTypeIconOf = (dataType: string): DataTypeIcon => DATA_TYPE_ICONS[dataType] ?? "type";

type TableFilter = "all" | "selected" | "unselected";
type DesignTab = "entities" | "relations";
const TABLE_FILTER_OPTIONS: [TableFilter, string][] = [["all", "All"], ["selected", "Selected"], ["unselected", "Unselected"]];

type DomainWizardPageProps = {
  mode: "create" | "edit";
  projectId: string;
  domainId: string;
  onCancel: () => void;
  // Edit mode only: the wizard changed the in-memory domain and the diagram should be shown again.
  onApplied: () => void;
  // Create mode only: the domain was saved; the diagram opens with the new domain selected.
  onCreated: (domainId: string) => void;
};

export default function DomainWizardPage({ mode, projectId, domainId, onCancel, onApplied, onCreated }: DomainWizardPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const database = useSelector((state: RootState) => state.database);
  const draft = useSelector((state: RootState) => state.domainDraft);
  const connected = database.connectionStatus === "succeeded";
  const tables: DatabaseTableOption[] = database.schema.tables;
  const relationships: DatabaseRelationship[] = database.schema.relationships;

  const [step, setStep] = useState<WizardStep>(1);
  const [source, setSource] = useState<WizardSource>("database");
  const [tableFilter, setTableFilter] = useState("");
  const [tableSelectionFilter, setTableSelectionFilter] = useState<TableFilter>("all");
  const [entityFilter, setEntityFilter] = useState<TableFilter>("selected");
  const [designTab, setDesignTab] = useState<DesignTab>("entities");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [excludedColumns, setExcludedColumns] = useState<Record<string, string[]>>({});
  const [fieldNames, setFieldNames] = useState<Record<string, Record<string, string>>>({});
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [relationNames, setRelationNames] = useState<Record<string, RelationNames>>({});
  const [collapsedEntities, setCollapsedEntities] = useState<Record<string, boolean>>({});
  const [domainName, setDomainName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const seededRef = useRef(false);

  // Edit mode works on the in-memory domain, which the diagram may already hold. Create mode never reads it.
  const draftReady = mode === "edit" && draft.projectId === projectId && draft.domainId === domainId && draft.status === "succeeded";
  const draftFailed = mode === "edit" && draft.projectId === projectId && draft.domainId === domainId && draft.status === "failed";
  const existingDomainName = draftReady ? draft.name : "";
  const existingEntities = useMemo(
    () => new Map([...tableEntityMap(draftReady ? draft.working.entities : [], tables)].map(([key, entity]) => [key, entity.name])),
    [draftReady, draft.working.entities, tables],
  );

  useEffect(() => {
    if (database.connectionStatus === "idle") void dispatch(fetchDbProvider());
  }, [database.connectionStatus, dispatch]);

  useEffect(() => {
    if (connected && database.schemaStatus === "idle") void dispatch(fetchDbSchema());
  }, [connected, database.schemaStatus, dispatch]);

  useEffect(() => {
    if (mode !== "edit") return;
    void dispatch(loadDomainDraft({ projectId, domainId }));
  }, [mode, projectId, domainId, dispatch]);

  // Seeds the selection once per visit, after both the domain and the database tables are available.
  useEffect(() => {
    if (!draftReady || seededRef.current || tables.length === 0) return;
    seededRef.current = true;
    const seed = seedWizardSelection(draft.working.entities, tables);
    setSelectedKeys(seed.selectedKeys);
    setExcludedColumns(seed.excludedColumns);
    setFieldNames(seed.fieldNames);
  }, [draftReady, draft.working.entities, tables]);

  const matchesSelection = (key: string, filter: TableFilter) => filter === "all" || (filter === "selected") === selectedKeys.has(key);
  const normalizedFilter = tableFilter.trim().toLowerCase();
  const filteredTables = tables.filter(table => matchesSelection(tableKeyOf(table), tableSelectionFilter)
    && (!normalizedFilter || table.name.toLowerCase().includes(normalizedFilter) || table.schema.toLowerCase().includes(normalizedFilter)));
  const designTables = tables.filter(table => matchesSelection(tableKeyOf(table), entityFilter));
  const schemas = [...new Set(tables.map(table => table.schema))];
  const chosen = tables.filter(table => selectedKeys.has(tableKeyOf(table)));
  const chosenKeys = new Set(chosen.map(tableKeyOf));
  const relations = relationships.filter(relation => chosenKeys.has(relationSourceKey(relation)) && chosenKeys.has(relationTargetKey(relation)));
  const isExisting = (table: DatabaseTableOption) => existingEntities.has(tableKeyOf(table));
  const existingRelationIds = useMemo(
    () => new Set(draftReady ? draft.working.relations.map(relation => JSON.stringify([relation.sourceEntity, relation.sourceFields, relation.targetEntity, relation.targetFields])) : []),
    [draftReady, draft.working.relations],
  );
  const entityName = (table: DatabaseTableOption) => entityNames[tableKeyOf(table)] ?? existingEntities.get(tableKeyOf(table)) ?? table.name;
  const fieldName = (table: DatabaseTableOption, columnName: string) => fieldNames[tableKeyOf(table)]?.[columnName] ?? columnName;
  const relationNamesFor = (relation: DatabaseRelationship): RelationNames => relationNames[relationKey(relation)]
    ?? { lookup: singularize(relation.targetTable), collection: pluralize(relation.sourceTable) };
  // A relation is new unless the in-memory domain already has it between the same entities and fields.
  const isNewRelation = (relation: DatabaseRelationship) => {
    const sourceTable = tables.find(table => tableKeyOf(table) === relationSourceKey(relation));
    const targetTable = tables.find(table => tableKeyOf(table) === relationTargetKey(relation));
    if (!sourceTable || !targetTable) return true;
    const identity = JSON.stringify([
      entityName(sourceTable),
      relation.sourceColumns.map(column => fieldName(sourceTable, column)),
      entityName(targetTable),
      relation.targetColumns.map(column => fieldName(targetTable, column)),
    ]);
    return !existingRelationIds.has(identity);
  };
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

  // Edit mode: writes the result to the in-memory domain only. The diagram's Save is the only path that persists it.
  const applyChanges = () => {
    setError("");
    const result = applyWizardToGraph({
      graph: draft.working,
      tables,
      chosen,
      relationships,
      excludedColumns,
      entityName,
      fieldName,
      relationNames: relationNamesFor,
    });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    dispatch(setDomainDraftWorking(result.graph));
    onApplied();
  };

  // Create mode: builds the new domain from the wizard selection and saves it to disk, then returns to the opener.
  const createDomainFromWizard = async () => {
    const name = domainName.trim();
    if (!name) {
      setError("Enter a domain name.");
      return;
    }
    const result = applyWizardToGraph({
      graph: { entities: [], relations: [] },
      tables,
      chosen,
      relationships,
      excludedColumns,
      entityName,
      fieldName,
      relationNames: relationNamesFor,
    });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const created = await createDomain(projectId, {
        name,
        description: description.trim(),
        entities: result.graph.entities.map(toEntityPayload),
        relations: toRelationPayload(result.graph.relations),
      });
      onCreated(created.id);
    } catch (failure) {
      setError(`Create failed. ${failure instanceof Error ? failure.message : "Something went wrong."}`);
    } finally {
      setSaving(false);
    }
  };

  const filterControl = (value: TableFilter, onChange: (next: TableFilter) => void, label: string) => (
    <div className="domain-segmented" role="group" aria-label={label}>
      {TABLE_FILTER_OPTIONS.map(([option, text]) => (
        <button key={option} type="button" className={value === option ? "active" : ""} aria-pressed={value === option} onClick={() => onChange(option)}>{text}</button>
      ))}
    </div>
  );

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
      {filterControl(tableSelectionFilter, setTableSelectionFilter, "Show tables")}
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
      {filterControl(entityFilter, setEntityFilter, "Show entities")}
      <div className="domain-design-tabs" role="tablist" aria-label="Design sections">
        <button type="button" role="tab" id="domain-tab-entities" aria-selected={designTab === "entities"} aria-controls="domain-panel-design" className={designTab === "entities" ? "active" : ""} onClick={() => setDesignTab("entities")}>
          Entities <small>{chosen.length}</small>
        </button>
        <button type="button" role="tab" id="domain-tab-relations" aria-selected={designTab === "relations"} aria-controls="domain-panel-design" className={designTab === "relations" ? "active" : ""} onClick={() => setDesignTab("relations")}>
          Relations <small>{relations.length}</small>
        </button>
      </div>
      {designTab === "entities" ? (
        <div id="domain-panel-design" role="tabpanel" aria-labelledby="domain-tab-entities" className="domain-step-section">
          <div className="domain-entity-preview">
            {chosen.length === 0 && <p>No tables are selected. Go back to step 1 to choose tables.</p>}
            {designTables.map(table => {
              const key = tableKeyOf(table);
              if (!selectedKeys.has(key)) {
                return (
                  <div key={key} className="domain-unselected-entity">
                    <span><strong>{table.name}</strong><small>{table.schema}</small></span>
                    <small>{isExisting(table) ? "Removed" : "Not selected"}</small>
                    <button type="button" className="domain-add" onClick={() => toggleTable(key)} aria-label={`Add ${table.name} entity`}>Add entity</button>
                  </div>
                );
              }
              const excluded = excludedColumns[key] ?? [];
              // Existing entities start collapsed; newly added entities start expanded.
              const collapsed = collapsedEntities[key] ?? isExisting(table);
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
      ) : (
        <div id="domain-panel-design" role="tabpanel" aria-labelledby="domain-tab-relations" className="domain-step-section">
          {relations.length === 0
            ? <p className="domain-selected-empty">No relations between the selected tables.</p>
            : (
              <div className="domain-relation-preview">
                <div className="domain-relation-header"><strong>Relation</strong><strong>Lookup name</strong><strong>Collection name</strong></div>
                {relations.map(relation => {
                  const key = relationKey(relation);
                  const names = relationNamesFor(relation);
                  const isNew = isNewRelation(relation);
                  return (
                    <div key={key} className={`domain-relation-row${isNew ? " append-source" : ""}`}>
                      <span>{relation.sourceTable} → {relation.targetTable}</span>
                      <input spellCheck={false} value={names.lookup} aria-label={`Lookup relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, lookup: event.target.value } }))} />
                      <input spellCheck={false} value={names.collection} aria-label={`Collection relation for ${relation.name}`} onChange={event => setRelationNames(current => ({ ...current, [key]: { ...names, collection: event.target.value } }))} />
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}
    </div>
  );

  const changeCounts = wizardChangeCounts(Array.from(existingEntities.keys()), selectedKeys);
  const editApplyStep = (
    <div className="domain-final-details">
      <div className="domain-change-summary">
        <p className="domain-generation-summary">
          Entities: {changeCounts.added} new, {changeCounts.removed} removed, {changeCounts.kept} kept.
        </p>
        <p className="domain-generation-warning" role="note">
          Changes are only in memory until you save the domain from the diagram&apos;s Save button.
        </p>
      </div>
      <button type="button" className="domain-primary domain-generate-content-button" onClick={applyChanges} disabled={saving}>
        Apply changes <Icon name="arrow-right" size={14} />
      </button>
    </div>
  );

  const generateStep = mode === "edit" ? editApplyStep : (
    <form className="domain-final-details" onSubmit={event => { event.preventDefault(); void createDomainFromWizard(); }}>
      <label className="domain-name">
        <span>Domain name</span>
        <input autoFocus value={domainName} onChange={event => setDomainName(event.target.value)} disabled={saving} placeholder="e.g. Sales" />
        <small>Use a name that describes the business area this workspace serves.</small>
      </label>
      <label className="domain-description">
        <span>Description <small>(optional)</small></span>
        <textarea value={description} onChange={event => setDescription(event.target.value)} disabled={saving} rows={4} placeholder="Describe the business area this domain represents." />
      </label>
      <p className="domain-generation-summary">{chosen.length} entities are ready to create.</p>
      <button type="submit" className="domain-primary domain-generate-content-button" disabled={saving || chosen.length === 0}>
        {saving ? "Creating…" : "Create domain"} <Icon name="arrow-right" size={14} />
      </button>
    </form>
  );

  return (
    <main className="domain-wizard-page domain-create-view">
      <DomainWizard
        mode={mode}
        domainDisplayName={mode === "edit" ? existingDomainName || undefined : undefined}
        source={source}
        step={step}
        canContinue={canContinue}
        saving={saving}
        error={error || (draftFailed ? draft.error : "")}
        onStepChange={goTo}
        onSourceChange={next => { setError(""); setSource(next); }}
        onBack={() => goTo(Math.max(1, step - 1) as WizardStep)}
        onNext={() => goTo(Math.min(3, step + 1) as WizardStep)}
        onGenerate={() => void createDomainFromWizard()}
        onCancel={onCancel}
      >
        {step === 1 && sourceStep}
        {step === 2 && designStep}
        {step === 3 && generateStep}
      </DomainWizard>
    </main>
  );
}
