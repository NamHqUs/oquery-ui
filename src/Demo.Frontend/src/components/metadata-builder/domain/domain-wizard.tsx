import { useEffect, useState, type ReactNode } from "react";
import Icon from "../../icon/icon";
import "./domain-wizard.css";

export type WizardStep = 1 | 2 | 3 | 4;
export type WizardSource = "database" | "file";

type DomainWizardProps = {
  source: WizardSource;
  step: WizardStep;
  canContinue: boolean;
  saving: boolean;
  error?: string;
  onStepChange: (step: WizardStep) => void;
  onBack: () => void;
  onNext: () => void;
  onGenerate: () => void;
  children: ReactNode;
};

export default function DomainWizard({
  source,
  step,
  canContinue,
  saving,
  error,
  onStepChange,
  onBack,
  onNext,
  onGenerate,
  children,
}: DomainWizardProps) {
  const steps = source === "database"
    ? [["1", "Connect", "Database connection"], ["2", "Tables", "Data sources"], ["3", "Entities", "Entity design"], ["4", "Generate", "Domain identity"]]
    : [["1", "Upload", "JSON or YAML"], ["2", "Entities", "Entity design"], ["3", "Generate", "Domain identity"]];
  const finalStep = source === "database" ? 4 : 3;
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
        <div><span className="section-kicker">BUSINESS LOGIC</span><h3>New domain</h3><p>Connect a database, choose its source tables, design entities, and generate query-ready metadata.</p></div>
        <span className="domain-progress">STEP {step} OF {finalStep}</span>
      </header>
      {error && <p className="domain-error" role="alert">{error}</p>}
      <div className="domain-wizard-body">
        <aside
          className={`domain-wizard-sidebar${railFloating ? " is-floating" : ""}`}
          style={railFloating && railLeft !== null ? { left: `${railLeft}px` } : undefined}
        >
          <div className="domain-steps" aria-label="Domain creation steps">
            {steps.map(([number, label, description]) => (
              <button key={number} type="button" className={step === Number(number) ? "active" : step > Number(number) ? "complete" : ""} onClick={() => Number(number) <= step && onStepChange(Number(number) as WizardStep)} disabled={Number(number) > step}>
                <strong>{step > Number(number) ? "✓" : number}</strong><span><b>{label}</b><small>{description}</small></span>
              </button>
            ))}
          </div>
          <footer className="domain-wizard-footer">
            <button type="button" className="domain-secondary" onClick={onBack} disabled={step === 1 || saving}><Icon name="arrow-left" size={14} /> Back</button>
            {step < finalStep && <button type="button" className="domain-primary" onClick={onNext} disabled={!canContinue}>Continue <Icon name="arrow-right" size={14} /></button>}
            {step === finalStep && <button type="button" className="domain-primary" onClick={onGenerate} disabled={saving || !canContinue}>{saving ? "Generating…" : "Generate metadata"} <Icon name="arrow-right" size={14} /></button>}
          </footer>
        </aside>
        <div className="domain-step-panel">{children}</div>
      </div>
    </div>
  );
}
