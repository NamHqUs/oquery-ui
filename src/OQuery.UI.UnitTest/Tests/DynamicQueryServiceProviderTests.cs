using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Demo.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Data.SqlClient;
using Npgsql;
using System.Data;
using System.Text.RegularExpressions;

namespace OQuery.UI.UnitTest.Tests;

[TestFixture]
public sealed class DynamicQueryServiceProviderTests
{
    [Test]
    public void SqlServerProviderUsesSqlServerDialect()
    {
        var connectionService = new StubConnectionService(
            new SqlConnection(),
            "SqlServer");
        var service = new DynamicQueryService(
            connectionService,
            new StubMetadataService(),
            new StubOperatorDefinitionService(),
            NullLogger<DynamicQueryService>.Instance);
        var query = new QueryDefinition
        {
            Entity = "User",
            Projection =
            [
                new ProjectionDefinition("Id"),
                new ProjectionDefinition("Name")
            ],
            Page = 1,
            PageSize = 50
        };

        var sql = Regex.Replace(service.GetSqlQueryString(query), @"\s+", " ");

        Assert.That(sql, Does.Contain("SELECT t0.[Id] [Id]"));
        Assert.That(sql, Does.Contain("FROM [dbo].[User] t0"));
        Assert.That(sql, Does.Contain("OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY"));
        Assert.That(sql, Does.Not.Contain("LIMIT 50 OFFSET 0"));
    }

    [Test]
    public void CockroachProviderUsesCockroachDialectAndOperatorTemplate()
    {
        var connectionService = new StubConnectionService(new NpgsqlConnection(), "Cockroach");
        var metadataService = new StubMetadataService();
        var operatorService = new StubOperatorDefinitionService();
        var service = new DynamicQueryService(
            connectionService,
            metadataService,
            operatorService,
            NullLogger<DynamicQueryService>.Instance);
        var query = new QueryDefinition
        {
            Entity = "User",
            Projection = [new ProjectionDefinition("Id")],
            Filter = new ConditionDefinition(
                [
                    new ConditionStatementDefinition(
                    new FieldDefinition("Id"),
                    BinaryOperator.Equals,
                    new FieldDefinition("Id"))
                {
                    OperatorId = "custom:cockroach"
                }])
        };

        var sql = service.GetSqlQueryString(query);

        Assert.That(Regex.Replace(sql, @"\s+", " "), Does.Contain("IS NOT DISTINCT FROM"));
        Assert.That(sql, Does.Not.Contain("/* postgres */"));
        Assert.That(metadataService.RequestedDialects, Has.One.Matches<ISqlDialect>(
            dialect => dialect is CockroachDialect));
    }

    private sealed class StubConnectionService(IDbConnection connection, string provider) : IDbConnectionService
    {
        public IDbConnection CreateConnection() => connection;
        public DatabaseConnectionOptionsDto GetConnectionOptions() => new([], [], false);
        public string? GetCurrentProvider() => provider;
        public string Connect(string profile) => throw new NotSupportedException();
        public void Connect(string provider, string connectionString) => throw new NotSupportedException();
        public void Disconnect() { }
    }

    private sealed class StubMetadataService : IMetadataService
    {
        public List<ISqlDialect> RequestedDialects { get; } = [];

        public IFunctionProvider GetFunctionProvider(ISqlDialect dialect)
        {
            RequestedDialects.Add(dialect);
            return new FunctionProvider(dialect);
        }

        public IMetadataProvider GetMetaProvider()
            => new MetadataProvider(
            [
                new Entity("User", [new Field("Id", "Id"), new Field("Name", "Name")])
            ]);

        public IReadOnlyList<MetadataEntityDto> GetAll() => throw new NotSupportedException();
        public bool IsBuiltin(string entityName) => throw new NotSupportedException();
        public Entity Create(Entity entity) => throw new NotSupportedException();
        public Entity Update(string entityName, Entity entity) => throw new NotSupportedException();
        public void Delete(string entityName) => throw new NotSupportedException();
        public IReadOnlyList<Entity> Reset() => throw new NotSupportedException();
    }

    private sealed class StubOperatorDefinitionService : IOperatorDefinitionService
    {
        public IReadOnlyList<OperatorDefinitionDto> GetAll()
            =>
            [
                new()
                {
                    Id = "custom:cockroach",
                    Name = "Cockroach equality",
                    SqlTemplates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["Postgres"] = "({left} /* postgres */ = {value})",
                        ["Cockroach"] = "({left} IS NOT DISTINCT FROM {value})"
                    }
                }
            ];

        public OperatorDefinitionDto Create(OperatorDefinitionDto dto) => throw new NotSupportedException();
        public OperatorDefinitionDto Update(string operatorId, OperatorDefinitionDto dto) => throw new NotSupportedException();
        public void Delete(string operatorId) => throw new NotSupportedException();
    }
}
