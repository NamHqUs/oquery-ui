import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMessageBox } from "../message-box/message-box";
import Icon from "../icon/icon";
import PanelSplitter from "../panel-splitter/panel-splitter";
import { useResizablePanel } from "../../utils/use-resizable-panel";
import {
  getProject,
  listProjects,
  type FullDomain,
  type ProjectDetails,
  type ProjectSummary,
  type SubDomainConfig,
} from "../../services/project-service";
import { useDefinitionUnsavedWarning } from "./definition-actions/definition-actions";
import ProjectForm from "./project/project-form";
import ProjectOnboarding from "./project/project-onboarding";
import FullDomainPanel from "./project/full-domain-panel";
import SubDomainEditor from "./sub-domain/sub-domain-editor";
import { DATABASE_EXPLORER_PATH, DIAGRAMS_PATH, DOMAINS_PATH, metadataPath, type MetadataSection } from "./metadata-routes";
import "./metadata-builder.css";
import "./project-builder.css";

type NavigationGuard = (continueNavigation: () => void, cancelNavigation?: () => void) => void;

type MetadataBuilderProps = {
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
  onSectionNavigationChange?: (handler: ((section: MetadataSection) => void) | null) => void;
};

type Notice = { kind: "error" | "success"; text: string };
type CreateMode = "project" | "domain" | null;

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function MetadataBuilder({ onNavigationGuardChange, onSectionNavigationChange }: MetadataBuilderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const showMessageBox = useMessageBox();
  const [searchParams] = useSearchParams();
  const panel = useResizablePanel("metadata-builder");
  const projectId = searchParams.get("project") ?? "";
  const domainId = searchParams.get("domain") ?? "";

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [creating, setCreating] = useState<CreateMode>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState("");

  const setError = useCallback((text: string) => setNotice({ kind: "error", text }), []);
  const setSuccess = useCallback((text: string) => setNotice({ kind: "success", text }), []);
  const handleDirtyChange = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (error) {
      setError(messageOf(error));
    }
  }, [setError]);

  const reloadProject = useCallback(async (id: string) => {
    try {
      setProject(await getProject(id));
    } catch (error) {
      setError(messageOf(error));
    }
  }, [setError]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects, location.search]);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let active = true;
    setProjectLoading(true);
    getProject(projectId)
      .then((details) => {
        if (active) setProject(details);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProject(null);
        setError(messageOf(error));
      })
      .finally(() => {
        if (active) setProjectLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, setError]);

  useEffect(() => {
    setNotice(null);
  }, [location.pathname, projectId, domainId]);

  useEffect(() => {
    if (location.pathname === "/metadata") navigate(DOMAINS_PATH, { replace: true });
  }, [location.pathname, navigate]);

  useDefinitionUnsavedWarning(dirty);

  const confirmDiscard = useCallback(async () => {
    const action = await showMessageBox({
      eyebrow: "UNSAVED CHANGES",
      title: "Discard unsaved changes?",
      message: "Your edits have not been saved. Discard them and continue?",
      actions: [
        { value: "stay", label: "Stay here", variant: "secondary" },
        { value: "discard", label: "Discard changes", variant: "danger" },
      ],
    });
    return action === "discard";
  }, [showMessageBox]);

  useEffect(() => {
    if (!onNavigationGuardChange) return;
    onNavigationGuardChange((continueNavigation, cancelNavigation) => {
      if (!dirtyRef.current) {
        continueNavigation();
        return;
      }
      void confirmDiscard().then((discard) => {
        if (discard) {
          handleDirtyChange(false);
          continueNavigation();
        } else {
          cancelNavigation?.();
        }
      });
    });
    return () => onNavigationGuardChange(null);
  }, [onNavigationGuardChange, confirmDiscard, handleDirtyChange]);

  const navigateTo = useCallback(async (pathname: string, selection: { projectId?: string; domainId?: string }) => {
    if (dirtyRef.current && !(await confirmDiscard())) return false;
    handleDirtyChange(false);
    setCreating(null);
    navigate(metadataPath(pathname, selection));
    return true;
  }, [confirmDiscard, handleDirtyChange, navigate]);

  useEffect(() => {
    if (!onSectionNavigationChange) return;
    onSectionNavigationChange((next) => {
      if (next === "explorer") {
        void navigateTo(DATABASE_EXPLORER_PATH, {});
        return;
      }
      void navigateTo(next === "diagram" ? DIAGRAMS_PATH : DOMAINS_PATH, {
        projectId: projectId || undefined,
        domainId: domainId || undefined,
      });
    });
    return () => onSectionNavigationChange(null);
  }, [onSectionNavigationChange, navigateTo, projectId, domainId]);

  const selectProject = (id: string) => void navigateTo(DOMAINS_PATH, { projectId: id });
  const selectDomain = (id: string) => void navigateTo(DOMAINS_PATH, { projectId, domainId: id });

  const startCreate = async (mode: "project" | "domain") => {
    const navigated = await navigateTo(DOMAINS_PATH, mode === "domain" ? { projectId } : {});
    if (navigated) setCreating(mode);
  };

  const handleProjectSaved = (saved: ProjectDetails, isNew: boolean) => {
    void loadProjects();
    if (isNew) {
      setCreating(null);
      navigate(metadataPath(DOMAINS_PATH, { projectId: saved.id }));
      return;
    }
    setProject(saved);
    setSuccess("Project saved.");
  };

  const handleProjectDeleted = () => {
    handleDirtyChange(false);
    setCreating(null);
    setProject(null);
    void loadProjects();
    navigate(DOMAINS_PATH);
  };

  const handleDomainSaved = async (saved: SubDomainConfig, isNew: boolean) => {
    await reloadProject(projectId);
    if (isNew) {
      setCreating(null);
      navigate(metadataPath(DOMAINS_PATH, { projectId, domainId: saved.id }));
      return;
    }
    setSuccess("Sub-domain saved.");
  };

  const handleDomainDeleted = () => {
    handleDirtyChange(false);
    setCreating(null);
    navigate(metadataPath(DOMAINS_PATH, { projectId }));
    void reloadProject(projectId);
  };

  const handleFullDomainGenerated = (fullDomain: FullDomain) => {
    setProject((current) => (current ? { ...current, fullDomain } : current));
    setSuccess("Full domain generated from the database.");
  };

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleProjects = (projects ?? []).filter((item) => !normalizedFilter || item.name.toLowerCase().includes(normalizedFilter));
  const currentProject = project?.id === projectId ? project : null;
  const domains = currentProject?.domains ?? [];
  const visibleDomains = domains.filter((item) => !normalizedFilter || item.name.toLowerCase().includes(normalizedFilter));
  const selectedDomain = domains.find((item) => item.id === domainId);

  const noticeNode = notice && (
    <p
      className={notice.kind === "error" ? "metadata-alert" : "project-builder-notice"}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      {notice.text}
    </p>
  );

  const renderContent = () => {
    if (creating === "project") {
      return (
        <section className="project-builder-section" aria-label="New project">
          <ProjectOnboarding
            onCompleted={(createdProjectId, createdDomainId) => {
              setCreating(null);
              navigate(metadataPath(DOMAINS_PATH, { projectId: createdProjectId, domainId: createdDomainId }));
            }}
            onCancel={() => setCreating(null)}
          />
        </section>
      );
    }
    if (!projectId) {
      return (
        <div className="metadata-empty">
          <Icon name="folder" size={32} />
          <p>
            {projects?.length
              ? "Select a project to manage its full domain and sub-domains."
              : "Create a project to start defining its full domain and sub-domains."}
          </p>
        </div>
      );
    }
    if (!currentProject) {
      return <p className="metadata-message">{projectLoading ? "Loading project…" : "Project not found."}</p>;
    }
    if (creating === "domain") {
      return (
        <SubDomainEditor
          key="new-sub-domain"
          projectId={currentProject.id}
          fullDomain={currentProject.fullDomain}
          domain={null}
          onSaved={handleDomainSaved}
          onDeleted={handleDomainDeleted}
          onDirtyChange={handleDirtyChange}
          onError={setError}
        />
      );
    }
    if (domainId) {
      if (!selectedDomain) return <p className="metadata-alert" role="alert">Sub-domain not found in this project.</p>;
      return (
        <SubDomainEditor
          key={selectedDomain.id}
          projectId={currentProject.id}
          fullDomain={currentProject.fullDomain}
          domain={selectedDomain}
          onSaved={handleDomainSaved}
          onDeleted={handleDomainDeleted}
          onDirtyChange={handleDirtyChange}
          onError={setError}
        />
      );
    }
    return (
      <>
        <section className="project-builder-section" aria-label="Project settings">
          <div className="project-builder-section-head">
            <div>
              <span className="section-kicker">PROJECT</span>
              <h3>{currentProject.name}</h3>
            </div>
          </div>
          <ProjectForm
            key={currentProject.id}
            project={currentProject}
            onSaved={handleProjectSaved}
            onDeleted={handleProjectDeleted}
            onDirtyChange={handleDirtyChange}
            onError={setError}
          />
        </section>
        <FullDomainPanel
          key={`full-domain-${currentProject.id}`}
          projectId={currentProject.id}
          fullDomain={currentProject.fullDomain}
          onGenerated={handleFullDomainGenerated}
          onError={setError}
        />
      </>
    );
  };

  return (
    <section className="metadata-workspace project-builder-workspace" style={panel.style}>
      <aside className="metadata-list project-builder-nav" aria-label="Projects and sub-domains">
        <div className="project-builder-nav-head">
          <span className="section-kicker">PROJECTS</span>
          <span className="tab-number">{projects?.length ?? 0}</span>
          <button
            className="icon-button definition-action-button create"
            type="button"
            title="Create project"
            aria-label="Create project"
            onClick={() => void startCreate("project")}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <label className="metadata-search">
          <Icon name="search" size={14} />
          <input
            type="text"
            value={filter}
            placeholder="Search projects and sub-domains"
            spellCheck={false}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <nav className="project-builder-list" aria-label="Projects">
          {visibleProjects.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`metadata-entity${item.id === projectId ? " active" : ""}`}
              aria-pressed={item.id === projectId}
              onClick={() => selectProject(item.id)}
            >
              <Icon name="folder" size={15} />
              <span>
                <b>{item.name}</b>
                <small>{item.dbConnectionProfile || "No connection profile"}</small>
              </span>
            </button>
          ))}
          {projects && visibleProjects.length === 0 && (
            <p className="metadata-message">{projects.length ? "No matching projects." : "No projects yet."}</p>
          )}
        </nav>
        {currentProject && (
          <>
            <div className="project-builder-nav-head">
              <span className="section-kicker">SUB-DOMAINS</span>
              <span className="tab-number">{domains.length}</span>
              <button
                className="icon-button definition-action-button create"
                type="button"
                title="Create sub-domain"
                aria-label="Create sub-domain"
                onClick={() => void startCreate("domain")}
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
            <nav className="project-builder-list" aria-label="Sub-domains">
              {visibleDomains.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`metadata-entity${item.id === domainId && creating !== "domain" ? " active" : ""}`}
                  aria-pressed={item.id === domainId}
                  onClick={() => selectDomain(item.id)}
                >
                  <Icon name="table" size={15} />
                  <span>
                    <b>{item.name}</b>
                    <small>{item.entities.length} exposed entities</small>
                  </span>
                </button>
              ))}
              {domains.length === 0 && <p className="metadata-message">No sub-domains yet.</p>}
            </nav>
          </>
        )}
      </aside>
      <PanelSplitter panel={panel} label="projects panel" />
      <div className="metadata-editor project-builder-main">
        {noticeNode}
        {renderContent()}
      </div>
    </section>
  );
}
