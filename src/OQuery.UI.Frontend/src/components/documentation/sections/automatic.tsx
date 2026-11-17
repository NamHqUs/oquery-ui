import Icon from "../../icon/icon";
import { CodeBlock, InfoCard } from "../doc-blocks";

export default function AutomaticContent() {
  return (
    <>
      <CodeBlock language="OQuery">{`// Relation traversal becomes an automatic join
Users: Id, Name, Manager.Name

// Aggregate projection establishes the result grain
Users: Id, Name, Count(Members.Id) TotalMembers

// Aggregate aliases are routed to HAVING
Users: Id, Name, Count(Members.Id) TotalMembers
  Where TotalMembers > 12`}</CodeBlock>

      <div className="doc-cards cols-3">
        <InfoCard icon={<Icon name="schema" size={16} />} title="Traversal">
          Follow a metadata relationship such as <code>Manager.Name</code> without hand-writing the join.
        </InfoCard>
        <InfoCard icon={<Icon name="chart-bar" size={16} />} title="Grouping">
          Mix fields and aggregates. The compiler determines the grouping grain.
        </InfoCard>
        <InfoCard icon={<Icon name="sliders" size={16} />} title="HAVING">
          Filter an aggregate alias naturally. The compiler places it at the group level.
        </InfoCard>
      </div>
    </>
  );
}
