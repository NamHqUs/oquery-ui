namespace Demo.Contracts.Dto;

public sealed class BusinessScopeDto
{
    public string Name { get; set; } = "";
    public List<MetadataEntityDto> Entities { get; set; } = [];
    public bool CanDelete { get; set; }
    public bool IsBuiltin { get; set; }
}
