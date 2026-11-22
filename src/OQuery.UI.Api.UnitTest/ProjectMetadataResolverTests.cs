using NUnit.Framework;
using OQuery;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Services;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class ProjectMetadataResolverTests
{
    [Test]
    public void DomainEntitiesAndRelationsBecomeEngineMetadata()
    {
        var entities = ProjectMetadataResolver.Resolve(CreateDomain());

        Assert.That(entities.Select(entity => entity.Name), Is.EqualTo(new[] { "Clients", "Policies" }));
        var owner = entities.Single(entity => entity.Name == "Policies").Relations!.Single();
        Assert.That(owner.Name, Is.EqualTo("Owner"));
        Assert.That(owner.RefEntity, Is.EqualTo("Clients"));
        Assert.That(owner.RefKeys.Single().DbColumn, Is.EqualTo("UserId"));
        Assert.That(owner.RefKeys.Single().RefDbColumn, Is.EqualTo("Id"));
        Assert.That(entities.Single(entity => entity.Name == "Clients").Relations!.Single().Type, Is.EqualTo(RelationType.Collection));
    }

    [Test]
    public void RelationToEntityOutsideTheDomainIsRejected()
    {
        var domain = CreateDomain();
        domain.Entities.RemoveAll(entity => entity.Name == "Clients");

        Assert.That(() => ProjectMetadataResolver.Resolve(domain), Throws.ArgumentException);
    }

    private static DomainDto CreateDomain()
        => new()
        {
            Id = "d1",
            Name = "Sales",
            Entities =
            [
                new EntityDto("Clients", [new Field("Id", "Id", DataType.Number)], "Users") { DbSchema = "dbo", DbTable = "Users" },
                new EntityDto(
                    "Policies",
                    [new Field("Id", "Id", DataType.Number), new Field("UserId", "UserId", DataType.Number)],
                    "Policies")
                {
                    DbSchema = "dbo",
                    DbTable = "Policies",
                },
            ],
            Relations =
            [
                new RelationDto
                {
                    SourceEntity = "Policies",
                    SourceRelationName = "Owner",
                    SourceFields = ["UserId"],
                    TargetEntity = "Clients",
                    TargetRelationName = "Policies",
                    TargetFields = ["Id"],
                },
            ],
        };
}
