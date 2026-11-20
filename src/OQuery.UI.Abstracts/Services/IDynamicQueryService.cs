using OQuery;

namespace OQuery.UI.Abstracts.Services;

public interface IDynamicQueryService
{
    string GetSqlQueryString(QueryDefinition query, string projectId, string domainId);
    string GetQueryRequestString(QueryDefinition query);
    QueryDefinition ParseQueryRequestString(string text);
    Task<TableDataDto> ExecuteQueryAsync(
        QueryDefinition query,
        string projectId,
        string domainId,
        CancellationToken cancellationToken = default);
    Task<TableDataDto> ExecuteContextQueryAsync(
        string text,
        string contextName,
        string projectId,
        string domainId,
        CancellationToken cancellationToken = default);
    string GetContextSqlQueryString(string text, string contextName, string projectId, string domainId);
}
