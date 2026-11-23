# Built-in function examples x dialect report

Test: `BuiltinFunctionExamplesTests` (`src/OQuery.UI.UnitTest/Tests/Providers/BuiltinFunctionExamplesTests.cs`).

Each example from `builtin-function-catalog.json` runs on all 9 dialects against the demo data (`Examples_Domain.json` + `INSURANCE_DOMAIN.json`). A cell passes when the result matches the SQLite result for the same query, compared by value:

- numbers rounded to 2 decimals;
- dates compared as `yyyy-MM-dd`;
- booleans as 1/0;
- row order ignored.

SQLite is the reference, so its column passes whenever the query runs.

Final run: **378/378 passed** (42 examples x 9 dialects).

| Builtin Function | Example | Sqlite | SqlServer | Postgres | Cockroach | MariaDb | Oracle | Db2 | Firebird | SapHana |
|---|---|---|---|---|---|---|---|---|---|---|
| Count | `Customers: City, Count() CustomerCount, Count(LastName) NamedCustomerCount` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Sum | `OrderItems: ProductId, Sum(Quantity * UnitPrice) Revenue` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Avg | `OrderItems: ProductId, Avg(UnitPrice) AveragePrice` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Max | `OrderItems: ProductId, Max(UnitPrice) HighestPrice` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Min | `OrderItems: ProductId, Min(UnitPrice) LowestPrice` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| CountIf | `Orders: Channel, CountIf(Status = <Open>) OpenOrders` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| SumIf | `OrderItems: ProductId, SumIf(Quantity, DiscountAmount > <0>) DiscountedQuantity` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| AvgIf | `OrderItems: ProductId, AvgIf(UnitPrice, Quantity >= <5>) BulkUnitPrice` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MinIf | `OrderItems: ProductId, MinIf(UnitPrice, Quantity >= <5>) LowestBulkPrice` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MaxIf | `OrderItems: ProductId, MaxIf(UnitPrice, DiscountAmount > <0>) HighestDiscountedPrice` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MedicalLossRatio | `InsurancePlans: Tier, MedicalLossRatio(Deductible, MonthlyPremium) LossRatioPercent` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| CountOver | `Seller: Id, DepartmentId, CountOver(Id, DepartmentId) DepartmentHeadcount` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| SumOver | `Seller: Id, DepartmentId, Salary, SumOver(Salary, DepartmentId) DepartmentPayroll` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| AverageOver | `Seller: Id, DepartmentId, Salary, AverageOver(Salary, DepartmentId) DepartmentAverageSalary` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MaxOver | `Seller: Id, DepartmentId, Salary, MaxOver(Salary, DepartmentId) DepartmentMaximumSalary` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MinOver | `Seller: Id, DepartmentId, Salary, MinOver(Salary, DepartmentId) DepartmentMinimumSalary` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Lag | `OrderItems: Id, UnitPrice, Lag(UnitPrice, <1>, Id) PreviousUnitPrice` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| WindowSum | `OrderItems: Id, Quantity, WindowSum(Quantity, Id) RunningQuantity` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Rank | `OrderItems: Id, Rank(ProductId, UnitPrice) PriceRankInProduct` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| RowNumber | `Orders: Id, UserId, OrderDate, RowNumber(UserId, Id) OrderSequenceNewestFirst` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| NullIf | `OrderItems: Id, NullIf(Quantity, <0>) NonZeroQuantity` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| IfNull | `Seller: Id, FirstName, IfNull(Salary, <0>) SalaryOrZero` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Concat | `Seller: Id, Concat(LastName, <,>, FirstName) FullName` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MonthKey | `Orders: OrderDate.MonthKey() OrderMonth, Count() OrderCount` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Day | `Seller: Id, HireDate.Day() HireDay` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Month | `Seller: Id, HireDate.Month() HireMonth` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Year | `Seller: Id, HireDate.Year() HireYear` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| DateSub | `Seller: Id, HireDate.DateSub(<2025-10-31>) TenureDays` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| DateAdd | `Orders: Id, OrderDate.DateAdd(<30>) DueDate` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MonthSub | `Seller: Id, HireDate.MonthSub(<2025-10-31>) MonthBoundaries` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MonthAdd | `Orders: Id, OrderDate.MonthAdd(<12>) RenewalDate` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| YearSub | `Seller: Id, HireDate.YearSub(<2025-10-31>) YearBoundaries` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| YearAdd | `Orders: Id, OrderDate.YearAdd(<2>) ExpiryDate` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| ElapsedYears | `Seller: Id, HireDate.ElapsedYears(<2025-10-31>) ServiceYears` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| YearsTo | `Seller: Id, HireDate.YearsTo(<2025-10-31>) CompletedYears` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MonthsTo | `Seller: Id, HireDate.MonthsTo(<2025-10-31>) CompletedMonths` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| DaysTo | `Seller: Id, HireDate.DaysTo(<2025-10-31>) CompletedDays` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| YearsToNow | `Seller: Id, HireDate.YearsToNow() TenureYears` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| MonthsToNow | `Seller: Id, HireDate.MonthsToNow() TenureMonths` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| DaysToNow | `Orders: Id, OrderDate.DaysToNow() DaysOld` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Any | `Customers: Id, FirstName, Orders.Any(Status = <Open>) HasOpenOrders` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| NotAny | `Customers: Id, FirstName, Orders.NotAny() HasNoOrders` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Examples adapted from the catalog

The catalog uses fields that the demo data does not have. Each adapted example keeps the same function and shape on the closest demo fields:

- `Count`: `Region`, `Email` to `City`, `LastName`.
- `CountIf`: `Customers.Status` to `Orders.Status` and `Orders.Channel`.
- `SumIf`, `MaxIf`: `TotalAmount` and `Status` to `OrderItems.DiscountAmount`.
- `MedicalLossRatio`: `Plans`, `ClaimsPaid`, `PremiumRevenue` to `InsurancePlans.Deductible`, `MonthlyPremium`.
- `CountOver` to `MinOver`, `Day` to `Year`, `DateSub` to `YearsToNow`, `Concat`, `IfNull`: `Employees` to `Seller`. `IfNull` uses `Salary`.
- `Lag`, `WindowSum`, `Rank`, `RowNumber`, `NullIf`: `TotalAmount`, `CustomerId`, `CategoryId`, `Amount` to `OrderItems`/`Orders` fields.
- `MonthKey`: `Sum(TotalAmount)` to `Count()`.
- `MonthAdd`, `YearAdd`: `Subscriptions`, `Contracts` to `Orders.OrderDate`.
- `DaysToNow`: `Invoices.DueDate` to `Orders.OrderDate`.
- `RowNumber`: ordered by `Id` instead of `OrderDate`, because `OrderDate` has ties and row numbers are then not deterministic.

`Any` and `NotAny` keep the catalog examples unchanged.

## Bugs fixed in this round

| Dialect | Function | Problem | Fix |
| --- | --- | --- | --- |
| MariaDb | `MonthSub`, `YearSub` | `TIMESTAMPDIFF` counts completed units, not the calendar boundaries the description states; `YearSub` was one year low, which also made `MonthsToNow` off by one | Calendar-boundary formulas, same as the other dialects |
| Firebird | `MonthSub`, `YearSub`, `MonthsTo`, `MonthsToNow` | `EXTRACT` on an untyped date literal failed | `CAST(... AS DATE)` on each date part |
| Firebird | `Concat` | The separator argument was ignored, and an untyped parameter in `||` was rejected | `({1} || CAST({2} AS VARCHAR(1024)) || {3})` |
| DB2 | `MonthSub`, `YearSub`, `MonthsTo`, `Day`, `Month`, `Year` | `YEAR`/`DAY` on an untyped date literal were ambiguous (SQL0245N) | `CAST(... AS DATE)` in each date part |
| Oracle | `ElapsedYears` | No override, so the SQL Server `DATEDIFF` template was used | Override with date subtraction. The driver failed to read the unrounded result, so the expression is wrapped in `ROUND(..., 10)` |

Earlier fixes from the first matrix round are still in place (see `builtin-function-dialect-matrix.md`).

## Caveats

- SQLite is the reference, so its column only proves that the examples run on SQLite.
- The `*ToNow` examples depend on the current date. Compared dialects run within the same test run, so they should agree.
- Values are rounded to 2 decimals. A rounding-boundary difference smaller than 0.005 would not be detected.
- Oracle, SAP HANA, and Firebird demo tables were loaded by hand in the containers (see the first matrix report). They were not created by compose on reused volumes.
