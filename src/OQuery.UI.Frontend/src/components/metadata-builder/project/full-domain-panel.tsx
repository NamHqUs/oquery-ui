import { useState } from "react";
import Icon from "../../icon/icon";
import { generateFullDomain, invalidateDomain, type FullDomain } from "../../../services/project-service";
import { relationSidesFor } from "../types";

type FullDomainPanelProps = {
  projectId: string;
  fullDomain: FullDomain;
  onGenerated: (fullDomain: FullDomain) => void;
  onError: (message: string) => void;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function FullDomainPanel({ projectId, fullDomain, onGenerated, onError }: FullDomainPanelProps) {
  const [generating, setGenerating] = useState(false);
  const hasFullDomain = fullDomain.entities.length > 0;

  const generate = async () => {
    setGenerating(true);
    try {
      const generated = await generateFullDomain(projectId);
      invalidateDomain(projectId);
      onGenerated(generated);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="project-builder-section" aria-label="Full domain">
      <div className="project-builder-section-head">
        <div>
          <span className="section-kicker">FULL DOMAIN</span>
          <p className="project-builder-hint">
            Every entity, field and relation generated from the database. Sub-domains expose a subset of these and rename them.
          </p>
        </div>
        <button className="button secondary compact" type="button" onClick={() => void generate()} disabled={generating}>
          <Icon name="database" size={14} /> {hasFullDomain ? "Regenerate from database" : "Generate full domain from database"}
        </button>
      </div>
      {!hasFullDomain ? (
        <div className="project-builder-empty">
          <Icon name="database" size={28} />
          <p>This project has no full domain yet. Generate one from the database to start defining sub-domains.</p>
        </div>
      ) : (
        <>
          <p className="project-builder-hint">
            {fullDomain.entities.length} entities · {fullDomain.relations.length} relations
          </p>
          {fullDomain.entities.map((entity) => {
            const sides = relationSidesFor(entity.name, fullDomain.relations);
            return (
              <details className="full-domain-entity" key={entity.name}>
                <summary>
                  <Icon name="table" size={14} />
                  <strong>{entity.name}</strong>
                  <small>{entity.dbSchema ? `${entity.dbSchema}.` : ""}{entity.dbTable || entity.rawSql || entity.name}</small>
                  <span className="project-builder-count">{entity.fields.length} fields</span>
                </summary>
                <table className="project-builder-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Column</th>
                      <th>Type</th>
                      <th>Kind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity.fields.map((field) => (
                      <tr key={field.name}>
                        <td>{field.name}</td>
                        <td>{field.dbColumn || "—"}</td>
                        <td>{field.dataType || "String"}</td>
                        <td>{field.isRawSql ? "Raw SQL" : "Column"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sides.length > 0 && (
                  <ul className="full-domain-relations">
                    {sides.map((side) => (
                      <li key={`${side.relation}-${side.refEntity}`}>
                        <strong>{side.relation}</strong> → {side.refEntity}
                        <small> on {side.keyColumns.join(", ")}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </>
      )}
    </section>
  );
}
