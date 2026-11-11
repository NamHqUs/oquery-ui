namespace Demo.Contracts.Dto;

public sealed record DomainNameDto(string Id, string Name);
public sealed record DomainNameWithDescriptionDto(string Id, string Name, string Description);

public sealed class DomainDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public List<MetadataEntityDto> Entities { get; set; } = [];
    public bool CanDelete { get; set; }
    public bool IsBuiltin { get; set; }

    public List<OQuery.Entity> ToEntities()
        => Entities.Select(entity => entity.ToEntity()).ToList();
}
