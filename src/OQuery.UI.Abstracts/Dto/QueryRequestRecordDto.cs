namespace OQuery.UI.Abstracts.Dto;

/// <summary>A stored query request as raw JSON. The consumer parses Json into a QueryDto.</summary>
public sealed record QueryRequestRecordDto(string Id, string Json, bool IsBuiltin);
