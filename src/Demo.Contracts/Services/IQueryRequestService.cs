using Demo.Contracts.Dto;

namespace Demo.Contracts.Services;

public interface IQueryRequestService
{
    IReadOnlyList<QueryDto> List(string domainId);
    QueryDto? Get(string id);
    QueryDto Create(QueryDto query);
    QueryDto? Update(string id, QueryDto query);
    bool IsBuiltin(string id);
    bool Delete(string id);
}
