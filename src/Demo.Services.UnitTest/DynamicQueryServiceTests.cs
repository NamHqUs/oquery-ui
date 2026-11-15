using System.Data;
using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using OQuery;
using OQuery.QueryDefinitions.Parsers;

namespace Demo.Services.UnitTest;

[TestFixture]
internal sealed class DynamicQueryServiceTests
{
    [TestCase("Clients: Id, Name\n  Where Policies HasAny", "EXISTS (")]
    [TestCase("Clients: Id, Name\n  Where Policies HasNone Status = <Active>", "NOT EXISTS (")]
    public void ExistsConditionsReachTheEngineAndRenderSql(string text, string expectedSql)
    {
        var service = CreateService();
        var query = QueryDefinitionOQueryParser.Parse(text);

        var sql = service.GetSqlQueryString(query, "TEST_DOMAIN");

        Assert.That(sql, Does.Contain(expectedSql));
    }

    private static DynamicQueryService CreateService()
        => new(
            new FakeDbConnectionService(),
            new FakeDomainService(),
            new FakeMetadataService(),
            new FakeOperatorDefinitionService(),
            NullLogger<DynamicQueryService>.Instance);

    private static DomainDto CreateDomain()
        => new()
        {
            Id = "TEST_DOMAIN",
            Name = "Test",
            Entities =
            [
                new EntityDto(
                    "Clients",
                    [new Field("Id", "Id", DataType.Number), new Field("Name", "Name", DataType.String)],
                    "Users")
                {
                    DbSchema = "main",
                    DbTable = "Users",
                },
                new EntityDto(
                    "Policies",
                    [
                        new Field("Id", "Id", DataType.Number),
                        new Field("UserId", "UserId", DataType.Number),
                        new Field("Status", "Status", DataType.String),
                    ],
                    "Policies")
                {
                    DbSchema = "in",
                    DbTable = "Policies",
                },
            ],
            Relations =
            [
                new RelationDto
                {
                    SourceEntity = "Policies",
                    SourceRelationName = "Client",
                    SourceFields = ["UserId"],
                    TargetEntity = "Clients",
                    TargetRelationName = "Policies",
                    TargetFields = ["Id"],
                },
            ],
        };

    private sealed class FakeDbConnectionService : IDbConnectionService
    {
        public IDbConnection CreateConnection() => new SqlConnection("Server=localhost;Database=TEST;Connect Timeout=1");
        public string? GetCurrentProvider() => "SqlServer";
        public DatabaseConnectionOptionsDto GetConnectionOptions() => throw new NotSupportedException();
        public string Connect(string profile) => throw new NotSupportedException();
        public void Connect(string provider, string connectionString) => throw new NotSupportedException();
        public void Disconnect() => throw new NotSupportedException();
    }

    private sealed class FakeDomainService : IDomainService
    {
        private readonly DomainDto _domain = CreateDomain();

        public DomainDto GetById(string domainId) => _domain;
        public IReadOnlyList<DomainNameDto> GetAllDomainNames() => throw new NotSupportedException();
        public IReadOnlyList<DomainNameWithDescriptionDto> GetAllDomainNameWithDescriptions() => throw new NotSupportedException();
        public DomainDto Create(DomainDto domain) => throw new NotSupportedException();
        public DomainDto Generate(DomainGenerationRequestDto request) => throw new NotSupportedException();
        public DomainDto Update(string domainId, DomainDto domain) => throw new NotSupportedException();
        public void Delete(string domainId) => throw new NotSupportedException();
    }

    private sealed class FakeMetadataService : IMetadataService
    {
        public IFunctionProvider GetFunctionProvider(ISqlDialect dialect) => new FunctionProvider(dialect);
        public IReadOnlyList<EntityDto> GetAll() => throw new NotSupportedException();
        public IReadOnlyList<Entity> Reset() => throw new NotSupportedException();
        public IMetadataProvider GetMetaProvider() => throw new NotSupportedException();
    }

    private sealed class FakeOperatorDefinitionService : IOperatorDefinitionService
    {
        public IReadOnlyList<OperatorDefinitionDto> GetAll() => [];
        public OperatorDefinitionDto Create(OperatorDefinitionDto dto) => throw new NotSupportedException();
        public OperatorDefinitionDto Update(string operatorId, OperatorDefinitionDto dto) => throw new NotSupportedException();
        public void Delete(string operatorId) => throw new NotSupportedException();
    }
}
