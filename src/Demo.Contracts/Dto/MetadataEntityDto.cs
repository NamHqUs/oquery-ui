using OQuery;

namespace Demo.Contracts.Dto;

public sealed record MetadataEntityDto(
    string Name,
    List<Field> Fields,
    string RawSql,
    List<Relation>? Relations)
{
    public string? DbSchema { get; init; }

    public static MetadataEntityDto FromEntity(Entity entity)
        => new(
            entity.Name,
            entity.Fields,
            entity.DbTable ?? entity.Name,
            entity.Relations)
        {
            DbSchema = entity.DbSchema,
        };

    public Entity ToEntity()
        => new(Name, Fields, DbSchema, RawSql, Relations);
}
