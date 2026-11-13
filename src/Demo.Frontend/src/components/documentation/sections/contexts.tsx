import { CodeBlock, Callout } from "../doc-blocks";

export default function ContextsContent() {
  return (
    <>
      <CodeBlock language="OQuery">{`Products: Id, Name,
  RevenueByMonth.Month | Month,
  RevenueByMonth.Revenue | Revenue
  Left Join RevenueByMonth On Id = RevenueByMonth.ProductId
  Order Revenue DESC
  Take 20

RevenueByMonth is InvoiceLines: ProductId,
  MonthKey(Invoice.IssueDate) | Month,
  Sum(Quantity * UnitPrice) | Revenue,
  CountDistinct(InvoiceId) | Orders
  Where Invoice.Status = <Paid>`}</CodeBlock>

      <CodeBlock language="OQuery">{`// A dependent context can use another context privately
User: Id, ref2.Name | Manager2
  Left Join ref2 On ManagerId = ref2.Id

ref1 is User: Id, Name

ref2 is User: Id, Name, ManagerId
  Left Join ref1 On ManagerId = ref1.Id`}</CodeBlock>

      <Callout icon="play">
        <strong>Test in layers.</strong> Select and execute <code>RevenueByMonth is InvoiceLines: ProductId, Sum(Quantity * UnitPrice) | Revenue</code> by itself, then run the product query.
      </Callout>
    </>
  );
}
