import { useEffect, useState } from "react";
import { useMessageBox } from "../../message-box/message-box";
import Icon from "../../icon/icon";
import {
  createDomain,
  deleteDomain,
  updateDomain,
  type FullDomain,
  type SubDomainConfig,
  type SubDomainEntity,
} from "../../../services/project-service";
import {
  effectiveFieldName,
  effectiveRelationName,
  emptySubDomain,
  findOverride,
  findSubDomainProblem,
  isReferenceField,
  referenceKeys,
  relationSidesFor,
  setEntityExposed,
  setFieldExcluded,
  setFieldName,
  setRelationName,
  toSubDomainPayload,
  updateOverride,
} from "../types";

type SubDomainEditorProps = {
  projectId: string;
  fullDomain: FullDomain;
  domain: SubDomainConfig | null;
  onSaved: (saved: SubDomainConfig, isNew: boolean) => void;
  onDeleted: (domainId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string) => void;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function SubDomainEditor({
  projectId,
  fullDomain,
  domain,
  onSaved,
  onDeleted,
  onDirtyChange,
  onError,
}: SubDomainEditorProps) {
  const showMessageBox = useMessageBox();
  const [baseline, setBaseline] = useState<SubDomainConfig>(() => domain ?? emptySubDomain());
  const [draft, setDraft] = useState<SubDomainConfig>(() => domain ?? emptySubDomain());
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const sourceKey = JSON.stringify(domain ?? emptySubDomain());

  useEffect(() => {
    const next = JSON.parse(sourceKey) as SubDomainConfig;
    setBaseline(next);
    setDraft(next);
  }, [sourceKey]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const updateEntity = (entity: string, update: (item: SubDomainEntity) => SubDomainEntity) =>
    setDraft((current) => updateOverride(current, entity, update));

  const save = async () => {
    const problem = findSubDomainProblem(draft, fullDomain);
    if (problem) {
      onError(problem);
      return;
    }
    const payload = toSubDomainPayload(draft);
    setSaving(true);
    try {
      const saved = domain
        ? await updateDomain(projectId, domain.id, payload)
        : await createDomain(projectId, payload);
      onSaved(saved, !domain);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!domain) return;
    const action = await showMessageBox({
      eyebrow: "DELETE SUB-DOMAIN",
      title: `Delete ${domain.name}?`,
      message: "This sub-domain will be permanently removed. The project and its full domain are kept.",
      actions: [
        { value: "cancel", label: "Cancel", variant: "secondary" },
        { value: "delete", label: "Delete", variant: "danger" },
      ],
    });
    if (action !== "delete") return;
    setSaving(true);
    try {
      await deleteDomain(projectId, domain.id);
      onDeleted(domain.id);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sub-domain-editor">
      <div className="project-builder-section-head">
        <div>
          <span className="section-kicker">SUB-DOMAIN</span>
          <h3>{draft.name.trim() || "New sub-domain"}</h3>
        </div>
        <div className="project-builder-actions">
          {domain && (
            <button className="button secondary compact project-builder-danger" type="button" onClick={() => void remove()} disabled={saving}>
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
          <button
            className="button primary compact"
            type="button"
            onClick={() => void save()}
            disabled={saving || (Boolean(domain) && !dirty)}
          >
            {domain ? "Save sub-domain" : "Create sub-domain"}
          </button>
        </div>
      </div>

      <div className="project-builder-form-grid">
        <label>
          Name
          <input
            type="text"
            spellCheck={false}
            value={draft.name}
            disabled={saving}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="project-builder-form-wide">
          Description
          <textarea
            rows={2}
            value={draft.description}
            disabled={saving}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
          />
        </label>
      </div>

      <section className="project-builder-section" aria-label="Exposed entities">
        <span className="section-kicker">EXPOSED ENTITIES</span>
        <p className="project-builder-hint">
          Only exposed entities are visible to queries in this sub-domain. You can rename entities, fields and relations.
          Columns, raw SQL and relation keys always come from the full domain.
        </p>
        {fullDomain.entities.length === 0 && (
          <div className="project-builder-empty">
            <p>This project has no full domain yet. Generate it before defining a sub-domain.</p>
          </div>
        )}
        {fullDomain.entities.map((entity) => {
          const override = findOverride(draft, entity.name);
          const sides = relationSidesFor(entity.name, fullDomain.relations);
          const keys = referenceKeys(sides);
          return (
            <div className={`sub-domain-entity${override ? "" : " not-exposed"}`} key={entity.name}>
              <div className="sub-domain-entity-head">
                <label className="sub-domain-expose">
                  <input
                    type="checkbox"
                    checked={Boolean(override)}
                    disabled={saving}
                    onChange={(event) => setDraft((current) => setEntityExposed(current, entity.name, event.target.checked))}
                  />
                  Expose
                </label>
                <strong>{entity.name}</strong>
                {override && (
                  <label className="sub-domain-rename">
                    Name in sub-domain
                    <input
                      type="text"
                      spellCheck={false}
                      value={override.entityName ?? ""}
                      placeholder={entity.name}
                      disabled={saving}
                      onChange={(event) => updateEntity(entity.name, (item) => ({ ...item, entityName: event.target.value }))}
                    />
                  </label>
                )}
              </div>
              {!override && <p className="project-builder-hint">Not exposed in this sub-domain.</p>}
              {override && (
                <>
                  <table className="project-builder-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Column</th>
                        <th>Type</th>
                        <th>Include</th>
                        <th>Name in sub-domain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entity.fields.map((field) => {
                        const excluded = override.excludedFields.includes(field.name);
                        const locked = Boolean(field.isRawSql) || isReferenceField(field, keys);
                        return (
                          <tr key={field.name} className={excluded ? "excluded" : undefined}>
                            <td>
                              {field.name}
                              {locked && <span className="project-builder-badge">{field.isRawSql ? "Raw SQL" : "Relation key"}</span>}
                            </td>
                            <td>{field.dbColumn || "—"}</td>
                            <td>{field.dataType || "String"}</td>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Include ${field.name}`}
                                checked={!excluded}
                                disabled={saving || locked}
                                onChange={(event) => updateEntity(entity.name, (item) => setFieldExcluded(item, field.name, !event.target.checked))}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                spellCheck={false}
                                aria-label={`Name for ${field.name}`}
                                value={effectiveFieldName(override, field.name)}
                                disabled={saving || locked || excluded}
                                onChange={(event) => updateEntity(entity.name, (item) => setFieldName(item, field.name, event.target.value))}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {sides.length > 0 && (
                    <table className="project-builder-table">
                      <thead>
                        <tr>
                          <th>Relation</th>
                          <th>Points to</th>
                          <th>Keys</th>
                          <th>Name in sub-domain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sides.map((side, index) => {
                          const targetExposed = draft.entities.some((item) => item.entity === side.refEntity);
                          return (
                            <tr key={`${side.relation}-${index}`}>
                              <td>{side.relation}</td>
                              <td>
                                {side.refEntity}
                                {!targetExposed && <span className="project-builder-badge">Not exposed</span>}
                              </td>
                              <td>{side.keyColumns.join(", ")}</td>
                              <td>
                                <input
                                  type="text"
                                  spellCheck={false}
                                  aria-label={`Name for relation ${side.relation}`}
                                  value={effectiveRelationName(override, side.relation)}
                                  disabled={saving}
                                  onChange={(event) => updateEntity(entity.name, (item) => setRelationName(item, side.relation, event.target.value))}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
