import type { ReactNode } from "react";
import Icon from "../../icon/icon";
import "./domain-wizard.css";

export type WizardStep = 1 | 2 | 3;

type DomainWizardProps = {
  mode: "create" | "edit";
  domainDisplayName?: string;
  step: WizardStep;
  canContinue: boolean;
  canNavigateToStep: (step: WizardStep) => boolean;
  saving: boolean;
  error?: string;
  onStepChange: (step: WizardStep) => void;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
  children: ReactNode;
};

const EDIT_STEPS = ["Database", "Design entities", "Apply changes"];
const CREATE_STEPS = ["Entities", "Review", "Create domain"];

export default function DomainWizard({
  mode,
  domainDisplayName,
  step,
  canContinue,
  canNavigateToStep,
  saving,
  error,
  onStepChange,
  onBack,
  onNext,
  onCancel,
  children,
}: DomainWizardProps) {
  const labels = mode === "edit" ? EDIT_STEPS : CREATE_STEPS;
  return (
    <div className="domain-wizard">
      <header className="domain-wizard-header">
        <div>
          <h3>{mode === "edit" ? "Edit domain" : "New domain"}</h3>
          {mode === "edit" && domainDisplayName && <strong className="domain-wizard-current-domain">{domainDisplayName}</strong>}
          <p>{mode === "edit"
            ? "Connect the database, choose its tables, then apply the changes to the Main domain."
            : "Choose entities from the Main domain, review them, then create a domain."}</p>
        </div>
        <div className="domain-wizard-header-actions">
          <span className="domain-progress">STEP {step} OF 3</span>
          <button type="button" className="domain-cancel-button" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
      </header>
      {error && <p className="domain-error" role="alert">{error}</p>}
      <nav className="domain-steps" aria-label={`Domain ${mode} steps`}>
        {labels.map((label, index) => {
          const number = (index + 1) as WizardStep;
          const state = step === number ? "active" : step > number ? "complete" : "";
          return (
            <button key={label} type="button" className={state} onClick={() => onStepChange(number)} disabled={!canNavigateToStep(number) || saving}>
              <strong>{step > number ? <Icon name="check" size={12} /> : number}</strong>
              <span><b>{label}</b></span>
            </button>
          );
        })}
      </nav>
      <div className="domain-step-panel">{children}</div>
      <footer className="domain-wizard-footer">
        <button type="button" className="domain-secondary" onClick={onBack} disabled={step === 1 || saving}>
          <Icon name="arrow-left" size={14} /> Back
        </button>
        <button type="button" className="domain-primary" onClick={onNext} disabled={step === 3 || !canContinue || saving}>
          Next
        </button>
      </footer>
    </div>
  );
}
