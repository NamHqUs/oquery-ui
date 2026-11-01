using OQuery;

namespace Demo.Contracts.Services;

public interface IDynamicQueryService
{
    string GetSqlQueryString(QueryDefinition query);
    Task<TableDataDto> ExecuteQueryAsync(QueryDefinition query, CancellationToken cancellationToken = default);
}
