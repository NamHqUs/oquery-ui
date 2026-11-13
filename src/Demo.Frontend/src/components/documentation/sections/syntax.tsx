import { CodeBlock, Callout } from "../doc-blocks";

export default function SyntaxContent() {
  return (
    <>
      <CodeBlock language="OQuery">{`// Select every exposed field
// Equivalent intent: SELECT * FROM Users
Users

// Select fields and traverse a metadata relationship
Users: Id, Name, Manager.Name

// Filter, sort, and page with SQL-style intent
Users: Id, Name
  Where Status = <Active>
  Order Name ASC
  Skip 0
  Take 25

// Alias expressions with the expression-first pipe
Users: Id, Count(Members.Id) TotalMembers`}</CodeBlock>

      <Callout>
        <strong>One rule to remember:</strong> the expression is on the left of <code>|</code>, and its result name is on the right. <code>as</code> and a plain space also work.
      </Callout>
    </>
  );
}
