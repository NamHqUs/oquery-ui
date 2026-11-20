using OQuery;

namespace OQuery.UI.Abstracts.Dto;

public sealed record DomainNameDto(string Id, string Name);
public sealed record DomainNameWithDescriptionDto(string Id, string Name, string Description);

/// <summary>All entities, fields and relations generated from the database schema. Relations use physical columns.</summary>
public sealed class FullDomainDto
{
    public List<EntityDto> Entities { get; set; } = [];
    public List<RelationDto> Relations { get; set; } = [];
}

/// <summary>
/// A sub-domain: exposes a chosen set of FullDomain entities. Overrides are keyed by original names.
/// Only names can change; physical columns and raw SQL are never overridden.
/// </summary>
public sealed class DomainDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    /// <summary>Only listed entities are exposed.</summary>
    public List<SubDomainEntityDto> Entities { get; set; } = [];
}

/// <summary>An exposed entity, identified by its original name in FullDomain.</summary>
public sealed record SubDomainEntityDto(string Entity)
{
    public string? EntityName { get; init; }
    public List<SubDomainFieldDto> FieldNames { get; init; } = [];
    public List<string> ExcludedFields { get; init; } = [];
    public List<SubDomainRelationDto> RelationNames { get; init; } = [];
}

public sealed record SubDomainFieldDto(string Field, string FieldName);

/// <summary>Renames a relation side owned by the entity, identified by the original relation name.</summary>
public sealed record SubDomainRelationDto(string Relation, string RelationName);

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
