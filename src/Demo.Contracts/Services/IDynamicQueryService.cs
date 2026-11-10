using OQuery;

namespace Demo.Contracts.Services;

public interface IDynamicQueryService
{
    string GetSqlQueryString(QueryDefinition query, string? scopeName);
    string GetQueryRequestString(QueryDefinition query);
    QueryDefinition ParseQueryRequestString(string text);
    Task<TableDataDto> ExecuteQueryAsync(
        QueryDefinition query,
        string? scopeName,
        CancellationToken cancellationToken = default);
    Task<TableDataDto> ExecuteContextQueryAsync(
        string text,
        string contextName,
        string? scopeName,
        CancellationToken cancellationToken = default);
}
