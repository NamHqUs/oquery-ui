import { CodeBlock, Callout } from "../doc-blocks";

export default function ContextsContent() {
  return (
    <>
      <CodeBlock language="OQuery">{`      Products:
  Left Join RevenueByMonth On Id = RevenueByMonth.ProductId
          Id, Name,
          RevenueByMonth.Month | Month,
          RevenueByMonth.Revenue | Revenue
  Order Revenue DESC
  Take 20

RevenueByMonth is InvoiceLines: ProductId,
  MonthKey(Invoice.IssueDate) | Month,
  Sum(Quantity * UnitPrice) | Revenue,
  Count(distinct InvoiceId) | Orders
  Where Invoice.Status = <Paid>`}</CodeBlock>

      <CodeBlock language="OQuery">{`// A dependent context can use another context privately
      User:
  Left Join ref2 On ManagerId = ref2.Id
          Id, ref2.Name | Manager2

ref1 is User: Id, Name

      ref2 is User:
        Left Join ref1 On ManagerId = ref1.Id
          Id, Name, ManagerId`}</CodeBlock>

      <Callout icon="play">
        <strong>Test in layers.</strong> Select and execute <code>RevenueByMonth is InvoiceLines: ProductId, Sum(Quantity * UnitPrice) | Revenue</code> by itself, then run the product query.
      </Callout>
    </>
  );
}
