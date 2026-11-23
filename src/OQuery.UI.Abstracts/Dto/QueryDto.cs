namespace OQuery.UI.Abstracts.Dto;

public sealed record QueryDto(string Entity) : QueryDefinition(Entity)
{
    public required string DomainId { get; init; }
    public required string Name { get; init; }
    public string? RawText { get; init; }
    public string Id { get; init; } = $"{DateTime.Now:yyyyMMdd_HHmmss_fff}_{Guid.NewGuid().ToString("N")[..8]}";
    public bool IsBuiltin { get; init; }
}

public sealed record PlaygroundDto(string Entity)
{
    public string Id { get; init; } = $"{DateTime.Now:yyyyMMdd_HHmmss_fff}_{Guid.NewGuid().ToString("N")[..8]}";

    public required string DomainId { get; init; }

    public string Name { get; init; } = "";

    public List<PlaygroundTabDto> Tabs { get; init; } = new();
}

/// <summary>One editor tab. Content is raw OQuery text, stored without parsing or validation.</summary>
public sealed record PlaygroundTabDto(string Title, string Content);