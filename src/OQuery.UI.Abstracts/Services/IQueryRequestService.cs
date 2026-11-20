using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IQueryRequestService
{
    IReadOnlyList<QueryDto> List(string projectId, string domainId);
    QueryDto? Get(string projectId, string id);
    QueryDto Create(string projectId, QueryDto query);
    QueryDto? Update(string projectId, string id, QueryDto query);
    bool IsBuiltin(string projectId, string id);
    bool Delete(string projectId, string id);
}
