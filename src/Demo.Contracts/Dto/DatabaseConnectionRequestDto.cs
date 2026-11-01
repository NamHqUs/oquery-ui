namespace Demo.Contracts.Dto;

public sealed record DatabaseConnectionRequestDto(
    string? Profile,
    string? Provider,
    string? ConnectionString);

public sealed record DatabaseConnectionResponseDto(
    string Provider,
    string? ProfileName);
