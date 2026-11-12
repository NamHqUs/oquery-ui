using OQuery;

namespace Demo.Contracts.Services;

public interface IDynamicQueryService
{
    string GetSqlQueryString(QueryDefinition query, string domainId);
    string GetQueryRequestString(QueryDefinition query);
    QueryDefinition ParseQueryRequestString(string text);
    Task<TableDataDto> ExecuteQueryAsync(
        QueryDefinition query,
        string domainId,
        CancellationToken cancellationToken = default);
    Task<TableDataDto> ExecuteContextQueryAsync(
        string text,
        string contextName,
        string domainId,
        CancellationToken cancellationToken = default);
}
