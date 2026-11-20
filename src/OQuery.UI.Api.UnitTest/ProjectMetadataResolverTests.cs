using NUnit.Framework;
using OQuery;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Services;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class ProjectMetadataResolverTests
{
    [Test]
    public void OnlyListedEntitiesAreExposed()
    {
        var entities = ProjectMetadataResolver.Resolve(CreateFullDomain(), new DomainDto
        {
            Id = "d1",
            Name = "Sub",
            Entities = [new SubDomainEntityDto("Clients")],
        });

        Assert.That(entities.Select(entity => entity.Name), Is.EqualTo(new[] { "Clients" }));
        Assert.That(entities.Single().Relations, Is.Empty);
    }

    [Test]
    public void NameOverridesApplyToEntityAndFieldButKeepPhysicalColumns()
    {
        var entities = ProjectMetadataResolver.Resolve(CreateFullDomain(), new DomainDto
        {
            Id = "d1",
            Name = "Sub",
            Entities =
            [
                new SubDomainEntityDto("Clients")
                {
                    EntityName = "Customers",
                    FieldNames = [new SubDomainFieldDto("Name", "FullName")],
                },
            ],
        });

        var customers = entities.Single();
        Assert.That(customers.Name, Is.EqualTo("Customers"));
        Assert.That(customers.DbTable, Is.EqualTo("Users"));
        var field = customers.Fields.Single(item => item.Name == "FullName");
        Assert.That(field.DbColumn, Is.EqualTo("Name"));
    }

    [Test]
    public void RelationsFollowEntityRenamesAndUsePhysicalColumnsWhenFieldsAreExcluded()
    {
        var entities = ProjectMetadataResolver.Resolve(CreateFullDomain(), new DomainDto
        {
            Id = "d1",
            Name = "Sub",
            Entities =
            [
                new SubDomainEntityDto("Clients") { EntityName = "Customers", ExcludedFields = ["Name"] },
                new SubDomainEntityDto("Policies")
                {
                    RelationNames = [new SubDomainRelationDto("Client", "Owner")],
                },
            ],
        });

        var policies = entities.Single(entity => entity.Name == "Policies");
        var owner = policies.Relations!.Single();
        Assert.That(owner.Name, Is.EqualTo("Owner"));
        Assert.That(owner.RefEntity, Is.EqualTo("Customers"));
        Assert.That(owner.RefKeys.Single().DbColumn, Is.EqualTo("UserId"));
        Assert.That(owner.RefKeys.Single().RefDbColumn, Is.EqualTo("Id"));
    }

    [Test]
    public void RenamingAnExcludedFieldIsRejected()
    {
        Assert.That(() => ProjectMetadataResolver.Resolve(CreateFullDomain(), new DomainDto
        {
            Id = "d1",
            Name = "Sub",
            Entities =
            [
                new SubDomainEntityDto("Clients")
                {
                    ExcludedFields = ["Name"],
                    FieldNames = [new SubDomainFieldDto("Name", "FullName")],
                },
            ],
        }), Throws.ArgumentException);
    }

    private static FullDomainDto CreateFullDomain()
        => new()
        {
            Entities =
            [
                new EntityDto("Clients", [new Field("Id", "Id", DataType.Number), new Field("Name", "Name", DataType.String)], "Users")
                {
                    DbSchema = "dbo",
                    DbTable = "Users",
                },
                new EntityDto("Policies", [new Field("Id", "Id", DataType.Number), new Field("UserId", "UserId", DataType.Number)], "Policies")
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
                    SourceRelationName = "Client",
                    SourceFields = ["UserId"],
                    TargetEntity = "Clients",
                    TargetRelationName = "Policies",
                    TargetFields = ["Id"],
                },
            ],
        };
}
