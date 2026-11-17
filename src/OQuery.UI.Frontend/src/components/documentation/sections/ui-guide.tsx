import { CodeBlock, Callout, InfoCard } from "../doc-blocks";

export default function UiGuideContent() {
  return (
    <>
      <div className="doc-cards cols-3">
        <InfoCard icon={<span className="doc-card-letter">01</span>} title="Choose metadata">
          Open Data sources and inspect entities, fields, and relationships before writing a query.
        </InfoCard>
        <InfoCard icon={<span className="doc-card-letter">02</span>} title="Write the intent">
          Open Query Builder and start with <code>Users</code>. Add fields, traversal, filters, and aggregates.
        </InfoCard>
        <InfoCard icon={<span className="doc-card-letter">03</span>} title="Test a scope">
          Select a complete root or context block, then press Run Query to execute only that definition.
        </InfoCard>
      </div>

      <CodeBlock language="Editor keys">{`Tab          increase indentation
Shift + Tab  decrease indentation
Ctrl + X     delete selected rows
Ctrl + /     toggle line comments
Ctrl + Z     undo the edit
Ctrl + Y     redo the edit`}</CodeBlock>

      <Callout icon="play">
        <strong>Inspect before you trust.</strong> Use Get SQL to see the generated parameterized statement, then run the query against the connected provider.
      </Callout>
    </>
  );
}
