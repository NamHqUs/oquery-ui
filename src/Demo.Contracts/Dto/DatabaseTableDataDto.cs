namespace Demo.Contracts.Dto;

public sealed record DatabaseTableDataDto(
    string Name,
    IReadOnlyList<string> Columns,
    IReadOnlyList<IReadOnlyList<string>> Rows);
