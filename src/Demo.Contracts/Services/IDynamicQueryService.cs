using OQuery;

namespace Demo.Contracts.Services;

public interface IDynamicQueryService
{
    string GetSqlQueryString(QueryDefinition query);
    string GetQueryRequestString(QueryDefinition query);
    QueryDefinition ParseQueryRequestString(string text, string entity);
    QueryDefinition ParseQueryRequestString(string text);
    Task<TableDataDto> ExecuteQueryAsync(QueryDefinition query, CancellationToken cancellationToken = default);
    Task<TableDataDto> ExecuteContextQueryAsync(string text, string contextName, CancellationToken cancellationToken = default);
}
