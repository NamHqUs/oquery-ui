using OQuery;

namespace Demo.Contracts.Dto;

public sealed record ReportDto(
    string FileName,
    QueryDefinition Query,
    string? RequestText = null,
    string? Description = null,
    string? ChartType = null)
{
    public bool CanDelete { get; init; } = true;
    public string? Name { get; init; }
}
