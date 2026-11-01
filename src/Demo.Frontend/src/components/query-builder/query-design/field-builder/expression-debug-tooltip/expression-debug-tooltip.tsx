import type { IFieldDefinition } from "../../query-builder-slice";
import "./expression-debug-tooltip.css";

type ExpressionDebugTooltipProps = {
  label: string;
  model: IFieldDefinition;
};

export default function ExpressionDebugTooltip({ label, model }: ExpressionDebugTooltipProps) {
  return (
    <div className="expression-debug-tooltip" role="tooltip">
      <strong>{label}</strong>
      <pre><code>{JSON.stringify(model, null, 2)}</code></pre>
    </div>
  );
}
