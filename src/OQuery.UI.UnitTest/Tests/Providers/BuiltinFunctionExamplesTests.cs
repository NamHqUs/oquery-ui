using System.Data;
using System.Globalization;
using System.Text.RegularExpressions;
using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Tests.Providers;

[TestFixture]
[NonParallelizable]
internal sealed class BuiltinFunctionExamplesTests
{
    private const string ReferenceDialect = "Sqlite";
    private const string ExamplesDomain = "Examples_Domain.json";
    private const string InsuranceDomain = "INSURANCE_DOMAIN.json";

    private static readonly Regex IsoDate = new(@"^\d{4}-\d{2}-\d{2}", RegexOptions.Compiled);
    private static readonly Regex UsDate = new(@"^\d{2}/\d{2}/\d{4}$", RegexOptions.Compiled);

    private static readonly IReadOnlyList<DialectTarget> Dialects =
    [
        new("Sqlite", TestDatabase.GetNorthStarSqliteDockerConnection, () => new SqliteDialect(), UsesSchemas: true),
        new("SqlServer", TestDatabase.GetNorthStarSqlServerConnection, () => new SqlServerDialect(), UsesSchemas: true),
        new("Postgres", TestDatabase.GetNorthStarPostgresConnection, () => new PostgresDialect(), UsesSchemas: true),
        new("Cockroach", TestDatabase.GetNorthStarCockroachConnection, () => new CockroachDialect(), UsesSchemas: true),
        new("MariaDb", TestDatabase.GetNorthStarMariaConnection, () => new MariaDialect(), UsesSchemas: false),
        new("Oracle", TestDatabase.GetNorthStarOracleConnection, () => new OracleDialect(), UsesSchemas: false),
        new("Db2", TestDatabase.GetNorthStarDb2Connection, () => new Db2Dialect(), UsesSchemas: true),
        new("Firebird", TestDatabase.GetNorthStarFirebirdConnection, () => new FirebirdDialect(), UsesSchemas: false),
        new("SapHana", TestDatabase.GetNorthStarSapHanaConnection, () => new SapHanaDialect(), UsesSchemas: false),
    ];

    // One example per built-in function, taken from builtin-function-catalog.json. Where the catalog names
    // fields the demo data does not have, the example keeps the same function and shape on the closest demo fields.
    private static readonly IReadOnlyList<BuiltinExample> Examples =
    [
        new("Count", "Customers: City, Count() CustomerCount, Count(LastName) NamedCustomerCount"),
        new("Sum", "OrderItems: ProductId, Sum(Quantity * UnitPrice) Revenue"),
        new("Avg", "OrderItems: ProductId, Avg(UnitPrice) AveragePrice"),
        new("Max", "OrderItems: ProductId, Max(UnitPrice) HighestPrice"),
        new("Min", "OrderItems: ProductId, Min(UnitPrice) LowestPrice"),
        new("CountIf", "Orders: Channel, CountIf(Status = <Open>) OpenOrders"),
        new("SumIf", "OrderItems: ProductId, SumIf(Quantity, DiscountAmount > <0>) DiscountedQuantity"),
        new("AvgIf", "OrderItems: ProductId, AvgIf(UnitPrice, Quantity >= <5>) BulkUnitPrice"),
        new("MinIf", "OrderItems: ProductId, MinIf(UnitPrice, Quantity >= <5>) LowestBulkPrice"),
        new("MaxIf", "OrderItems: ProductId, MaxIf(UnitPrice, DiscountAmount > <0>) HighestDiscountedPrice"),
        new("MedicalLossRatio", "InsurancePlans: Tier, MedicalLossRatio(Deductible, MonthlyPremium) LossRatioPercent"),
        new("CountOver", "Seller: Id, DepartmentId, CountOver(Id, DepartmentId) DepartmentHeadcount"),
        new("SumOver", "Seller: Id, DepartmentId, Salary, SumOver(Salary, DepartmentId) DepartmentPayroll"),
        new("AverageOver", "Seller: Id, DepartmentId, Salary, AverageOver(Salary, DepartmentId) DepartmentAverageSalary"),
        new("MaxOver", "Seller: Id, DepartmentId, Salary, MaxOver(Salary, DepartmentId) DepartmentMaximumSalary"),
        new("MinOver", "Seller: Id, DepartmentId, Salary, MinOver(Salary, DepartmentId) DepartmentMinimumSalary"),
        new("Lag", "OrderItems: Id, UnitPrice, Lag(UnitPrice, <1>, Id) PreviousUnitPrice"),
        new("WindowSum", "OrderItems: Id, Quantity, WindowSum(Quantity, Id) RunningQuantity"),
        new("Rank", "OrderItems: Id, Rank(ProductId, UnitPrice) PriceRankInProduct"),
        new("RowNumber", "Orders: Id, UserId, OrderDate, RowNumber(UserId, Id) OrderSequenceNewestFirst"),
        new("NullIf", "OrderItems: Id, NullIf(Quantity, <0>) NonZeroQuantity"),
        new("IfNull", "Seller: Id, FirstName, IfNull(Salary, <0>) SalaryOrZero"),
        new("Concat", "Seller: Id, Concat(LastName, <,>, FirstName) FullName"),
        new("MonthKey", "Orders: OrderDate.MonthKey() OrderMonth, Count() OrderCount"),
        new("Day", "Seller: Id, HireDate.Day() HireDay"),
        new("Month", "Seller: Id, HireDate.Month() HireMonth"),
        new("Year", "Seller: Id, HireDate.Year() HireYear"),
        new("DateSub", "Seller: Id, HireDate.DateSub(<2025-10-31>) TenureDays"),
        new("DateAdd", "Orders: Id, OrderDate.DateAdd(<30>) DueDate"),
        new("MonthSub", "Seller: Id, HireDate.MonthSub(<2025-10-31>) MonthBoundaries"),
        new("MonthAdd", "Orders: Id, OrderDate.MonthAdd(<12>) RenewalDate"),
        new("YearSub", "Seller: Id, HireDate.YearSub(<2025-10-31>) YearBoundaries"),
        new("YearAdd", "Orders: Id, OrderDate.YearAdd(<2>) ExpiryDate"),
        new("ElapsedYears", "Seller: Id, HireDate.ElapsedYears(<2025-10-31>) ServiceYears"),
        new("YearsTo", "Seller: Id, HireDate.YearsTo(<2025-10-31>) CompletedYears"),
        new("MonthsTo", "Seller: Id, HireDate.MonthsTo(<2025-10-31>) CompletedMonths"),
        new("DaysTo", "Seller: Id, HireDate.DaysTo(<2025-10-31>) CompletedDays"),
        new("YearsToNow", "Seller: Id, HireDate.YearsToNow() TenureYears"),
        new("MonthsToNow", "Seller: Id, HireDate.MonthsToNow() TenureMonths"),
        new("DaysToNow", "Orders: Id, OrderDate.DaysToNow() DaysOld"),
        new("Any", "Customers: Id, FirstName, Orders.Any(Status = <Open>) HasOpenOrders"),
        new("NotAny", "Customers: Id, FirstName, Orders.NotAny() HasNoOrders"),
    ];

    private readonly Dictionary<string, Lazy<OQueryEngine>> _engines = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Lazy<Snapshot>> _references = new(StringComparer.OrdinalIgnoreCase);

    [OneTimeSetUp]
    public void SetUp()
    {
        var entities = LoadMetadata();

        foreach (var dialect in Dialects)
            _engines[dialect.Name] = new Lazy<OQueryEngine>(() => CreateEngine(dialect, entities));

        foreach (var example in Examples)
            _references[example.Function] = new Lazy<Snapshot>(() => Run(ReferenceDialect, example));
    }

    [OneTimeTearDown]
    public void TearDown()
    {
        foreach (var engine in _engines.Values.Where(engine => engine.IsValueCreated))
            engine.Value.Dispose();
    }

    public static IEnumerable<TestCaseData> ExampleCases()
        => from dialect in Dialects
           from example in Examples
           select new TestCaseData(dialect.Name, example.Function)
               .SetName($"{dialect.Name} / {example.Function}");

    [TestCaseSource(nameof(ExampleCases))]
    public void ExampleMatchesReferenceValues(string dialect, string function)
    {
        var example = Examples.Single(candidate => string.Equals(candidate.Function, function, StringComparison.OrdinalIgnoreCase));
        var expected = _references[function].Value;

        var actual = Run(dialect, example, expected.Columns);

        Assert.That(actual.Rows, Is.EqualTo(expected.Rows), $"{dialect}: {function} differs from {ReferenceDialect}\n{Diff(expected.Rows, actual.Rows)}");
    }

    private static string Diff(IReadOnlyList<string> expected, IReadOnlyList<string> actual)
    {
        var mismatches = Enumerable.Range(0, Math.Max(expected.Count, actual.Count))
            .Where(index => index >= expected.Count || index >= actual.Count || expected[index] != actual[index])
            .Take(3)
            .Select(index => $"  row {index}: expected [{(index < expected.Count ? expected[index] : "-")}] actual [{(index < actual.Count ? actual[index] : "-")}]");
        return $"rows: expected {expected.Count}, actual {actual.Count}\n{string.Join("\n", mismatches)}";
    }

    private Snapshot Run(string dialect, BuiltinExample example, IReadOnlyList<string>? columns = null)
    {
        var query = _engines[dialect].Value.QueryOqr(example.OQuery);
        List<Dictionary<string, object?>> rows;
        try
        {
            rows = query.ToList();
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException(
                $"{dialect}: {example.Function} failed. Generated SQL:\n{query.ToSql().CommandText}", exception);
        }
        if (rows.Count == 0)
            return new Snapshot([], []);

        // Compare by the reference's column names so every dialect is checked on the same values in the same order.
        var selected = columns ?? rows[0].Keys.ToList();
        var formatted = rows.Select(row => string.Join("|", selected.Select(column => FormatValue(FindValue(row, column, dialect, example.Function))))).Order(StringComparer.Ordinal).ToList();
        return new Snapshot(selected, formatted);
    }

    private static object? FindValue(Dictionary<string, object?> row, string column, string dialect, string function)
    {
        var key = row.Keys.FirstOrDefault(candidate => string.Equals(candidate, column, StringComparison.OrdinalIgnoreCase));
        if (key is null)
            Assert.Fail($"{dialect}: {function} result has no column [{column}].");
        return row[key!];
    }

    private static string FormatValue(object? value)
    {
        switch (value)
        {
            case null or DBNull:
                return "NULL";
            case bool flag:
                return flag ? "1" : "0";
            case DateTime date:
                return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            case DateOnly date:
                return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        // Providers return numbers and dates in their own types or as text, so compare their invariant text.
        var text = (Convert.ToString(value, CultureInfo.InvariantCulture) ?? "NULL").Trim();
        if (IsoDate.IsMatch(text))
            return text[..10];
        if (UsDate.IsMatch(text))
            return DateTime.ParseExact(text, "MM/dd/yyyy", CultureInfo.InvariantCulture).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number))
            return Math.Round(number, 2, MidpointRounding.AwayFromZero).ToString("0.00", CultureInfo.InvariantCulture);
        return text;
    }

    private static OQueryEngine CreateEngine(DialectTarget target, IEnumerable<OQuery.Entity> metadata)
    {
        var dialect = target.CreateDialect();
        // Flat-layout scripts create tables without a schema prefix, so drop the domain's schema for them.
        var entities = target.UsesSchemas
            ? metadata
            : metadata.Select(entity => entity with { DbSchema = null });
        return new OQueryEngine(
            target.Connect(),
            new MetadataProvider(entities),
            new FunctionProvider(dialect),
            dialect);
    }

    private static List<OQuery.Entity> LoadMetadata()
    {
        var domains = NorthStarDomainSqlServerTests.GetDomainsRoot();
        var entities = NorthStarDomainSqlServerTests.LoadDomain(Path.Combine(domains, ExamplesDomain)).ToList();
        var known = entities.Select(entity => entity.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        entities.AddRange(NorthStarDomainSqlServerTests.LoadDomain(Path.Combine(domains, InsuranceDomain))
            .Where(entity => known.Add(entity.Name)));
        return entities;
    }

    private sealed record Snapshot(IReadOnlyList<string> Columns, IReadOnlyList<string> Rows);

    private sealed record BuiltinExample(string Function, string OQuery);

    private sealed record DialectTarget(
        string Name,
        Func<IDbConnection> Connect,
        Func<ISqlDialect> CreateDialect,
        bool UsesSchemas);
}
