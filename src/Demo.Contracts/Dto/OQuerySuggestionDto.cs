namespace Demo.Contracts.Dto;

public sealed record OQuerySuggestionRequest(
    string? Text,
    int Line,
    int Column,
    int DocumentVersion = 0);

public sealed record OQuerySuggestionItem(
    string Label,
    string InsertText,
    string Detail,
    string Kind,
    int SortOrder);

public sealed record OQuerySuggestionResponse(
    IReadOnlyList<OQuerySuggestionItem> Items,
    int ReplaceStart,
    int ReplaceEnd,
    int DocumentVersion);
