using OQuery;

namespace Demo.Contracts.Dto;

public sealed record DomainNameDto(string Id, string Name);
public sealed record DomainNameWithDescriptionDto(string Id, string Name, string Description);

public sealed class DomainDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public List<EntityDto> Entities { get; set; } = [];
    public List<RelationDto> Relations { get; set; } = [];
    public bool CanDelete { get; set; }
    public bool IsBuiltin { get; set; }

    public List<OQuery.Entity> ToEntities()
    {
        var entities = Entities
            .Select(entity => new OQuery.Entity(
                entity.Name,
                entity.Fields,
                entity.DbSchema,
                entity.RawSql,
                [],
                entity.IsRawSql))
            .ToDictionary(entity => entity.Name, StringComparer.OrdinalIgnoreCase);

        foreach (var relation in Relations)
        {
            if (!entities.TryGetValue(relation.SourceEntity, out var source)
                || !entities.TryGetValue(relation.TargetEntity, out var target))
                continue;

            source.Relations?.Add(new Relation(
                relation.SourceRelationName,
                relation.TargetEntity,
                RelationType.Lookup,
                relation.SourceFields.Zip(relation.TargetFields, (sourceField, targetField) =>
                    new RelationItem(sourceField, targetField)).ToList()));
            target.Relations?.Add(new Relation(
                relation.TargetRelationName,
                relation.SourceEntity,
                RelationType.Collection,
                relation.TargetFields.Zip(relation.SourceFields, (targetField, sourceField) =>
                    new RelationItem(targetField, sourceField)).ToList()));
        }

        return entities.Values.ToList();
    }
}

public sealed record EntityDto(
    string Name,
    List<Field> Fields,
    string RawSql)
{
    public string? DbSchema { get; init; }
    public bool IsRawSql { get; init; }

    public static EntityDto FromEntity(OQuery.Entity entity)
        => new(entity.Name, entity.Fields, entity.DbTable ?? entity.Name)
        {
            DbSchema = entity.DbSchema,
            IsRawSql = entity.IsRawSql,
        };
}

public sealed record RelationDto
{
    public string SourceEntity { get; init; } = "";
    public string SourceRelationName { get; init; } = "";
    public IReadOnlyList<string> SourceFields { get; init; } = [];
    public string TargetEntity { get; init; } = "";
    public string TargetRelationName { get; init; } = "";
    public IReadOnlyList<string> TargetFields { get; init; } = [];
}
