import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFullDomain, updateFullDomain } from "../../../services/project-service";
import { metadataEntityFromDto } from "../../query-builder/query-design/query-builder-slice";
import { toEntityPayload, toRelationPayload } from "../entity-definition/types";
import { domainDiagramPath } from "../domain-diagram-routes";
import DomainWizardContainer from "./domain-wizard-container";
import type { DomainGraph } from "./domain-wizard-model";

// The Main domain is the only domain the wizard edits. Create builds a sub-domain from its entities.
const MAIN_DOMAIN_ID = "main";

type DomainWizardPageProps = {
  mode: "create" | "edit";
  projectId: string;
  domainId: string;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function DomainWizardPage({ mode, projectId, domainId }: DomainWizardPageProps) {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<DomainGraph | null>(null);
  const [error, setError] = useState("");
  const mainDiagramPath = domainDiagramPath(projectId, MAIN_DOMAIN_ID);
  const editAllowed = mode === "create" || domainId === MAIN_DOMAIN_ID;

  useEffect(() => {
    if (!editAllowed) return;
    let active = true;
    getFullDomain(projectId)
      .then((full) => {
        if (active) setGraph({ entities: full.entities.map(metadataEntityFromDto), relations: full.relations });
      })
      .catch((reason: unknown) => {
        if (active) setError(messageOf(reason));
      });
    return () => {
      active = false;
    };
  }, [projectId, editAllowed]);

  if (!editAllowed) {
    return (
      <main className="domain-wizard-page">
        <p className="domain-error" role="alert">Only the Main domain can be edited in the wizard.</p>
        <button type="button" className="domain-secondary" onClick={() => navigate(mainDiagramPath)}>Back to diagram</button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="domain-wizard-page">
        <p className="domain-error" role="alert">{error}</p>
        <button type="button" className="domain-secondary" onClick={() => navigate(mainDiagramPath)}>Back to diagram</button>
      </main>
    );
  }

  if (!graph) return <main className="domain-wizard-page"><p>Loading domain…</p></main>;

  return (
    <main className="domain-wizard-page">
      <DomainWizardContainer
        mode={mode}
        projectId={projectId}
        domainName={mode === "edit" ? "Main" : undefined}
        working={graph}
        onApply={async (next) => {
          await updateFullDomain(projectId, {
            entities: next.entities.map(toEntityPayload),
            relations: toRelationPayload(next.relations),
          });
          navigate(mainDiagramPath);
        }}
        onCreated={(domainIdCreated) => navigate(domainDiagramPath(projectId, domainIdCreated))}
        onCancel={() => navigate(mainDiagramPath)}
      />
    </main>
  );
}
