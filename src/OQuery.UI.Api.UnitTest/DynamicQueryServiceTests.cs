using System.Data;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;
using OQuery.UI.Services;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using OQuery.QueryDefinitions.Parsers;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class DynamicQueryServiceTests
{
    [TestCase("Clients: Id, Name\n  Where Any(Policies)", "EXISTS (")]
    [TestCase("Clients: Id, Name\n  Where NotAny(Policies, Status = <Active>)", "NOT EXISTS (")]
    public void ExistsConditionsReachTheEngineAndRenderSql(string text, string expectedSql)
    {
        var service = CreateService();
        var query = QueryDefinitionOQueryParser.Parse(text);

        var sql = service.GetSqlQueryString(query, "PROJECT", "TEST_DOMAIN");

        Assert.That(sql, Does.Contain(expectedSql));
    }

    [Test]
    public void BuiltinCollectionPredicatesKeepTheirPolarityAfterDtoRoundTrip()
    {
        var notAny = new FunctionProvider(new SqliteDialect()).GetFunction("NotAny");

        var restored = FunctionDefinitionDto.FromFunctionDefinition(notAny).ToFunctionDefinition();

        Assert.That(restored.NegatesCollection, Is.True);
    }

    private static DynamicQueryService CreateService()
        => new(
            new FakeDbConnectionService(),
            new FakeProjectService(),
            new FakeFunctionDefinitionService(),
            NullLogger<DynamicQueryService>.Instance);

    private static DomainDto CreateTestDomain()
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
        public void UpdateDbConnection(string provider, string connectionString) => throw new NotSupportedException();
        public void Disconnect() => throw new NotSupportedException();
    }

    private sealed class FakeProjectService : IProjectService
    {
        private readonly DomainDto _domain = CreateTestDomain();

        public IReadOnlyList<OQuery.Entity> ResolveMetadata(string projectId, string domainId)
            => ProjectMetadataResolver.Resolve(_domain);

        public IReadOnlyList<ProjectFileDto> GetAll() => throw new NotSupportedException();
        public ProjectDto GetById(string projectId) => throw new NotSupportedException();
        public ProjectDto Create(ProjectFileDto project) => throw new NotSupportedException();
        public ProjectDto CreateFromDatabase(ProjectFromDatabaseRequestDto request) => throw new NotSupportedException();
        public ProjectDto Update(string projectId, ProjectFileDto project) => throw new NotSupportedException();
        public void Delete(string projectId) => throw new NotSupportedException();
        public IReadOnlyList<DomainNameDto> GetDomainNames(string projectId) => throw new NotSupportedException();
        public DomainDto GetDomain(string projectId, string domainId) => throw new NotSupportedException();
        public DomainDto CreateDomain(string projectId, DomainDto domain) => throw new NotSupportedException();
        public DomainDto UpdateDomain(string projectId, string domainId, DomainDto domain) => throw new NotSupportedException();
        public void DeleteDomain(string projectId, string domainId) => throw new NotSupportedException();
    }

    private sealed class FakeFunctionDefinitionService : IFunctionDefinitionService
    {
        public IReadOnlyList<FunctionDefinitionDto> GetAll(string projectId) => [];
        public FunctionDefinitionDto Create(string projectId, FunctionDefinitionDto dto) => throw new NotSupportedException();
        public FunctionDefinitionDto Update(string projectId, string functionName, FunctionDefinitionDto dto) => throw new NotSupportedException();
        public void Delete(string projectId, string functionName) => throw new NotSupportedException();
    }
}
