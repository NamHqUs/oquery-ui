import { useEffect, useState, type ReactNode } from "react";
import Icon from "../../icon/icon";
import "./domain-wizard.css";

export type WizardStep = 1 | 2 | 3;
export type WizardSource = "database" | "file";

type DomainWizardProps = {
  mode?: "create" | "edit";
  domainDisplayName?: string;
  source: WizardSource;
  step: WizardStep;
  canContinue: boolean;
  saving: boolean;
  error?: string;
  onStepChange: (step: WizardStep) => void;
  onSourceChange: (source: WizardSource) => void | Promise<void>;
  onBack: () => void;
  onNext: () => void;
  onGenerate: () => void;
  children: ReactNode;
};

export default function DomainWizard({
  mode = "create",
  domainDisplayName,
  source,
  step,
  canContinue,
  saving,
  error,
  onStepChange,
  onSourceChange,
  onBack,
  onNext,
  onGenerate,
  children,
}: DomainWizardProps) {
  const steps = mode === "edit"
    ? [["1", "Append Sources", "Existing and new tables or entities"], ["2", "Design entities", "Existing and new entity fields"], ["3", "Apply changes", "Review domain updates"]]
    : [["1", "Source", "Database or file"], ["2", "Design entities", "Entity fields and relations"], ["3", "Generate", "Domain identity"]];
  const finalStep = 3;
  const [railFloating, setRailFloating] = useState(false);
  const [railLeft, setRailLeft] = useState<number | null>(null);
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".domain-wizard-sidebar");
    setRailLeft(sidebar?.getBoundingClientRect().left ?? 22);
    const updateRailPosition = () => {
      const documentScrollTop = document.scrollingElement?.scrollTop ?? 0;
      setRailFloating(Math.max(window.scrollY, document.documentElement.scrollTop, documentScrollTop) > 220);
    };
    updateRailPosition();
    window.addEventListener("scroll", updateRailPosition, { passive: true });
    document.addEventListener("scroll", updateRailPosition, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", updateRailPosition);
      document.removeEventListener("scroll", updateRailPosition, { capture: true });
    };
  }, []);

  return (
    <div className="domain-wizard">
      <header className="domain-wizard-header">
        <div>
          <h3>{mode === "edit" ? "Edit domain" : "New domain"}</h3>
          {mode === "edit" && domainDisplayName && <strong className="domain-wizard-current-domain">{domainDisplayName}</strong>}
          <p>{mode === "edit" ? "Update this existing domain by adding or removing entities, then apply the changes to the diagram." : "Choose a source, prepare its entities, and generate query-ready metadata."}</p>
        </div>
        <div className="domain-wizard-header-actions">
          <span className="domain-progress">STEP {step} OF {finalStep}</span>
        </div>
      </header>
      <div className="domain-source-picker" role="group" aria-label="Domain metadata source">
        <button type="button" className={source === "database" ? "active" : ""} onClick={() => void onSourceChange("database")}>
          <strong>Database</strong><small>{mode === "edit" ? "Append tables from the connected database" : "Choose tables from a connected database"}</small>
        </button>
        <button type="button" className={source === "file" ? "active" : ""} onClick={() => void onSourceChange("file")}>
          <strong>JSON or YAML</strong><small>{mode === "edit" ? "Append entities from an existing file" : "Upload existing domain metadata"}</small>
        </button>
      </div>
      {error && <p className="domain-error" role="alert">{error}</p>}
      <div className="domain-wizard-body">
        <aside
          className={`domain-wizard-sidebar${railFloating ? " is-floating" : ""}`}
          style={railFloating && railLeft !== null ? { left: `${railLeft}px` } : undefined}
        >
          <div className="domain-steps" aria-label={`Domain ${mode} steps`}>
            {steps.map(([number, label, description]) => (
              <button key={number} type="button" className={step === Number(number) ? "active" : step > Number(number) ? "complete" : ""} onClick={() => Number(number) <= step && onStepChange(Number(number) as WizardStep)} disabled={Number(number) > step}>
                <strong>{step > Number(number) ? "✓" : number}</strong><span><b>{label}</b><small>{description}</small></span>
              </button>
            ))}
          </div>
          <footer className="domain-wizard-footer">
            <button type="button" className="domain-secondary" onClick={onBack} disabled={step === 1 || saving}><Icon name="arrow-left" size={14} /> Back</button>
            <button type="button" className="domain-primary" onClick={onNext} disabled={step === finalStep || !canContinue || saving}>Next <Icon name="arrow-right" size={14} /></button>
          </footer>
        </aside>
        <div className="domain-step-panel">{children}</div>
      </div>
    </div>
  );
}
