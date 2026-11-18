namespace OQuery.UI.Abstracts.Dto;

public sealed record DatabaseConnectionRequestDto(
    string Provider,
    string ConnectionString);

public sealed record DatabaseConnectionResponseDto(
    string Provider);
