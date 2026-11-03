using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Services;
using OQuery;

namespace OQuery.UI.UnitTest.Tests;

[TestFixture]
public sealed class ReportServiceYamlTests
{
    private readonly ReportService _service = new(new UnusedReportRepository(), new UnusedUserSectionManager());

    [Test]
    public void QueryWithoutProjectionRoundTripsRelationsWithDefaultLeftJoin()
    {
        var definition = new QueryDefinition
        {
            Entity = "User",
            Relations = [new("Managers", JoinType: null)],
            Contexts = new()
            {
                ["Managers"] = new QueryDefinitionBase
                {
                    Entity = "User",
                    Relations = [new("Managers", JoinType: null)]
                }
            }
        };

        var yaml = _service.GetQueryRequestString(definition);
        var restored = _service.ParseQueryRequestString(yaml, "User");
        var restoredFromText = _service.ParseQueryRequestString(yaml);

        Assert.That(yaml, Does.Contain("Left Join Managers"));
        Assert.That(yaml, Does.Not.Contain("ExtraRelations:"));
        Assert.That(yaml, Does.Not.Contain("RefContextId:"));
        Assert.That(restored.Relations!.Single().RefContext, Is.EqualTo("Managers"));
        Assert.That(restored.Relations!.Single().JoinType, Is.EqualTo(QueryJoinType.Left));
        Assert.That(restored.Contexts!["Managers"].Relations!.Single().JoinType, Is.EqualTo(QueryJoinType.Left));
        Assert.That(restoredFromText.Relations!.Single().RefContext, Is.EqualTo("Managers"));
    }

    [Test]
    public void CanonicalYamlStillRejectsAnEntityChange()
    {
        Assert.That(() => _service.ParseQueryRequestString("""
            Entity: User
            Contexts: {}
            """, "Orders"), Throws.TypeOf<FormatException>()
            .With.Message.EqualTo("Entity cannot be changed in the request structure."));
    }

    [Test]
    public void InlineYamlProjectionIsParsedAsAnArray()
    {
        var query = _service.ParseQueryRequestString("""
            Entity: User
            Projection: [Id, Name]
            """);

        Assert.That(query.Projection.Select(projection => projection.ToText()),
            Is.EqualTo(["Id", "Name"]));
    }

    [Test]
    public void EmptyYamlProjectionItemsAreIgnored()
    {
        var query = _service.ParseQueryRequestString("""
            Entity: User
            Projection:
              -
              - Id
              -
            """);

        Assert.That(query.Projection.Select(projection => projection.ToText()),
            Is.EqualTo(["Id"]));
    }

    private sealed class UnusedUserSectionManager : IUserSectionManager
    {
        public string GetSectionId() => throw new NotSupportedException();
    }

    private sealed class UnusedReportRepository : IReportRepository
    {
        public string CreateId(string userSectionId) => throw new NotSupportedException();
        public IReadOnlyCollection<ReportDto> GetBuiltin() => throw new NotSupportedException();
        public IReadOnlyCollection<ReportDto> GetUserDefined(string userSectionId) => throw new NotSupportedException();
        public ReportDto? Get(string userSectionId, string id) => throw new NotSupportedException();
        public void Save(string userSectionId, ReportDto item) => throw new NotSupportedException();
        public bool Delete(string userSectionId, string id) => throw new NotSupportedException();
    }
}
