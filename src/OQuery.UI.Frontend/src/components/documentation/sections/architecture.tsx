const STEPS = [
  "Metadata + query input",
  "Expression visitors",
  "Dialect-independent SQL IR",
  "SQL + parameters",
  "ADO.NET execution",
];

export default function ArchitectureContent() {
  return (
    <ol className="doc-flow" aria-label="Query pipeline">
      {STEPS.map((step, index) => (
        <li key={step} className="doc-flow-step">
          <span className="doc-flow-number">{String(index + 1).padStart(2, "0")}</span>
          <strong>{step}</strong>
          {index < STEPS.length - 1 && <i className="doc-flow-arrow" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
