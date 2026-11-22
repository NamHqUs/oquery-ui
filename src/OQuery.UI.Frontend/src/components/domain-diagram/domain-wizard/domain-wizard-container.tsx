import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import DatabaseConnection from "../../data-sources/database-connection/database-connection";
import { fetchDbProvider, fetchDbSchema } from "../../data-sources/database-slice";
import type { AppDispatch, RootState } from "../../../store/store";
import { createDomain } from "../../../services/project-service";
import { findEntityNameProblem, findRelationProblem, toAbstractDataType } from "../entity-definition/types";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";
import DomainWizard, { type WizardStep } from "./domain-wizard";
import {
  buildEditedGraph,
  entityTableKey,
  tableKey,
  type DomainGraph,
  type TableDesign,
} from "./domain-wizard-model";

type DomainWizardContainerProps = {
  mode: "create" | "edit";
  projectId: string;
  domainName?: string;
  working: DomainGraph;
  onApply: (graph: DomainGraph) => Promise<void>;
  onCreated: (domainId: string) => void;
  onCancel: () => void;
};

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function DomainWizardContainer({ mode, projectId, domainName, working, onApply, onCreated, onCancel }: DomainWizardContainerProps) {
  const dispatch = useDispatch<AppDispatch>();
  const database = useSelector((state: RootState) => state.database);
  const connected = database.connectionStatus === "succeeded";
  const tables: DatabaseTableOption[] = database.schema.tables;
  const relationships = database.schema.relationships;
  const [step, setStep] = useState<WizardStep>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Edit mode: the existing mappings start selected, so deselecting one removes it from the Main domain.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set(working.entities.map(entityTableKey)));
  const [design, setDesign] = useState<Record<string, TableDesign>>({});

  // Create mode: the sub-domain is built from entities that already exist in the Main domain.
  const [selectedEntityNames, setSelectedEntityNames] = useState<Set<string>>(() => new Set());
  const [newDomainName, setNewDomainName] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");

  useEffect(() => {
    if (mode === "edit" && database.connectionStatus === "idle") void dispatch(fetchDbProvider());
  }, [mode]);

  useEffect(() => {
    if (mode === "edit" && connected && database.schemaStatus === "idle") void dispatch(fetchDbSchema());
  }, [mode, connected, database.schemaStatus]);

  const draft = useMemo(
    () => (mode === "edit" ? buildEditedGraph(working, tables, relationships, selectedKeys, design) : working),
    [mode, working, tables, relationships, selectedKeys, design],
  );
  const databaseKeys = useMemo(() => new Set(tables.map((table) => tableKey(table.schema, table.name))), [tables]);
  const existingByKey = useMemo(() => new Map(working.entities.map((entity) => [entityTableKey(entity), entity])), [working]);
  const selectedTables = tables.filter((table) => selectedKeys.has(tableKey(table.schema, table.name)));
  const addedTables = selectedTables.filter((table) => !existingByKey.has(tableKey(table.schema, table.name)));
  const removedEntities = working.entities.filter((entity) => {
    const key = entityTableKey(entity);
    return databaseKeys.has(key) && !selectedKeys.has(key);
  });
  const entityNameProblem = mode === "edit" ? findEntityNameProblem(draft.entities) : null;
  const relationProblem = mode === "edit" ? findRelationProblem(draft.entities, draft.relations) : null;

  const createSelection = working.entities.filter((entity) => selectedEntityNames.has(entity.name));
  const createRelations = working.relations.filter((relation) => selectedEntityNames.has(relation.sourceEntity) && selectedEntityNames.has(relation.targetEntity));

  const toggleTable = (table: DatabaseTableOption) => {
    const key = tableKey(table.schema, table.name);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateDesign = (key: string, change: (current: TableDesign) => TableDesign) => {
    setDesign((current) => ({ ...current, [key]: change(current[key] ?? { excludedColumns: [] }) }));
  };

  const toggleColumn = (key: string, column: string) => {
    updateDesign(key, (current) => ({
      ...current,
      excludedColumns: current.excludedColumns.includes(column)
        ? current.excludedColumns.filter((item) => item !== column)
        : [...current.excludedColumns, column],
    }));
  };

  const toggleEntityName = (name: string) => {
    setSelectedEntityNames((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const canContinue = (() => {
    if (mode === "create") return step === 1 ? createSelection.length > 0 : true;
    if (step === 1) return connected;
    if (step === 2) return !entityNameProblem;
    return false;
  })();

  const goTo = (next: WizardStep) => {
    setError("");
    setStep(next);
  };

  const next = () => {
    if (mode === "edit" && step === 2 && entityNameProblem) {
      setError(entityNameProblem);
      return;
    }
    goTo(Math.min(3, step + 1) as WizardStep);
  };

  const apply = async () => {
    if (relationProblem) {
      setError(relationProblem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onApply(draft);
    } catch (reason) {
      setError(messageOf(reason, "Unable to apply domain changes."));
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newDomainName.trim();
    if (!name) {
      setError("Enter a domain name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await createDomain(projectId, {
        name,
        description: newDomainDescription.trim(),
        entities: createSelection.map((entity) => ({
          entity: entity.name,
          entityName: null,
          fieldNames: [],
          excludedFields: [],
          relationNames: [],
        })),
      });
      onCreated(created.id);
    } catch (reason) {
      setError(messageOf(reason, "Unable to create the domain."));
      setBusy(false);
    }
  };

  const databaseStep = (
    <>
      <h4>Database tables</h4>
      {!connected && (
        <>
          <p>Connect to the database to load its tables. The wizard continues here once the connection succeeds.</p>
          <DatabaseConnection onConnected={() => void dispatch(fetchDbSchema())} />
        </>
      )}
      {connected && database.schemaStatus === "failed" && <p role="alert">{database.schemaError}</p>}
      {connected && database.schemaStatus !== "failed" && (
        <>
          <p>{selectedKeys.size} selected. Existing entities stay as they are; deselecting one removes it on apply.</p>
          <div className="domain-table-list">
            {tables.map((table) => {
              const key = tableKey(table.schema, table.name);
              const mapped = existingByKey.get(key);
              return (
                <label key={key}>
                  <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggleTable(table)} />
                  <span>{table.schema}.{table.name}</span>
                  {mapped && <small>{mapped.name}</small>}
                </label>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  const designStep = (
    <>
      <h4>Entities</h4>
      {selectedTables.length === 0 && <p>No tables are selected. Applying will leave the Main domain with no entities for them.</p>}
      {selectedTables.map((table) => {
        const key = tableKey(table.schema, table.name);
        const mapped = existingByKey.get(key);
        if (mapped) {
          return (
            <div key={key} className="domain-entity-card">
              <div className="domain-entity-card-head"><strong>{mapped.name}</strong><small>{table.schema}.{table.name} · kept; edit fields in Entity Definition</small></div>
            </div>
          );
        }
        const excluded = design[key]?.excludedColumns ?? [];
        return (
          <div key={key} className="domain-entity-card">
            <div className="domain-entity-card-head">
              <input aria-label={`Entity name for ${table.name}`} value={design[key]?.name ?? table.name} onChange={(event) => updateDesign(key, (current) => ({ ...current, name: event.target.value }))} />
              <small>{table.schema}.{table.name}</small>
            </div>
            <div className="domain-column-grid">
              {table.columns.map((column) => (
                <label key={column.name}>
                  <input type="checkbox" checked={!excluded.includes(column.name)} onChange={() => toggleColumn(key, column.name)} />
                  {column.name} <small>{toAbstractDataType(column.dataType, column.name)}</small>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {draft.relations.length > 0 && (
        <>
          <h4>Relations</h4>
          <ul className="domain-relation-list">
            {draft.relations.map((relation) => (
              <li key={`${relation.sourceEntity}.${relation.sourceRelationName}.${relation.targetEntity}`}>
                {relation.sourceEntity}.{relation.sourceRelationName} → {relation.targetEntity}.{relation.targetRelationName}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );

  const applyStep = (
    <>
      <h4>Apply changes</h4>
      <div className="domain-summary">
        <div><strong>{addedTables.length}</strong><span>entities added</span></div>
        <div><strong>{removedEntities.length}</strong><span>entities removed</span></div>
        <div><strong>{draft.entities.length}</strong><span>entities in the Main domain</span></div>
      </div>
      {relationProblem && <p role="alert">{relationProblem}</p>}
      <div><button type="button" className="domain-primary" onClick={() => void apply()} disabled={busy || Boolean(relationProblem)}>
        {busy ? "Applying…" : "Apply domain changes"}
      </button></div>
    </>
  );

  const entitiesStep = (
    <>
      <h4>Entities from the Main domain</h4>
      <div className="domain-table-list">
        {working.entities.map((entity) => (
          <label key={entity.name}>
            <input type="checkbox" checked={selectedEntityNames.has(entity.name)} onChange={() => toggleEntityName(entity.name)} />
            <span>{entity.name}</span>
            <small>{entity.fields.length} fields</small>
          </label>
        ))}
      </div>
    </>
  );

  const reviewStep = (
    <>
      <h4>Review</h4>
      {createSelection.map((entity) => (
        <div key={entity.name} className="domain-entity-card">
          <div className="domain-entity-card-head"><strong>{entity.name}</strong><small>{entity.fields.map((field) => field.name).join(", ")}</small></div>
        </div>
      ))}
      {createRelations.length > 0 && (
        <ul className="domain-relation-list">
          {createRelations.map((relation) => (
            <li key={`${relation.sourceEntity}.${relation.sourceRelationName}.${relation.targetEntity}`}>
              {relation.sourceEntity}.{relation.sourceRelationName} → {relation.targetEntity}.{relation.targetRelationName}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const createStep = (
    <>
      <h4>Create domain</h4>
      <form className="domain-form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <label>
          Domain name
          <input value={newDomainName} onChange={(event) => setNewDomainName(event.target.value)} required disabled={busy} />
        </label>
        <label>
          Description
          <input value={newDomainDescription} onChange={(event) => setNewDomainDescription(event.target.value)} disabled={busy} />
        </label>
        <div><button type="submit" className="domain-primary" disabled={busy || !newDomainName.trim()}>
          {busy ? "Creating…" : "Create domain"}
        </button></div>
      </form>
    </>
  );

  const body = mode === "edit"
    ? [databaseStep, designStep, applyStep][step - 1]
    : [entitiesStep, reviewStep, createStep][step - 1];

  return (
    <DomainWizard
      mode={mode}
      domainDisplayName={domainName}
      step={step}
      canContinue={canContinue}
      canNavigateToStep={(target) => target <= step || (mode === "edit" && target === 2 && connected)}
      saving={busy}
      error={error}
      onStepChange={goTo}
      onBack={() => goTo(Math.max(1, step - 1) as WizardStep)}
      onNext={next}
      onCancel={onCancel}
    >
      {body}
    </DomainWizard>
  );
}
