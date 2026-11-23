namespace OQuery.UI.Abstracts.Dto;

public sealed record DomainNameDto(string Id, string Name);
public sealed record DomainNameWithDescriptionDto(string Id, string Name, string Description);

/// <summary>
/// A domain: its own entities and relations, mapped directly to database tables. Every query belongs to one domain,
/// and the domain's metadata is what the engine runs against. Relations use physical columns.
/// </summary>
public sealed class DomainDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public List<EntityDto> Entities { get; set; } = [];
    public List<RelationDto> Relations { get; set; } = [];
}

public sealed record EntityDto(
    string Name,
    List<Field> Fields,
    string RawSql)
{
    public string? DbTable { get; init; } = null;
    public string? DbSchema { get; init; } = null;
    public bool IsRawSql { get; init; } = false;

    public static EntityDto FromEntity(OQuery.Entity entity)
        => new(entity.Name, entity.Fields, entity.DbTable ?? entity.Name)
        {
            DbTable = entity.DbTable,
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
