namespace Demo.Contracts.Dto;

public sealed record BusinessScopeGenerationRequestDto(
    string Name,
    IReadOnlyList<DatabaseTableSelectionDto> Tables,
    IReadOnlyList<BusinessScopeRelationSelectionDto> Relations);

public sealed record DatabaseTableSelectionDto(
    string Schema,
    string Name,
    IReadOnlyList<string> Columns)
{
    public string? EntityName { get; init; }
    public IReadOnlyList<DatabaseColumnSelectionDto>? ColumnMappings { get; init; }
}

public sealed record DatabaseColumnSelectionDto(
    string DbColumn,
    string Name);

public sealed record BusinessScopeRelationSelectionDto(
    string SourceSchema,
    string SourceTable,
    string TargetSchema,
    string TargetTable,
    string LookupName,
    string CollectionName);
