using OQuery;

namespace Demo.Contracts.Dto;

public sealed record MetadataEntityDto(
    string Name,
    List<Field> Fields,
    string RawSql,
    List<Relation>? Relations,
    bool CanDelete)
{
    public static MetadataEntityDto FromEntity(Entity entity, bool canDelete)
        => new(
            entity.Name,
            entity.Fields,
            entity.DbTable ?? entity.Name,
            entity.Relations,
            canDelete);
}
// public sealed record EntityDto(
//    string Id,
//    string Name,
//    string Schema,
//    string RawSql,
//    List<FieldDto> Fields,
//    bool CanDelete) 
// {
//    public EntityDto(string EntityType, string name, string rawSql, List<FieldDto> fields,  bool canDelete)
//        : this(EntityType, Guid.NewGuid().ToString(), name, rawSql, fields, canDelete)
//    {
//    }
// }

// public sealed record FieldDto(
//    string Name,
//    string? DbColumn,
//    string? Expression
//    );

// public record RelationDto(
//    string FromEntityId, 
//    string ToEntityId, 
//    (string DbColumn, string RefDbColumn)[] RelatedDbColumns);

// public sealed record MetadataDto(
//    IReadOnlyList<EntityDto> Entities,
//    IReadOnlyList<RelationDto> Relationships);
