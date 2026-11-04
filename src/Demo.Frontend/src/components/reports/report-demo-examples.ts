export type ReportDemoExampleKey = "products" | "traversal" | "recursive" | "revenue";

export type ReportDemoExample = {
  key: ReportDemoExampleKey;
  title: string;
  oquery: string;
};

export const reportDemoExamples: ReportDemoExample[] = [
  {
    key: "products",
    title: "How do I explore a product?",
    oquery: "Products: Id, Name, Category, UnitPrice, CostPrice",
  },
  {
    key: "traversal",
    title: "How do I follow a relationship?",
    oquery: "Orders: Id, OrderDate, User.FirstName, User.LastName",
  },
  {
    key: "recursive",
    title: "How big is your organization really?",
    oquery: `EmployeeTree is Employees: FirstName | ManagerName,
    member.FirstName | MemberName
  INNER JOIN EmployeeTree member on Id = member.ManagerId`,
  },
  {
    key: "revenue",
    title: "Which products sell above average?",
    oquery: `ProductSales is OrderItems: ProductId,
     SUM(Quantity * UnitPrice) | TotalRevenue
  GROUP BY ProductId

Products: Id, Name,
     ProductSales.TotalRevenue
  INNER JOIN ProductSales on Id = ProductSales.ProductId
  WHERE ProductSales.TotalRevenue >
    (AVG(ProductSales.TotalRevenue))`,
  },
];
