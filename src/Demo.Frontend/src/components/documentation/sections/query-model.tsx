import { CodeBlock, InfoCard } from "../doc-blocks";

export default function QueryModelContent() {
  return (
    <div className="doc-cards">
      <InfoCard icon={<span className="doc-card-letter">A</span>} title="C# expressions">
        Ideal for application-defined queries and reusable base queries.
        <CodeBlock language="C#">{`db.Query("Order").Where(...)`}</CodeBlock>
      </InfoCard>
      <InfoCard icon={<span className="doc-card-letter">B</span>} title="JSON query definition">
        Use as the transport model for a REST API or a frontend query builder.
        <CodeBlock language="JSON">{`{
  "entity": "Order",
  "projection": [
    { "field": { "kind": "field", "field": "Id" } }
  ],
  "take": 50
}`}</CodeBlock>
      </InfoCard>
      <InfoCard icon={<span className="doc-card-letter">C</span>} title="OQuery text">
        Store readable saved queries with traversal, aggregates, joins, and reusable contexts.
        <CodeBlock language="OQuery">{`Users: Id, Name, Manager.Name
  Take 50`}</CodeBlock>
      </InfoCard>
    </div>
  );
}
