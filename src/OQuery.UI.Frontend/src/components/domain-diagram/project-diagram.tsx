import { useEffect, useState } from "react";
import DomainDiagram from "./domain-diagram";
import { getDomain, type DomainDetails, type ProjectDetails, type ProjectSummary } from "../../services/project-service";

type ProjectDiagramProps = {
  projects: ProjectSummary[];
  project: ProjectDetails | null;
  domainId: string;
  onProjectChange: (projectId: string) => void;
  onDomainChange: (domainId: string) => void;
  onError: (message: string) => void;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function ProjectDiagram({
  projects,
  project,
  domainId,
  onProjectChange,
  onDomainChange,
  onError,
}: ProjectDiagramProps) {
  const [details, setDetails] = useState<DomainDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const projectId = project?.id ?? "";

  useEffect(() => {
    if (!projectId || !domainId) {
      setDetails(null);
      return;
    }
    let active = true;
    setLoading(true);
    getDomain(projectId, domainId)
      .then((resolved) => {
        if (active) setDetails(resolved);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDetails(null);
        onError(messageOf(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, domainId, onError]);

  return (
    <div className="project-diagram">
      <div className="project-diagram-toolbar">
        <label>
          <span className="section-kicker">PROJECT</span>
          <select value={projectId} onChange={(event) => onProjectChange(event.target.value)} disabled={projects.length === 0}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {project && project.domains.length === 0 && (
          <p className="project-builder-hint">This project has no sub-domains yet. Create one under Projects to see its diagram.</p>
        )}
        {project && project.domains.length > 0 && !domainId && (
          <p className="project-builder-hint">Choose a sub-domain to view its diagram.</p>
        )}
      </div>
      {project && (
        <DomainDiagram
          entities={details?.entities ?? []}
          relations={details?.relations ?? []}
          domainOptions={project.domains.map((item) => ({ id: item.id, name: item.name }))}
          activeDomainId={domainId || undefined}
          loading={loading}
          onSelectDomain={onDomainChange}
        />
      )}
    </div>
  );
}
