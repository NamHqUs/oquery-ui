import { useEffect, useState, type ReactNode } from "react";
import Icon from "../../icon/icon";
import "./business-scope-wizard.css";

export type WizardStep = 1 | 2 | 3;

type BusinessScopeWizardProps = {
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

export default function BusinessScopeWizard({
  step,
  canContinue,
  saving,
  error,
  onStepChange,
  onBack,
  onNext,
  onGenerate,
  children,
}: BusinessScopeWizardProps) {
  const [railFloating, setRailFloating] = useState(false);
  const [railLeft, setRailLeft] = useState<number | null>(null);
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".business-scope-wizard-sidebar");
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
    <div className="business-scope-wizard">
      <header className="business-scope-wizard-header">
        <div><span className="section-kicker">BUSINESS LOGIC</span><h3>New business scope</h3><p>Define the scope, choose its source tables, and generate query-ready metadata.</p></div>
        <span className="business-scope-progress">STEP {step} OF 3</span>
      </header>
      {error && <p className="business-scope-error" role="alert">{error}</p>}
      <div className="business-scope-wizard-body">
        <aside
          className={`business-scope-wizard-sidebar${railFloating ? " is-floating" : ""}`}
          style={railFloating && railLeft !== null ? { left: `${railLeft}px` } : undefined}
        >
          <div className="business-scope-steps" aria-label="Business scope creation steps">
            {[["1", "Name", "Scope identity"], ["2", "Tables", "Data sources"], ["3", "Generate", "Metadata preview"]].map(([number, label, description]) => (
              <button key={number} type="button" className={step === Number(number) ? "active" : step > Number(number) ? "complete" : ""} onClick={() => Number(number) <= step && onStepChange(Number(number) as WizardStep)} disabled={Number(number) > step}>
                <strong>{step > Number(number) ? "✓" : number}</strong><span><b>{label}</b><small>{description}</small></span>
              </button>
            ))}
          </div>
          <footer className="business-scope-wizard-footer">
            <button type="button" className="business-scope-secondary" onClick={onBack} disabled={step === 1 || saving}><Icon name="arrow-left" size={14} /> Back</button>
            {step < 3 && <button type="button" className="business-scope-primary" onClick={onNext} disabled={!canContinue}>Continue <Icon name="arrow-right" size={14} /></button>}
            {step === 3 && <button type="button" className="business-scope-primary" onClick={onGenerate} disabled={saving}>{saving ? "Generating…" : "Generate metadata"} <Icon name="arrow-right" size={14} /></button>}
          </footer>
        </aside>
        <div className="business-scope-step-panel">{children}</div>
      </div>
    </div>
  );
}
