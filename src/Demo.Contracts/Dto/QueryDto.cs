using OQuery;

namespace Demo.Contracts.Dto;

public sealed record QueryDto(string Entity) : QueryDefinition(Entity)
{
    public required string Name { get; init; }
    public string Id { get; init; } = $"{DateTime.Now:yyyyMMdd_HHmmss_fff}_{Guid.NewGuid().ToString("N")[..8]}";
    public bool IsBuiltin { get; init; }
}