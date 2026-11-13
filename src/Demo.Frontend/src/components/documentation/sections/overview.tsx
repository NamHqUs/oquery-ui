import Icon from "../../icon/icon";
import { InfoCard } from "../doc-blocks";

export default function OverviewContent() {
  return (
    <div className="doc-cards cols-3">
      <InfoCard icon={<Icon name="schema" size={16} />} title="Runtime metadata">
        Define entities, fields, and relationships from configuration or a catalog.
      </InfoCard>
      <InfoCard icon={<Icon name="query" size={16} />} title="Query intent">
        Write compact OQuery text, or use C# and JSON with the same compiler.
      </InfoCard>
      <InfoCard icon={<Icon name="database" size={16} />} title="Provider aware">
        Render the same query for the database engine selected by your connection.
      </InfoCard>
    </div>
  );
}
