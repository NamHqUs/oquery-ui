import { CodeBlock, Callout } from "../doc-blocks";

export default function QuickstartContent() {
  return (
    <>
      <h3 className="doc-subhead">1. Install the package</h3>
      <CodeBlock language="PowerShell">{`dotnet add package OQuery`}</CodeBlock>

      <h3 className="doc-subhead">2. Describe the metadata</h3>
      <CodeBlock language="C#">{`var metadata = new[]
{
    new Entity("User", Fields: [
        new Field("Id"),
        new Field("Name"),
        new Field("Age")
    ])
};`}</CodeBlock>

      <h3 className="doc-subhead">3. Create the engine and query</h3>
      <CodeBlock language="C#">{`using var db = new OQueryEngine(connection, new MetadataProvider(metadata));

var rows = db.Query("User")
    .Where(user => user["Age"] >= 18)
    .Select("Name", "Age")
    .ToList();`}</CodeBlock>

      <Callout>
        <strong>Safe by default.</strong> Values become database parameters. Only trusted metadata, such as table names and raw SQL expressions, is rendered as SQL.
      </Callout>
    </>
  );
}
