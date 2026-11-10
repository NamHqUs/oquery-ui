namespace Demo.Contracts.Dto;

public sealed class DomainDto
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public List<MetadataEntityDto> Entities { get; set; } = [];
    public bool CanDelete { get; set; }
    public bool IsBuiltin { get; set; }
}
